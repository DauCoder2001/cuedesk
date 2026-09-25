import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { personName } from '../namen';
import { nameTeilen, personZuName, spielberichtLesen, spielberichtText } from '../spielbericht';
import { spielplan } from '../liga';
import type { BerichtPartie, Spielbericht } from '../spielbericht';
import type { Ausspielziele } from '../liga';
import type { Partie, Person, Turnier } from '../datenbank.types';

// Spielbericht des Verbands einlesen: Adresse eingeben, Vorschau ansehen,
// dann übernehmen. Geholt wird die Seite von der Serverfunktion
// "spielbericht"; ausgewertet wird sie in src/spielbericht.ts.

const DISZIPLIN_TEXT: Record<string, string> = {
  '14-1': '14.1',
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball'
};

type Zeile = {
  partie: BerichtPartie;
  unser: string; // Name auf unserer Seite
  gegner: string;
  unsererId: string | null;
  gegnerId: string | null;
};

export default function SpielberichtImport({
  turnier,
  liga,
  personen,
  partien,
  schliessen,
  fertig
}: {
  turnier: Turnier;
  liga: { heim: boolean; gegner: string; eigene: string; ziele: Ausspielziele };
  personen: Person[];
  partien: Partie[];
  schliessen: () => void;
  fertig: () => void;
}) {
  const [adresse, setAdresse] = useState('');
  const [bericht, setBericht] = useState<Spielbericht | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  // Wer aus unserem Verein gespielt hat: erkannt oder von Hand gewaehlt
  const [zuordnung, setZuordnung] = useState<Record<number, string>>({});

  const mitglieder = useMemo(() => personen.filter((p) => p.status !== 'gast'), [personen]);
  const gaeste = useMemo(() => personen.filter((p) => p.status === 'gast'), [personen]);
  const plan = useMemo(() => spielplan(liga.ziele), [liga.ziele]);

  // Im Bericht steht Heim links. Unsere Seite hängt vom Heimrecht ab.
  const zeilen: Zeile[] = useMemo(() => {
    if (!bericht) return [];
    return bericht.partien.map((p) => {
      const unser = liga.heim ? p.heim : p.gast;
      const gegner = liga.heim ? p.gast : p.heim;
      return {
        partie: p,
        unser,
        gegner,
        unsererId: zuordnung[p.nr] ?? personZuName(unser, mitglieder)?.id ?? null,
        gegnerId: personZuName(gegner, gaeste)?.id ?? null
      };
    });
  }, [bericht, liga.heim, mitglieder, gaeste, zuordnung]);

  const seiteVertauscht = useMemo(() => {
    if (!bericht) return false;
    // Steht unsere Mannschaft im Bericht auf der anderen Seite als bei uns?
    const unsere = liga.heim ? bericht.heimMannschaft : bericht.gastMannschaft;
    return Boolean(unsere) && !unsere.toLowerCase().includes((liga.eigene || '').slice(0, 5).toLowerCase());
  }, [bericht, liga.heim, liga.eigene]);

  async function lesen() {
    setFehler(null);
    setMeldung(null);
    setBericht(null);
    setZuordnung({});
    if (!adresse.trim()) return setFehler('Bitte die Adresse des Spielberichts eingeben.');
    setArbeitet(true);
    const { data, error } = await supabase.functions.invoke('spielbericht', { body: { url: adresse.trim() } });
    setArbeitet(false);
    if (error) return setFehler(`Die Seite konnte nicht geholt werden: ${error.message}`);
    const antwort = data as { html?: string; fehler?: string };
    if (antwort?.fehler) return setFehler(antwort.fehler);
    if (!antwort?.html) return setFehler('Die Antwort enthält keine Seite.');
    const gelesen = spielberichtLesen(spielberichtText(antwort.html));
    if (!gelesen) return setFehler('Auf dieser Seite steht kein Spielbericht mit Partien.');
    setBericht(gelesen);
  }

  // Fehlende Gegner als Gäste anlegen und die Zuordnung ergänzen
  async function gaesteAnlegen(offen: Zeile[]): Promise<Map<string, string>> {
    const karte = new Map<string, string>();
    const namen = [...new Set(offen.map((z) => z.gegner).filter(Boolean))];
    for (const name of namen) {
      const { vorname, nachname } = nameTeilen(name);
      const { data, error } = await supabase
        .from('personen')
        .insert({
          verein_id: turnier.verein_id,
          vorname,
          nachname,
          anzeigename: `${name} (${liga.gegner})`,
          status: 'gast'
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Gast nicht angelegt.');
      karte.set(name, data.id);
    }
    return karte;
  }

  async function uebernehmen() {
    if (!bericht) return;
    setFehler(null);
    setArbeitet(true);
    try {
      // Geschrieben wird nur, was vollstaendig zugeordnet ist. Gaeste werden
      // erst dafuer angelegt, damit keine Karteileichen entstehen.
      const zuSchreiben = zeilen.filter((z) => z.unser && z.gegner && z.unsererId);
      if (zuSchreiben.length === 0) {
        setArbeitet(false);
        setFehler(
          'Kein Spieler eures Vereins erkannt. Stimmt das Heimrecht des Spieltags, und sind die Namen wie im Bericht geschrieben?'
        );
        return;
      }
      const neueGaeste = await gaesteAnlegen(zuSchreiben.filter((z) => !z.gegnerId));

      for (const z of zuSchreiben) {
        const p = z.partie;
        const unsererId = z.unsererId as string;
        const gegnerId = z.gegnerId ?? neueGaeste.get(z.gegner) ?? null;
        if (!gegnerId) continue;

        const spieler_a = liga.heim ? unsererId : gegnerId;
        const spieler_b = liga.heim ? gegnerId : unsererId;
        const spiel = plan.find((s) => s.runde === p.runde && s.paarung === p.paarung);
        const vorhanden = partien.find(
          (x) => x.runde === (p.runde === 'hin' ? 1 : 2) && x.paarung === p.paarung
        );
        const satz = {
          spieler_a,
          spieler_b,
          ergebnis_a: p.ergebnis ? p.ergebnis[0] : null,
          ergebnis_b: p.ergebnis ? p.ergebnis[1] : null,
          status: (p.ergebnis ? 'beendet' : 'geplant') as Partie['status'],
          beendet: p.ergebnis ? new Date(`${turnier.datum}T20:00:00`).toISOString() : null
        };

        let partieId = vorhanden?.id ?? null;
        if (vorhanden) {
          const { error } = await supabase.from('partien').update(satz).eq('id', vorhanden.id);
          if (error) throw new Error(error.message);
        } else {
          const { data, error } = await supabase
            .from('partien')
            .insert({
              verein_id: turnier.verein_id,
              turnier_id: turnier.id,
              disziplin: p.disziplin,
              datum: turnier.datum,
              phase: p.runde,
              runde: p.runde === 'hin' ? 1 : 2,
              paarung: p.paarung,
              race_to: spiel?.ziel ?? null,
              vorgabe_a: 0,
              vorgabe_b: 0,
              ...satz
            })
            .select('id')
            .single();
          if (error || !data) throw new Error(error?.message ?? 'Partie nicht angelegt.');
          partieId = data.id;
        }

        // 14.1: Punkte, Aufnahmen und Höchstserien mitnehmen
        if (partieId && p.disziplin === '14-1' && p.punkte) {
          const { error } = await supabase.from('partien_141').upsert({
            partie_id: partieId,
            verein_id: turnier.verein_id,
            ziel_punkte: liga.ziele.punkte141,
            ziel_aufnahmen: liga.ziele.aufnahmen141,
            // Der Bericht nennt nur eine Aufnahmenzahl für beide Spieler
            aufnahmen_a: p.aufnahmen,
            aufnahmen_b: p.aufnahmen,
            hoechstserie_a: p.hoechstserien?.[0],
            hoechstserie_b: p.hoechstserien?.[1]
          });
          if (error) throw new Error(error.message);
        }

        // Wer spielt, steht auch in der Teilnehmerliste
        for (const id of [spieler_a, spieler_b]) {
          await supabase
            .from('turnier_teilnehmer')
            .upsert({ turnier_id: turnier.id, person_id: id, verein_id: turnier.verein_id }, { onConflict: 'turnier_id,person_id' });
        }
      }
      setMeldung(`Spielbericht übernommen: ${zuSchreiben.length} Partien.`);
      setArbeitet(false);
      fertig();
    } catch (x) {
      setArbeitet(false);
      setFehler(x instanceof Error ? x.message : String(x));
    }
  }

  return (
    <div className="dialoghintergrund" onClick={schliessen}>
      <div className="dialog breit" onClick={(e) => e.stopPropagation()}>
        <h2>Spielbericht einlesen</h2>
        <p className="hinweis">
          Adresse des Berichts von billard-niedersachsen.de einfügen. Es wird nur gelesen; gespeichert wird erst mit
          „Übernehmen“.
        </p>
        <div className="zeile">
          <input
            value={adresse}
            placeholder="z. B. https://billard-niedersachsen.de/sb_spielbericht.php?p=..."
            onChange={(e) => setAdresse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void lesen()}
            style={{ flex: '1 1 320px' }}
          />
          <button type="button" title="Den Spielbericht lesen und als Vorschau zeigen. Gespeichert wird noch nichts." onClick={() => void lesen()} disabled={arbeitet}>
            Lesen
          </button>
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}

        {bericht && (
          <>
            <p className="hinweis">
              {bericht.heimMannschaft} gegen {bericht.gastMannschaft}
              {bericht.datum ? ` · ${new Date(`${bericht.datum}T12:00:00`).toLocaleDateString('de-DE')}` : ''}
              {bericht.endstand ? ` · Endstand ${bericht.endstand[0]} : ${bericht.endstand[1]}` : ''}
            </p>
            {seiteVertauscht && (
              <div className="pausehinweis">
                <strong>Prüfen:</strong> Im Bericht steht auf unserer Seite „
                {liga.heim ? bericht.heimMannschaft : bericht.gastMannschaft}“. Stimmt das Heimrecht dieses Spieltags?
              </div>
            )}
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Disziplin</th>
                  <th>{liga.eigene}</th>
                  <th>{liga.gegner}</th>
                  <th>Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.partie.nr}>
                    <td>{z.partie.nr}</td>
                    <td>{DISZIPLIN_TEXT[z.partie.disziplin]}</td>
                    <td>
                      <div>{z.unser || <span className="hinweis">offen</span>}</div>
                      {z.unser && (
                        <select
                          value={z.unsererId ?? ''}
                          onChange={(e) => setZuordnung({ ...zuordnung, [z.partie.nr]: e.target.value })}
                        >
                          <option value="">– nicht übernehmen –</option>
                          {mitglieder.map((m) => (
                            <option key={m.id} value={m.id}>
                              {personName(m)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {z.gegner || <span className="hinweis">offen</span>}
                      {z.gegner && !z.gegnerId && <span className="hinweis"> · wird als Gast angelegt</span>}
                    </td>
                    <td>
                      {z.partie.ergebnis ? `${z.partie.ergebnis[0]} : ${z.partie.ergebnis[1]}` : '–'}
                      {z.partie.aufnahmen ? <span className="hinweis"> · {z.partie.aufnahmen} Aufn.</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hinweis">
              Übernommen werden nur Partien, bei denen unser Spieler erkannt wurde. Vorhandene Partien dieses Spieltags
              werden überschrieben.
            </p>
          </>
        )}

        <div className="knopfpaar">
          {bericht && (
            <button type="button" title="Schreibt die ausgewählten Partien in die Begegnung." onClick={() => void uebernehmen()} disabled={arbeitet}>
              Übernehmen
            </button>
          )}
          <button type="button" onClick={schliessen}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
