import { koSpiele, KO_RUNDEN_NAME } from '../ko';
import type { KoRunde, KoStandSpiel } from '../ko';

// Uebersicht der KO-Runde, Runde fuer Runde wie im Turnierplan KO v74. Die
// Ergebnisse werden im Spielplan eingetragen; hier steht, wer woher kommt und
// wer weiter ist.

const RUNDEN: { runden: KoRunde[]; titel: string }[] = [
  { runden: ['R16'], titel: 'Achtelfinale' },
  { runden: ['QF'], titel: 'Viertelfinale' },
  { runden: ['SF'], titel: 'Halbfinale' },
  { runden: ['FIN', 'BRO'], titel: 'Finale und Spiel um Platz 3' }
];

export default function KoBaum(props: {
  baum: Record<string, KoStandSpiel<string>>;
  feld: number;
  anzeige: (id: string) => string;
  raceFuer: (runde: KoRunde) => number;
  gesperrt: (spielId: string) => boolean;
}) {
  const spiele = koSpiele(props.feld);
  return (
    <>
      {RUNDEN.filter((r) => spiele.some((s) => r.runden.includes(s.runde))).map((r) => {
        const liste = spiele.filter((s) => r.runden.includes(s.runde));
        const race = r.runden
          .map((x) => `${r.runden.length > 1 ? `${KO_RUNDEN_NAME[x]}: ` : ''}Race to ${props.raceFuer(x)}`)
          .join(' · ');
        return (
          <div key={r.titel} className="koblock">
            <h3>
              {r.titel} <span className="hinweis">{race}</span>
            </h3>
            <table className="tabelle">
              <tbody>
                {liste.map((s) => {
                  const m = props.baum[s.id];
                  const seite = (wer: string | null, herkunft: string) =>
                    wer ? (
                      <>
                        {props.anzeige(wer)} <span className="marke">{herkunft}</span>
                      </>
                    ) : (
                      <span className="hinweis">{herkunft}</span>
                    );
                  return (
                    <tr key={s.id} className={m.fertig ? 'gespielt' : ''}>
                      <td className="hinweis">{s.name}</td>
                      <td className="rechts">{seite(m.p1, m.l1)}</td>
                      <td className="rechts">{m.bereit && m.s1 !== null ? `${m.s1} : ${m.s2}` : '–'}</td>
                      <td>{seite(m.p2, m.l2)}</td>
                      <td>
                        {m.fertig && m.sieger ? (
                          <strong>{props.anzeige(m.sieger)}</strong>
                        ) : (
                          <span className="hinweis">{m.bereit ? 'offen' : 'wartet'}</span>
                        )}
                        {props.gesperrt(s.id) && <span className="marke">gesperrt</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
