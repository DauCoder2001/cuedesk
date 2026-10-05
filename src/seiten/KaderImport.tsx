import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { personName } from '../namen';
import { LIGEN } from '../liga';
import { spielerAbgleichen } from '../mannschaftspass';
import { useUngespeichert } from '../ungespeichert';
import type { Mannschaftspass, PassMannschaft, PassSpieler, Treffer } from '../mannschaftspass';
import type { Mannschaft, MannschaftSpieler, Person, PersonIntern } from '../datenbank.types';

// Vorschau zum eingelesenen Mannschaftspass (src/mannschaftspass.ts): je
// Mannschaft die Spieler mit ihrem Gegenstueck in CueDesk. Gespeichert wird
// erst mit "Uebernehmen": Mannschaften anlegen oder abgleichen, neue Spieler
// als Mitglieder anlegen, Verbandsnummern eintragen, Kader setzen.

type Zeile = {
  schluessel: string; // Team-Nummer und Position
  mannschaft: PassMannschaft;
  spieler: PassSpieler;
  treffer: Treffer;
};

const DATUM = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

const TREFFER_TEXT: Record<Treffer['art'], string> = {
  dbu: 'vorhanden (DBU-Nr.)',
  pass: 'vorhanden (Pass-Nr.)',
  name: 'gleicher Name',
  aehnlich: 'ähnlicher Name',
  neu: 'wird angelegt'
};

