import { useState } from 'react';
import { supabase } from '../supabase';
import { personName } from '../namen';
import type { Person } from '../datenbank.types';
import type { ExportStammdaten as Stammdaten, Zuordnung } from '../export-lesen';

// Teil von "Altdaten uebernehmen": Stammdaten aus einem CueDesk-Export
// (src/export-lesen.ts). Alles bekommt neue IDs; geschrieben wird erst mit
// "Uebernehmen". Ein zweiter Lauf legt nichts doppelt an: Spieler werden am
// Namen erkannt, Tische an der Nummer, Mannschaften an Saison und Name.

const STATUS_TEXT = { mitglied: 'Mitglied', gast: 'Gast', ausgetreten: 'ausgetreten' } as const;

export default function ExportStammdaten({
  stammdaten,
  vereinId,
  personen,
  vorschlag,
  deutsch
}: {
  stammdaten: Stammdaten;
  vereinId: string;
  personen: Person[];
  vorschlag: Record<string, Zuordnung>;
  deutsch: (text: string) => string;
}) {
  const [zuordnung, setZuordnung] = useState<Record<string, Zuordnung>>(vorschlag);
  const [mitMannschaften, setMitMannschaften] = useState(stammdaten.mannschaften.length > 0);
  const [mitTischen, setMitTischen] = useState(stammdaten.tische.length > 0);
  const [laeuft, setLaeuft] = useState(false);
  const [protokoll, setProtokoll] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const melde = (zeile: string) => setProtokoll((bisher) => [...bisher, zeile]);

  const neu = Object.values(zuordnung).filter((z) => z === 'neu').length;
  const weg = Object.values(zuordnung).filter((z) => z === 'weglassen').length;
  const zugeordnet = stammdaten.personen.length - neu - weg;
  const a = stammdaten.ausgelassen;
  const auswahl = [...personen].sort((x, y) => personName(x).localeCompare(personName(y), 'de'));

  async function uebernehmen() {
    setLaeuft(true);
    setFehler(null);
    setProtokoll([]);
    try {
      // 1. Spieler und ihre vertraulichen Angaben
      const personNachAlt = new Map<string, string>();
      let angelegt = 0;
      for (const p of stammdaten.personen) {
        const wahl = zuordnung[p.altId] ?? 'neu';
        if (wahl === 'weglassen') continue;
        if (wahl !== 'neu') {
          personNachAlt.set(p.altId, wahl);
          continue;
        }
        const { data, error } = await supabase
          .from('personen')
          .insert({
            verein_id: vereinId,
            vorname: p.vorname,
            nachname: p.nachname,
            anzeigename: p.anzeigename,
            kuerzel: p.kuerzel,
            status: p.status,
            rating_ausgeblendet: p.rating_ausgeblendet
          })
          .select('id')
          .single();
        if (error || !data) throw new Error(`Spieler ${personName(p)}: ${error?.message}`);
        personNachAlt.set(p.altId, data.id);
        angelegt += 1;
        if (p.intern) {
          const { error: fehlerIntern } = await supabase
            .from('personen_intern')
            .upsert({ person_id: data.id, verein_id: vereinId, ...p.intern });
          if (fehlerIntern) throw new Error(`Angaben zu ${personName(p)}: ${fehlerIntern.message}`);
        }
      }
      melde(`${angelegt} Spieler neu angelegt, ${personNachAlt.size - angelegt} vorhandenen zugeordnet, ${weg} weggelassen.`);

      // 2. Tische
      if (mitTischen) {
        const { data: da } = await supabase.from('tische').select('nummer').eq('verein_id', vereinId);
        const belegt = new Set((da ?? []).map((t) => t.nummer));
        const fehlend = stammdaten.tische.filter((t) => !belegt.has(t.nummer));
        if (fehlend.length > 0) {
          const { error } = await supabase.from('tische').insert(fehlend.map((t) => ({ verein_id: vereinId, ...t })));
          if (error) throw new Error(`Tische: ${error.message}`);
        }
        melde(`${fehlend.length} Tische angelegt${belegt.size > 0 ? `, ${stammdaten.tische.length - fehlend.length} gab es schon` : ''}.`);
      }

      // 3. Mannschaften mit Kader
      if (mitMannschaften) {
        let ohneSpieler = 0;
        for (const m of stammdaten.mannschaften) {
          const { data: schonDa } = await supabase
            .from('mannschaften')
            .select('id')
            .eq('verein_id', vereinId)
            .eq('saison', m.saison)
            .eq('name', m.name)
            .maybeSingle();
          let mannschaftId = schonDa?.id;
          if (!mannschaftId) {
            const { data, error } = await supabase
              .from('mannschaften')
              .insert({
                verein_id: vereinId,
                name: m.name,
                saison: m.saison,
                liga: m.liga,
                staffel: m.staffel,
                rang: m.rang,
                aktiv: m.aktiv,
                notiz: m.notiz
              })
              .select('id')
              .single();
            if (error || !data) throw new Error(`Mannschaft ${m.name}: ${error?.message}`);
            mannschaftId = data.id;
          }
          const zeilen = m.kader.flatMap((k) => {
            const personId = personNachAlt.get(k.personAltId);
            if (!personId) {
              ohneSpieler += 1;
              return [];
            }
            const { personAltId: _alt, ...rest } = k;
            return [{ verein_id: vereinId, mannschaft_id: mannschaftId!, person_id: personId, ...rest }];
          });
          if (zeilen.length > 0) {
            const { error } = await supabase
              .from('mannschaft_spieler')
              .upsert(zeilen, { onConflict: 'mannschaft_id,person_id', ignoreDuplicates: true });
            if (error) throw new Error(`Kader ${m.name}: ${error.message}`);
          }
          melde(`Mannschaft "${m.name}" (${m.saison})${schonDa ? ' war schon da' : ' angelegt'}, ${zeilen.length} Spieler im Kader.`);
        }
        if (ohneSpieler > 0) melde(`${ohneSpieler} Kader-Einträge ausgelassen, weil der Spieler weggelassen wurde.`);
      }
      melde('Fertig. Die Freigabe „Name öffentlich“ bitte je Spieler unter Spieler neu erfassen.');
    } catch (e) {
      setFehler(deutsch((e as Error).message));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <section className="block">
        <h2>Was im Export steht</h2>
        <p className="hinweis">
          CueDesk-Export{stammdaten.vereinName ? ` von „${stammdaten.vereinName}“` : ''}
          {stammdaten.erstellt ? ` vom ${new Date(stammdaten.erstellt).toLocaleDateString('de-DE')}` : ''}. Übernommen werden
          nur Stammdaten.
        </p>
        <div className="kennzahlen">
          <div>
            <span>Spieler</span>
            <strong>{stammdaten.personen.length}</strong>
            <small>
              {neu} neu, {zugeordnet} vorhanden, {weg} weglassen
            </small>
          </div>
          <div>
            <span>Mannschaften</span>
            <strong>{stammdaten.mannschaften.length}</strong>
            <small>{stammdaten.mannschaften.reduce((n, m) => n + m.kader.length, 0)} im Kader</small>
          </div>
          <div>
            <span>Tische</span>
            <strong>{stammdaten.tische.length}</strong>
            <small>Nummer {stammdaten.tische.map((t) => t.nummer).join(', ') || '–'}</small>
          </div>
          <div>
            <span>Bleibt draußen</span>
            <strong>{a.turniere + a.partien}</strong>
            <small>
              {a.turniere} Turniere, {a.partien} Partien, Rating, {a.konten} Konten, {a.geraete} Geräte
            </small>
          </div>
        </div>
        {stammdaten.anonymisiert > 0 && (
          <p className="hinweis">{stammdaten.anonymisiert} anonymisierte Spieler werden nicht angeboten.</p>
        )}
      </section>

      <section className="block">
        <h2>Spieler</h2>
        <table className="tabelle kompakt">
          <thead>
            <tr>
              <th>Name im Export</th>
              <th style={{ width: '110px' }}>Status</th>
              <th style={{ width: '240px' }}>wird zu</th>
            </tr>
          </thead>
          <tbody>
            {stammdaten.personen.map((p) => (
              <tr key={p.altId}>
                <td>
                  {personName(p)}
                  {p.anzeigename && p.anzeigename !== personName(p) && <small className="hinweis"> · {p.anzeigename}</small>}
                </td>
                <td>{STATUS_TEXT[p.status]}</td>
                <td>
                  <select
                    value={zuordnung[p.altId] ?? 'neu'}
                    onChange={(e) => setZuordnung((bisher) => ({ ...bisher, [p.altId]: e.target.value }))}
                  >
                    <option value="neu">neu anlegen</option>
                    <option value="weglassen">nicht übernehmen</option>
                    {auswahl.map((person) => (
                      <option key={person.id} value={person.id}>
                        {personName(person)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hinweis">
          Gäste sind zunächst auf „nicht übernehmen“ gestellt, meist sind es Gegner aus Liga-Spielen. Die Einwilligung „Name
          öffentlich“ wird nicht übernommen: Sie wird hier mit ihrem Nachweis neu erfasst (Spieler → Einwilligungen).
          {stammdaten.einwilligungen.mitNachweis + stammdaten.einwilligungen.ohneNachweis > 0 &&
            ` Im Export erteilt: ${stammdaten.einwilligungen.mitNachweis} mit Nachweis, ${stammdaten.einwilligungen.ohneNachweis} ohne Nachweis.`}
        </p>
      </section>

      <section className="block">
        <h2>Was übernommen wird</h2>
        <label className="ankreuz">
          <input type="checkbox" checked disabled />
          <span>
            Spieler mit Eintritt, Austritt, Pass- und DBU-Nummer, Notiz und Rating-Startwert
            <small>{neu} werden neu angelegt</small>
          </span>
        </label>
        <label className="ankreuz">
          <input
            type="checkbox"
            checked={mitMannschaften}
            disabled={stammdaten.mannschaften.length === 0}
            onChange={(e) => setMitMannschaften(e.target.checked)}
          />
          <span>
            Mannschaften mit Kader
            <small>{stammdaten.mannschaften.map((m) => `${m.name} (${m.saison})`).join(', ') || 'keine im Export'}</small>
          </span>
        </label>
        <label className="ankreuz">
          <input
            type="checkbox"
            checked={mitTischen}
            disabled={stammdaten.tische.length === 0}
            onChange={(e) => setMitTischen(e.target.checked)}
          />
          <span>
            Tische
            <small>vorhandene Nummern bleiben unverändert</small>
          </span>
        </label>

        <div className="zeile">
          <button type="button" title="Schreibt die Stammdaten in CueDesk." onClick={() => void uebernehmen()} disabled={laeuft}>
            {laeuft ? 'Wird übernommen' : 'Übernehmen'}
          </button>
          <span className="hinweis">Ein zweiter Lauf legt nichts doppelt an.</span>
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {protokoll.length > 0 && (
          <ul className="protokoll">
            {protokoll.map((zeile, nummer) => (
              <li key={nummer}>{zeile}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
