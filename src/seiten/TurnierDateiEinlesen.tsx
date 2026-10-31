import { useState } from 'react';
import { supabase } from '../supabase';
import { nameZerlegen, personName } from '../namen';
import type { Person } from '../datenbank.types';
import { useSitzung } from '../sitzung';
import { ratingAn } from '../vereinseinstellungen';
import { DATEI_MODI, altIdsZu, dateiLesen, disziplinAusText, eigeneId, namenVon, phaseAusText } from '../turnier-datei';
import type { DateiTurnier } from '../turnier-datei';

// Turnier-Datei aus TurnierPilot oder einem anderen CueDesk-Verein einlesen
// (turnier-datei.ts). Erst Vorschau und Namen zuordnen, geschrieben wird mit
// "Einlesen". Die Turniere kommen ohne Serie ins Archiv, fuers Rating nur mit Haken.

type Zeile = DateiTurnier & { status: 'neu' | 'vorhanden' | 'ungueltig'; grund: string };

const GAST = 'gast';

export default function TurnierDateiEinlesen({
  vereinId,
  schliessen,
  fertig
}: {
  vereinId: string;
  schliessen: () => void;
  fertig: () => Promise<void> | void;
}) {
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [meldungen, setMeldungen] = useState<string[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  const [werten, setWerten] = useState(false);
  // Ohne Vereins-Rating gibt es den Haken nicht; die Turniere kommen ungewertet ins Archiv
  const mitRating = ratingAn(useSitzung().verein);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<string | null>(null);

  const neue = zeilen.filter((z) => z.status === 'neu');
  const namen = [...new Set(neue.flatMap(namenVon))].sort((a, b) => a.localeCompare(b, 'de'));

  async function lesen(datei: File) {
    setFehler(null);
    setErgebnis(null);
    setZeilen([]);
    setMeldungen([]);
    setDateiname(datei.name);
    try {
      const { turniere, meldungen: hinweise } = dateiLesen(JSON.parse(await datei.text()));
      const [{ data: vorhanden, error: e1 }, { data: leute, error: e2 }] = await Promise.all([
        supabase.from('turniere').select('id, name, datum, alt_id').eq('verein_id', vereinId),
        supabase.from('personen').select('*').eq('verein_id', vereinId)
      ]);
      if (e1 || e2) throw new Error((e1 ?? e2)?.message);
      const bestand = vorhanden ?? [];
      // Schon da: gleiche Herkunft, das eigene Turnier zurueck oder gleicher Name am selben Tag
      const geprueft: Zeile[] = turniere.map((t) => {
        if (!DATEI_MODI.includes(t.modus as (typeof DATEI_MODI)[number])) {
          return { ...t, status: 'ungueltig', grund: `Modus „${t.modus || 'unbekannt'}“ kennt CueDesk hier nicht` };
        }
        if (!disziplinAusText(t.disziplin)) {
          return { ...t, status: 'ungueltig', grund: `Disziplin „${t.disziplin || 'unbekannt'}“ kennt CueDesk nicht` };
        }
        const ids = altIdsZu(t.kennung);
        const eigen = eigeneId(t.kennung);
        const doppelt = bestand.some(
          (b) => (b.alt_id && ids.includes(b.alt_id)) || b.id === eigen || (b.name === t.name && b.datum === t.datum)
        );
        return doppelt ? { ...t, status: 'vorhanden', grund: 'schon vorhanden, wird übersprungen' } : { ...t, status: 'neu', grund: 'neu' };
      });
      const liste = (leute ?? []).slice().sort((a, b) => personName(a).localeCompare(personName(b), 'de'));
      // Namen, die es schon gibt, gleich vorschlagen
      const vorschlag: Record<string, string> = {};
      for (const name of new Set(geprueft.filter((z) => z.status === 'neu').flatMap(namenVon))) {
        const klein = name.toLowerCase();
        const treffer = liste.find((p) => personName(p).toLowerCase() === klein || (p.anzeigename ?? '').toLowerCase() === klein);
        vorschlag[name] = treffer?.id ?? GAST;
      }
      setPersonen(liste);
      setZuordnung(vorschlag);
      setZeilen(geprueft);
      setMeldungen(hinweise);
    } catch (e) {
      setFehler(`Die Datei ließ sich nicht lesen: ${(e as Error).message}`);
    }
  }

  async function einlesen() {
    setLaeuft(true);
    setFehler(null);
    try {
      // 1. Namen: zugeordnete Spieler oder neue Gaeste
      const personNachName = new Map<string, string>();
      let gaeste = 0;
      for (const name of namen) {
        const wahl = zuordnung[name] ?? GAST;
        if (wahl !== GAST) {
          personNachName.set(name, wahl);
          continue;
        }
        const { data, error } = await supabase
          .from('personen')
          .insert({ verein_id: vereinId, ...nameZerlegen(name), status: 'gast' })
          .select('id')
          .single();
        if (error || !data) throw new Error(`Gast ${name}: ${error?.message}`);
        personNachName.set(name, data.id);
        gaeste += 1;
      }

      // 2. Turniere mit Teilnehmern und Partien
      let partienZahl = 0;
      let ausgelassen = 0;
      for (const t of neue) {
        const disziplin = disziplinAusText(t.disziplin)!;
        const { data: neu, error } = await supabase
          .from('turniere')
          .insert({
            verein_id: vereinId,
            name: t.name,
            datum: t.datum,
            disziplin,
            modus: t.modus as (typeof DATEI_MODI)[number],
            teilnehmerzahl: new Set(t.teilnehmer.length > 0 ? t.teilnehmer : namenVon(t)).size,
            status: 'beendet',
            rating_werten: werten,
            quelle: 'import',
            alt_id: t.kennung,
            importiert_am: new Date().toISOString()
          })
          .select('id')
          .single();
        if (error || !neu) throw new Error(`Turnier ${t.name}: ${error?.message}`);

        const ids = [...new Set(namenVon(t).map((n) => personNachName.get(n)!))];
        const { error: fehlerTeilnehmer } = await supabase.from('turnier_teilnehmer').insert(
          ids.map((id) => ({
            turnier_id: neu.id,
            person_id: id,
            verein_id: vereinId,
            gesetzt: false,
            // Zwei Namen auf denselben Spieler zugeordnet: der bessere Platz zaehlt
            endplatz:
              Math.min(...t.ranking.filter((r) => personNachName.get(r.name) === id).map((r) => r.platz)) || null
          }))
        );
        if (fehlerTeilnehmer) throw new Error(`Teilnehmer ${t.name}: ${fehlerTeilnehmer.message}`);

        const zaehler = new Map<string, number>();
        const partien = t.partien.flatMap((p) => {
          const a = personNachName.get(p.a)!;
          const b = personNachName.get(p.b)!;
          const { phase, gruppe } = phaseAusText(p.phase, zaehler);
          // Zwei Namen auf denselben Spieler zugeordnet: die Partie faellt weg
          if (a === b) {
            ausgelassen += 1;
            return [];
          }
          return [
            {
              verein_id: vereinId,
              turnier_id: neu.id,
              disziplin,
              datum: t.datum,
              phase,
              gruppe,
              spieler_a: a,
              spieler_b: b,
              race_to: p.raceTo ?? null,
              vorgabe_a: p.vorgabeA ?? 0,
              vorgabe_b: p.vorgabeB ?? 0,
              ergebnis_a: p.satzA,
              ergebnis_b: p.satzB,
              status: 'beendet' as const,
              rating_werten: p.werten !== false,
              rating_grund: p.grund || null,
              beendet: new Date(`${t.datum}T12:00:00`).toISOString()
            }
          ];
        });
        if (partien.length > 0) {
          const { error: fehlerPartien } = await supabase.from('partien').insert(partien);
          if (fehlerPartien) throw new Error(`Partien ${t.name}: ${fehlerPartien.message}`);
        }
        partienZahl += partien.length;
      }
      setErgebnis(
        `${neue.length} ${neue.length === 1 ? 'Turnier' : 'Turniere'} mit ${partienZahl} Partien eingelesen` +
          (gaeste > 0 ? `, ${gaeste} ${gaeste === 1 ? 'Gast' : 'Gäste'} angelegt` : '') +
          (ausgelassen > 0 ? `, ${ausgelassen} Partien ausgelassen (beide Seiten derselbe Spieler)` : '') +
          '.'
      );
      setZeilen([]);
      await fertig();
    } catch (e) {
      setFehler(`${(e as Error).message} Was bis dahin geschrieben wurde, bleibt stehen; beim nächsten Einlesen wird es als vorhanden erkannt.`);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="kasten">
      <div className="feldkopf">Turnier-Datei einlesen</div>
      <p className="hinweis">
        Eine Turnier-Datei aus TurnierPilot oder einem anderen CueDesk-Verein. Erst kommt eine Vorschau, geschrieben wird
        mit „Einlesen“. Die Turniere landen ohne Serie im Archiv; einer Serie zuordnen geht danach unter Serien.
      </p>
      <div className="zeile">
        <input
          type="file"
          accept="application/json,.json"
          title="Die Turnier-Datei wählen (.json)"
          disabled={laeuft}
          onChange={(e) => {
            const datei = e.target.files?.[0];
            if (datei) void lesen(datei);
          }}
        />
        {dateiname && <span className="hinweis">{dateiname}</span>}
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {ergebnis && <p className="meldung">{ergebnis}</p>}
      {meldungen.map((m) => (
        <p key={m} className="hinweis">
          {m}
        </p>
      ))}

      {zeilen.length > 0 && (
        <table className="tabelle kompakt">
          <thead>
            <tr>
              <th>Turnier</th>
              <th>Datum</th>
              <th>Disziplin</th>
              <th>Partien</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.kennung}>
                <td>{z.name}</td>
                <td>{new Date(`${z.datum}T12:00:00`).toLocaleDateString('de-DE')}</td>
                <td>{z.disziplin || '–'}</td>
                <td>{z.partien.length}</td>
                <td className={z.status === 'neu' ? undefined : 'hinweis'}>{z.grund}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {namen.length > 0 && (
        <>
          <p className="hinweis">Namen zuordnen: Wer schon Spieler im Verein ist, steht gleich da; die anderen werden als Gast angelegt.</p>
          <table className="tabelle kompakt">
            <thead>
              <tr>
                <th>Name in der Datei</th>
                <th style={{ width: '260px' }}>wird zu</th>
              </tr>
            </thead>
            <tbody>
              {namen.map((name) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    <select
                      value={zuordnung[name] ?? GAST}
                      title="Einem vorhandenen Spieler zuordnen oder als Gast anlegen"
                      onChange={(e) => setZuordnung((bisher) => ({ ...bisher, [name]: e.target.value }))}
                    >
                      <option value={GAST}>als Gast anlegen</option>
                      {personen.map((p) => (
                        <option key={p.id} value={p.id}>
                          {personName(p)}
                          {p.status === 'gast' ? ' (Gast)' : p.status === 'ausgetreten' ? ' (ausgetreten)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="knopfpaar rechts">
        {mitRating && neue.length > 0 && (
          <label className="haken" title="Ohne Haken stehen die Partien nur im Archiv. Werten lässt sich später im Turnier mit „Fürs Rating werten“.">
            <input type="checkbox" checked={werten} onChange={(e) => setWerten(e.target.checked)} disabled={laeuft} />
            <span>Partien fürs Rating werten</span>
          </label>
        )}
        <button type="button" title="Schließen, ohne etwas einzulesen" onClick={schliessen} disabled={laeuft}>
          {ergebnis ? 'Schließen' : 'Abbrechen'}
        </button>
        {neue.length > 0 && (
          <button type="button" className="hauptaktion" title="Schreibt die neuen Turniere mit Teilnehmern und Partien ins Archiv." onClick={() => void einlesen()} disabled={laeuft}>
            {laeuft ? 'Wird eingelesen' : 'Einlesen'}
          </button>
        )}
      </div>
    </div>
  );
}
