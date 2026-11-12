import { useState } from 'react';
import { supabase } from '../supabase';
import { useRueckfrage } from '../rueckfrage';

// System -> "Gäste bereinigen": Gaeste, die nie gespielt haben (meist aus dem
// Mannschaftspass eines Gegners), fuer einen Zeitraum suchen, abhaken und
// entfernen. Wer bleiben muss, entscheidet die Datenbank (gast_bindung in
// supabase/migrations/..._gaeste_bereinigen.sql); hier gibt es die Liste und
// das Schutzwort.

type Zeile = {
  id: string;
  vorname: string;
  nachname: string;
  anzeigename: string | null;
  angelegt: string;
  spieltag: string | null;
  gegner: string | null;
  ausPass: boolean;
};
type Liste = { gaeste: Zeile[]; offen: number; gebunden: number };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tagText = (tag: string) => new Date(`${tag}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const gaesteText = (n: number) => `${n} ${n === 1 ? 'Gast' : 'Gäste'}`;

// Vorgabe: das letzte Jahr bis vor 14 Tagen, damit frisch angelegte Gaeste nicht dabei sind
function vorgabe(): { von: string; bis: string } {
  const bis = new Date();
  bis.setDate(bis.getDate() - 14);
  const von = new Date(bis);
  von.setFullYear(von.getFullYear() - 1);
  return { von: iso(von), bis: iso(bis) };
}

const herkunft = (z: Zeile) =>
  z.spieltag ? `${z.spieltag}${z.gegner ? ` · Gegner ${z.gegner}` : ''}` : z.ausPass ? 'aus einem Mannschaftspass' : 'von Hand angelegt';

export default function GaesteBereinigen({ vereinId }: { vereinId: string }) {
  const [von, setVon] = useState(() => vorgabe().von);
  const [bis, setBis] = useState(() => vorgabe().bis);
  const [liste, setListe] = useState<Liste | null>(null);
  const [aus, setAus] = useState<Set<string>>(new Set()); // abgewaehlte Gaeste
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  const zeitraumFehlt = !von || !bis || von > bis;
  const gewaehlt = (liste?.gaeste ?? []).filter((z) => !aus.has(z.id));

  async function suchen() {
    if (zeitraumFehlt) return;
    setFehler(null);
    setMeldung(null);
    setLaeuft(true);
    const { data, error } = await supabase.rpc('gaeste_ohne_spiel', { p_verein: vereinId, p_von: von, p_bis: bis });
    setLaeuft(false);
    if (error) return setFehler(error.message);
    setListe(data as Liste);
    setAus(new Set());
  }

  async function entfernen() {
    if (gewaehlt.length === 0) return;
    setFehler(null);
    setMeldung(null);
    const text =
      `${gaesteText(gewaehlt.length)} ohne Spiel endgültig entfernen?\n\n` +
      'Mit ihnen gehen ihre Verbandsnummern und Einwilligungen. Ergebnisse gehen nicht verloren: Gäste mit Partien sind nicht dabei. ' +
      'Kommt ein Gegner wieder, legt „Aus Pass…“ seine Spieler neu an.';
    if (!(await fragen(text, 'Entfernen', { schutzwort: vereinId }))) return;
    setLaeuft(true);
    const { data, error } = await supabase.rpc('gaeste_bereinigen', { p_verein: vereinId, p_ids: gewaehlt.map((z) => z.id) });
    setLaeuft(false);
    if (error) return setFehler(error.message);
    const entfernt = Number(data ?? 0);
    setListe(null);
    setAus(new Set());
    setMeldung(
      entfernt === gewaehlt.length
        ? `${gaesteText(entfernt)} entfernt.`
        : `${gaesteText(entfernt)} entfernt. ${gewaehlt.length - entfernt} blieben, weil sie inzwischen gebraucht werden.`
    );
  }

  const bleiben = liste ? liste.offen + liste.gebunden : 0;

  return (
    <section className="block">
      <h2>Gäste bereinigen</h2>
      <p className="hinweis">
        Entfernt Gäste, die nie gespielt haben, zum Beispiel Spieler aus dem Mannschaftspass eines Gegners, die nicht aufgestellt
        wurden. Gäste mit Ergebnissen bleiben immer erhalten, ebenso Gäste eines Spieltags, der noch nicht abgeschlossen ist.
      </p>
      <div className="zeile">
        <label className="feld" title="Erster Tag des Zeitraums: Gäste, die an diesem Tag oder später angelegt wurden">
          <span>Angelegt von</span>
          <input type="date" value={von} max={bis || undefined} onChange={(e) => setVon(e.target.value)} />
        </label>
        <label className="feld" title="Letzter Tag des Zeitraums: Gäste, die bis zu diesem Tag angelegt wurden. Vorgabe: heute vor 14 Tagen.">
          <span>bis</span>
          <input type="date" value={bis} min={von || undefined} onChange={(e) => setBis(e.target.value)} />
        </label>
        <button
          type="button"
          title="Zeigt die Gäste ohne Spiel aus diesem Zeitraum. Entfernt wird erst nach dem Abhaken und der Rückfrage."
          onClick={() => void suchen()}
          disabled={laeuft || zeitraumFehlt}
        >
          Gäste suchen
        </button>
      </div>
      {von && bis && von > bis && <p className="fehler">„Angelegt von“ liegt nach „bis“.</p>}
      {liste && (
        <>
          <p>
            {liste.gaeste.length === 0 ? 'Keine Gäste ohne Spiel in diesem Zeitraum.' : `${gaesteText(liste.gaeste.length)} ohne Spiel gefunden.`}
            {bleiben > 0 &&
              ` ${bleiben === 1 ? '1 weiterer Gast ohne Spiel bleibt' : `${bleiben} weitere Gäste ohne Spiel bleiben`}` +
                ` (${[
                  liste.offen > 0 ? `${liste.offen} in einem offenen Spieltag oder Turnier` : null,
                  liste.gebunden > 0 ? `${liste.gebunden} angemeldet, im Kader oder mit Konto` : null
                ]
                  .filter(Boolean)
                  .join(', ')}).`}
          </p>
          {liste.gaeste.length > 0 && (
            <>
              <table className="tabelle kompakt">
                <thead>
                  <tr>
                    <th></th>
                    <th>Gast</th>
                    <th title="So steht der Gast auf TV, Live und an den Tablets">Angezeigt als</th>
                    <th>Angelegt</th>
                    <th title="Der Spieltag, für den der Gast aus dem Pass des Gegners übernommen wurde">Herkunft</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.gaeste.map((z) => (
                    <tr key={z.id}>
                      <td className="markierspalte">
                        <input
                          type="checkbox"
                          title="Angehakte Gäste werden entfernt"
                          checked={!aus.has(z.id)}
                          onChange={(e) => {
                            const neu = new Set(aus);
                            if (e.target.checked) neu.delete(z.id);
                            else neu.add(z.id);
                            setAus(neu);
                          }}
                        />
                      </td>
                      <td className="namenspalte">
                        {z.vorname} {z.nachname}
                      </td>
                      <td>{z.anzeigename ?? ''}</td>
                      <td>{tagText(z.angelegt)}</td>
                      <td>{herkunft(z)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="zeile">
                <span className="hinweis">{gewaehlt.length} angehakt</span>
                <button type="button" title="Die Liste schließen, nichts wird entfernt" onClick={() => setListe(null)} disabled={laeuft}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="gefahrknopf"
                  title="Entfernt die angehakten Gäste endgültig. Fragt nach dem Schutzwort."
                  onClick={() => void entfernen()}
                  disabled={laeuft || gewaehlt.length === 0}
                >
                  {gaesteText(gewaehlt.length)} entfernen…
                </button>
              </div>
            </>
          )}
        </>
      )}
      {fehler && <p className="fehler">{fehler}</p>}
      {meldung && <p className="meldung">{meldung}</p>}
      {rueckfrage}
    </section>
  );
}
