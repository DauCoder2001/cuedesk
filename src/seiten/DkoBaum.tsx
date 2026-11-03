import type { ReactNode } from 'react';
import { dkoAbschnitt } from '../doppelko';
import type { DkoArt, DkoSeite, DkoStandSpiel } from '../doppelko';

// Uebersicht des Doppel-KO, Abschnitt fuer Abschnitt in Spielreihenfolge
// (Gewinnerrunde 1, Verliererrunde 1, Gewinnerrunde 2 ...). Die Ergebnisse
// werden im Spielplan eingetragen; hier steht, wer woher kommt, wer ein
// Freilos hat und wer weiter ist.

export default function DkoBaum(props: {
  baum: Record<string, DkoStandSpiel<string>>;
  anzeige: (id: string) => string;
  raceFuer: (art: DkoArt) => number;
  gesperrt: (spielId: string) => boolean;
  raceKnopf?: (art: DkoArt) => ReactNode; // "Race to ändern…" neben der Ueberschrift
}) {
  const spiele = Object.values(props.baum).map((m) => m.spiel);
  const stufe = new Map(spiele.map((s) => [dkoAbschnitt(s.id).titel, dkoAbschnitt(s.id).stufe]));
  const abschnitte = [...stufe.keys()].sort((a, b) => (stufe.get(a) ?? 0) - (stufe.get(b) ?? 0));
  const seite = (x: DkoSeite<string>, herkunft: string) =>
    x.wer ? (
      <>
        {props.anzeige(x.wer)} <span className="marke">{herkunft}</span>
      </>
    ) : (
      <span className="hinweis">{x.frei ? '– (Freilos)' : herkunft}</span>
    );
  return (
    <>
      {abschnitte.map((titel) => {
        const liste = spiele.filter((s) => dkoAbschnitt(s.id).titel === titel);
        const arten = [...new Set(liste.map((s) => s.art))];
        // Finale und Platz 3 haben je ein Race; gleich: einmal, sonst mit Namen
        const werte = [...new Set(arten.map((a) => props.raceFuer(a)))];
        const race =
          werte.length === 1
            ? `Race to ${werte[0]}`
            : arten.map((a) => `${a === 'FIN' ? 'Finale' : 'Platz 3'}: Race to ${props.raceFuer(a)}`).join(' · ');
        return (
          <div key={titel} className="koblock">
            <div className="kopflinks">
              <h3>
                {titel} <span className="hinweis">{race}</span>
              </h3>
              {props.raceKnopf?.(arten[0])}
            </div>
            <table className="tabelle kompakt">
              <tbody>
                {liste.map((s) => {
                  const m = props.baum[s.id];
                  return (
                    <tr key={s.id} className={m.fertig ? 'gespielt' : ''}>
                      <td className="hinweis">{s.name.replace(`${titel} · `, '')}</td>
                      <td className="rechts">{seite(m.a, m.l1)}</td>
                      <td className="rechts">{m.bereit && m.s1 !== null ? `${m.s1} : ${m.s2}` : '–'}</td>
                      <td>{seite(m.b, m.l2)}</td>
                      <td>
                        {m.entfaellt ? (
                          <span className="hinweis" title="Beide Seiten sind Freilose; das Spiel entfällt.">
                            entfällt
                          </span>
                        ) : m.freilos && m.sieger.wer ? (
                          <span title="Der Gegner ist ein Freilos; das Spiel wird nicht gespielt.">
                            <strong>{props.anzeige(m.sieger.wer)}</strong> <span className="hinweis">Freilos</span>
                          </span>
                        ) : m.fertig && m.sieger.wer ? (
                          <strong>{props.anzeige(m.sieger.wer)}</strong>
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