export default function KaderImport({
  verein,
  pass,
  personen,
  mannschaften,
  kader,
  fertig,
  abbrechen
}: {
  verein: { id: string; name: string; kurzname: string };
  pass: Mannschaftspass;
  personen: Person[];
  mannschaften: Mannschaft[];
  kader: MannschaftSpieler[];
  fertig: (meldung: string, saison: string) => void;
  abbrechen: () => void;
}) {
  const [intern, setIntern] = useState<PersonIntern[] | null>(null);
  const [aus, setAus] = useState<Set<string>>(new Set()); // abgewaehlte Zeilen
  const [alsNeu, setAlsNeu] = useState<Set<string>>(new Set()); // Namenstreffer, die doch neu sind
  const [kaderKuerzen, setKaderKuerzen] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('personen_intern')
      .select('*')
      .eq('verein_id', verein.id)
      .then(({ data, error }) => {
        if (error) setFehler(error.message);
        setIntern(data ?? []);
      });
  }, [verein.id]);

  const personVon = useMemo(() => new Map(personen.map((p) => [p.id, p])), [personen]);
  const mannschaftName = (m: PassMannschaft) => `${verein.kurzname || verein.name} ${m.nummer}`;
  const vorhanden = (m: PassMannschaft) =>
    mannschaften.find((x) => x.saison === pass.saison && x.name === mannschaftName(m)) ?? null;

  const zeilen = useMemo<Zeile[]>(() => {
    if (!intern) return [];
    const vergleich = personen.map((p) => {
      const i = intern.find((x) => x.person_id === p.id);
      return { ...p, passnummer: i?.passnummer ?? null, dbu_nummer: i?.dbu_nummer ?? null };
    });
    return pass.mannschaften.flatMap((m) =>
      m.spieler.map((s) => ({
        schluessel: `${m.nummer}-${s.position}`,
        mannschaft: m,
        spieler: s,
        treffer: spielerAbgleichen(s, vergleich)
      }))
    );
  }, [pass, personen, intern]);

  // Person, die eine Zeile am Ende bekommt: vorhanden oder neu (null)
  const zielVon = (z: Zeile): string | null =>
    z.treffer.art === 'neu' || alsNeu.has(z.schluessel) ? null : z.treffer.person_id;

  const gewaehlt = zeilen.filter((z) => !aus.has(z.schluessel));
  const anzahlNeu = gewaehlt.filter((z) => zielVon(z) === null).length;
  const anzahlVorhanden = gewaehlt.length - anzahlNeu;
  const anzahlPruefen = gewaehlt.filter((z) => z.treffer.art === 'name' || z.treffer.art === 'aehnlich').length;

  // Wer die Seite verlaesst, ohne zu uebernehmen, wird gefragt
  useUngespeichert('kaderimport', true, 'Der eingelesene Mannschaftspass', () => uebernehmen());

  async function uebernehmen(): Promise<boolean> {
    setFehler(null);
    setArbeitet(true);
    try {
      const saisonIds = mannschaften.filter((x) => x.saison === pass.saison).map((x) => x.id);
      let neueMannschaften = 0;
      let neueSpieler = 0;
      let ergaenzt = 0;
      // Steht jemand in zwei Mannschaften, wird er nur einmal angelegt
      const angelegt = new Map<string, string>();
      const kennung = (s: PassSpieler) => s.dbu_nummer ?? s.passnummer ?? `${s.vorname}|${s.nachname}`.toLowerCase();

      for (const m of pass.mannschaften) {
        const eigene = gewaehlt.filter((z) => z.mannschaft === m);
        // 1. Mannschaft anlegen oder Liga, Staffel und Nummer nachziehen
        const satz = { liga: m.liga, staffel: m.staffel, rang: m.nummer };
        let mannschaftId = vorhanden(m)?.id ?? null;
        if (mannschaftId) {
          const { error } = await supabase.from('mannschaften').update(satz).eq('id', mannschaftId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('mannschaften')
            .insert({ verein_id: verein.id, name: mannschaftName(m), saison: pass.saison, ...satz })
            .select()
            .single();
          if (error || !data) throw error ?? new Error('Mannschaft konnte nicht angelegt werden.');
          mannschaftId = data.id;
          saisonIds.push(data.id);
          neueMannschaften++;
        }

        // 2. Spieler anlegen oder ergaenzen
        const personIds: string[] = [];
        for (const z of eigene) {
          let personId = zielVon(z) ?? angelegt.get(kennung(z.spieler)) ?? null;
          if (personId === null) {
            const { data, error } = await supabase
              .from('personen')
              .insert({ verein_id: verein.id, vorname: z.spieler.vorname, nachname: z.spieler.nachname, status: 'mitglied' })
              .select()
              .single();
            if (error || !data) throw error ?? new Error('Spieler konnte nicht angelegt werden.');
            personId = data.id;
            angelegt.set(kennung(z.spieler), data.id);
            neueSpieler++;
          } else if (zielVon(z) !== null) {
            ergaenzt++;
            if (personVon.get(personId)?.status !== 'mitglied') {
              const { error } = await supabase.from('personen').update({ status: 'mitglied' }).eq('id', personId);
              if (error) throw error;
            }
          }
          const nummern: Partial<PersonIntern> = {};
          if (z.spieler.passnummer) nummern.passnummer = z.spieler.passnummer;
          if (z.spieler.dbu_nummer) nummern.dbu_nummer = z.spieler.dbu_nummer;
          if (Object.keys(nummern).length > 0) {
            const { error } = await supabase
              .from('personen_intern')
              .upsert({ person_id: personId, verein_id: verein.id, ...nummern });
            if (error) throw error;
          }
          personIds.push(personId);
        }

        // 3. Kader: Stammspieler dieser Mannschaft, Kapitaen und Berechtigung wie im Pass
        if (eigene.length > 0) {
          const { error } = await supabase.from('mannschaft_spieler').upsert(
            eigene.map((z, i) => ({
              verein_id: verein.id,
              mannschaft_id: mannschaftId as string,
              person_id: personIds[i],
              stammspieler: true,
              kapitaen: z.spieler.kapitaen,
              berechtigt_ab: z.spieler.berechtigt_ab,
              position: z.spieler.position
            })),
            { onConflict: 'mannschaft_id,person_id' }
          );
          if (error) throw error;
          // Stammspieler ist jeder nur in einer Mannschaft der Saison
          const andere = saisonIds.filter((id) => id !== mannschaftId);
          if (andere.length > 0) {
            const { error: e2 } = await supabase
              .from('mannschaft_spieler')
              .update({ stammspieler: false })
              .in('person_id', personIds)
              .in('mannschaft_id', andere);
            if (e2) throw e2;
          }
          // Kapitaen gibt es je Mannschaft nur einen
          const kapitaen = eigene.findIndex((z) => z.spieler.kapitaen);
          if (kapitaen >= 0) {
            const { error: e3 } = await supabase
              .from('mannschaft_spieler')
              .update({ kapitaen: false })
              .eq('mannschaft_id', mannschaftId as string)
              .neq('person_id', personIds[kapitaen]);
            if (e3) throw e3;
          }
        }

        // 4. Auf Wunsch: wer nicht mehr im Pass steht, verlaesst den Kader
        if (kaderKuerzen && vorhanden(m)) {
          const imPass = new Set(personIds);
          const weg = kader.filter((k) => k.mannschaft_id === mannschaftId && !imPass.has(k.person_id)).map((k) => k.id);
          if (weg.length > 0) {
            const { error } = await supabase.from('mannschaft_spieler').delete().in('id', weg);
            if (error) throw error;
          }
        }
      }

      const teile = [
        `${pass.mannschaften.length} ${pass.mannschaften.length === 1 ? 'Mannschaft' : 'Mannschaften'} übernommen (${neueMannschaften} neu)`,
        `${neueSpieler} Spieler angelegt`,
        `${ergaenzt} vorhandene ergänzt`
      ];
      fertig(`Mannschaftspass eingelesen: ${teile.join(', ')}.`, pass.saison);
      return true;
    } catch (e) {
      setFehler(
        `Übernehmen abgebrochen: ${(e as { message?: string })?.message ?? String(e)}. Bereits Gespeichertes bleibt; ein erneutes Einlesen gleicht es ab.`
      );
      return false;
    } finally {
      setArbeitet(false);
    }
  }

  const fremderVerein =
    pass.verein.toLowerCase() !== verein.kurzname.toLowerCase() && pass.verein.toLowerCase() !== verein.name.toLowerCase();

  return (
    <section className="block kaderimport">
      <div className="bearbeitenkopf">
        <div>
          <h2>Mannschaftspass {pass.verein}</h2>
          <p className="hinweis">
            Saison {pass.saison} · {pass.mannschaften.length} Mannschaften · {zeilen.length} Spieler. Gelesen im Browser, die
            Datei wird nicht hochgeladen. Gespeichert wird erst mit „Übernehmen“.
          </p>
          {fremderVerein && (
            <p className="fehler">
              Der Pass gehört laut PDF zu „{pass.verein}“. Eingelesen wird in „{verein.name}“.
            </p>
          )}
        </div>
      </div>

      {!intern && <p className="hinweis">Spieler werden abgeglichen …</p>}

      {intern &&
        pass.mannschaften.map((m) => {
          const alt = vorhanden(m);
          return (
            <div key={m.nummer} className="importmannschaft">
              <h3>
                {mannschaftName(m)}
                <span className={alt ? 'marke' : 'marke gutmarke'}>
                  {alt ? 'vorhanden, Kader wird abgeglichen' : 'Mannschaft neu'}
                </span>
              </h3>
              <p className="hinweis">
                {m.liga ? LIGEN[m.liga].name : 'ohne Liga'}
                {m.staffel ? ` · Staffel ${m.staffel}` : ''} · Nummer {m.nummer} im Mannschaftspass
              </p>
              <table className="tabelle kompakt">
                <thead>
                  <tr>
                    <th style={{ width: '28px' }} />
                    <th className="namenspalte">Name</th>
                    <th>Pass-Nr.</th>
                    <th>DBU-Nr.</th>
                    <th>Berechtigt ab</th>
                    <th>Kapitän</th>
                    <th>In CueDesk</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen
                    .filter((z) => z.mannschaft === m)
                    .map((z) => {
                      const person = z.treffer.art === 'neu' ? null : personVon.get(z.treffer.person_id);
                      const pruefen = z.treffer.art === 'name' || z.treffer.art === 'aehnlich';
                      return (
                        <tr key={z.schluessel} className={aus.has(z.schluessel) ? 'gespielt' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              title="Diesen Spieler übernehmen"
                              checked={!aus.has(z.schluessel)}
                              onChange={(e) => {
                                const neu = new Set(aus);
                                if (e.target.checked) neu.delete(z.schluessel);
                                else neu.add(z.schluessel);
                                setAus(neu);
                              }}
                            />
                          </td>
                          <td>{personName(z.spieler)}</td>
                          <td>{z.spieler.passnummer ?? '–'}</td>
                          <td>{z.spieler.dbu_nummer ?? '–'}</td>
                          <td>{DATUM(z.spieler.berechtigt_ab)}</td>
                          <td>{z.spieler.kapitaen ? 'ja' : '–'}</td>
                          <td>
                            <span className={z.treffer.art === 'neu' ? 'marke gutmarke' : pruefen ? 'marke warnmarke' : 'marke'}>
                              {TREFFER_TEXT[z.treffer.art]}
                              {person && `: ${personName(person)}`}
                            </span>
                            {person && person.status !== 'mitglied' && <span className="marke">wird Mitglied</span>}
                            {pruefen && (
                              <select
                                className="klein"
                                title="Ist das dieselbe Person oder jemand anderes?"
                                value={alsNeu.has(z.schluessel) ? 'neu' : 'derselbe'}
                                onChange={(e) => {
                                  const neu = new Set(alsNeu);
                                  if (e.target.value === 'neu') neu.add(z.schluessel);
                                  else neu.delete(z.schluessel);
                                  setAlsNeu(neu);
                                }}
                              >
                                <option value="derselbe">ist derselbe</option>
                                <option value="neu">neu anlegen</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          );
        })}

      {intern && (
        <>
          <label className="ankreuz">
            <input type="checkbox" checked={kaderKuerzen} onChange={(e) => setKaderKuerzen(e.target.checked)} />
            <span>
              Spieler, die nicht mehr im Pass stehen, aus dem Kader nehmen
              <small>Gilt nur für vorhandene Mannschaften. Spieler des Vereins bleiben sie.</small>
            </span>
          </label>
          {fehler && <p className="fehler">{fehler}</p>}
          <div className="knopfpaar rechts">
            <span className="hinweis zaehlstand">
              {anzahlNeu} Spieler neu · {anzahlVorhanden} vorhanden
              {anzahlPruefen > 0 ? ` · ${anzahlPruefen} bitte prüfen` : ''}
            </span>
            <button
              type="button"
              title="Den Mannschaftspass verwerfen, nichts wird gespeichert"
              onClick={abbrechen}
              disabled={arbeitet}
            >
              Abbrechen
            </button>
            <button type="button" title="Mannschaften und Spieler wie angezeigt speichern" onClick={() => void uebernehmen()} disabled={arbeitet}>
              {arbeitet ? 'Wird übernommen …' : 'Übernehmen'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
