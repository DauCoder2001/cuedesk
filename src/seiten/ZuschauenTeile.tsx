import { KEIN_LIVE_TEXT, kachel, liveAktiv } from '../live';
import { rundeText } from '../archiv';
import { ligaStand, ortsTag, paarungText, spiellage, tabellen } from '../zuschauen';
import { istDoppelBegegnung } from '../liga';
import { Tischkachel } from './Live';
import type { Anzeige } from '../zuschauen';
import type { Partie, Tisch, Turnier, TurnierTeilnehmer } from '../datenbank.types';

// Die beiden Reiter "Tische" und "Turnier" der Zuschauerseite. Genutzt von
// der Mitgliederseite (Zuschauen.tsx) und vom oeffentlichen Live-Link
// (LiveOeffentlich.tsx); die Daten laedt jede Seite selbst.

export type Stand = { zustand: unknown; aktualisiert: string };

const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const DISZIPLIN_TEXT: Record<string, string> = { '8-ball': '8-Ball', '9-ball': '9-Ball', '10-ball': '10-Ball' };

export function TischeTeil({
  tische,
  staende,
  turniere,
  protokollLink = true
}: {
  tische: Tisch[];
  staende: Record<string, Stand>;
  turniere: Turnier[];
  protokollLink?: boolean; // "Protokoll live" bei 14.1 (braucht eine Anmeldung)
}) {
  const aktiv = liveAktiv(turniere);
  // Disziplin eines laufenden Turniers; Liga-Partien bringen ihre eigene mit
  const t = turniere.find((x) => x.status === 'laeuft' && x.modus !== 'liga');
  const turnierDisziplin = t ? DISZIPLIN_TEXT[t.disziplin] ?? null : null;
  return (
    <section>
      {tische.length === 0 && <p className="hinweis">Es ist noch kein Tisch angelegt.</p>}
      {!aktiv && <p className="hinweis">{KEIN_LIVE_TEXT}</p>}
      <div className="zuschauentische">
        {aktiv &&
          tische.map((tisch) => (
            <Tischkachel
              key={tisch.id}
              tisch={tisch}
              k={kachel(staende[tisch.id]?.zustand ?? null, staende[tisch.id]?.aktualisiert ?? null)}
              neuLaden={null}
              laedtNeu={false}
              tabletAus={false}
              tischform
              protokollLink={protokollLink}
              turnierLaeuft={turniere.some((x) => x.status === 'laeuft')}
              turnierDisziplin={turnierDisziplin}
            />
          ))}
      </div>
    </section>
  );
}

export function TurnierTeil({
  anzeige,
  partien,
  teilnehmer,
  tische,
  heutige,
  vereinName,
  name
}: {
  anzeige: Anzeige | null;
  partien: Partie[]; // der gezeigten Begegnungen bzw. des Turniers
  teilnehmer: TurnierTeilnehmer[];
  tische: Tisch[];
  heutige: Partie[]; // Quelle fuer "Heute beendet" (nur Paarung und Ergebnis)
  vereinName: string;
  name: (id: string) => string;
}) {
  const heute = ortsTag(new Date().toISOString());
  const lage = spiellage(partien, heute);
  const heuteLage = spiellage(heutige, heute);
  const ergebnis = (p: Partie) => `${p.ergebnis_a ?? 0}:${p.ergebnis_b ?? 0}`;
  // "A – B", im Doppel "A / B – C / D", ohne Vereinszusatz wie am Tablet
  const paarung = (p: Partie) => paarungText(p, name);
  const tischNummer = (id: string | null) => tische.find((t) => t.id === id)?.nummer;

  return (
    <section>
      {!anzeige ? (
        <p className="hinweis">Gerade läuft kein Turnier.</p>
      ) : (
        <>
          <h2>{anzeige.begegnungen[0].name}</h2>
          {anzeige.turnier.modus === 'liga'
            ? anzeige.begegnungen.map((b, i) => {
                const s = ligaStand(b, partien, vereinName);
                return (
                  <div key={b.id} className="zuschauenblock">
                    <h3>{i + 1}. Begegnung{istDoppelBegegnung(b) ? ' · Doppel' : ''}{b.status === 'beendet' ? ' ✓' : b.status === 'laeuft' ? ' · läuft' : ''}</h3>
                    <div className="zuschauenliga">
                      <span>{s.heim}</span>
                      <strong>
                        {s.partiepunkte[0]} : {s.partiepunkte[1]}
                      </strong>
                      <span>{s.gast}</span>
                    </div>
                    <p className="hinweis">
                      Partiepunkte
                      {s.matchpunkte ? ` · Matchpunkte ${s.matchpunkte[0]} : ${s.matchpunkte[1]}` : ''}
                    </p>
                  </div>
                );
              })
            : tabellen(anzeige.turnier, teilnehmer, partien).map((tab) => (
                <div key={tab.gruppe ?? 'alle'} className="zuschauenblock">
                  {tab.gruppe && <h3>Gruppe {tab.gruppe}</h3>}
                  <table className="tabelle">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Name</th>
                        <th className="rechts" title="Spiele">Sp</th>
                        <th className="rechts" title="Siege">S</th>
                        <th className="rechts" title="Satzdifferenz">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tab.zeilen.map((z, i) => (
                        <tr key={z.personId}>
                          <td>{i + 1}</td>
                          <td>{name(z.personId)}</td>
                          <td className="rechts">{z.spiele}</td>
                          <td className="rechts">{z.siege}</td>
                          <td className="rechts">{z.diff > 0 ? `+${z.diff}` : z.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          {partien.some((p) => p.phase === 'ko') && (
            <div className="zuschauenblock">
              <h3>KO-Runde</h3>
              {partien
                .filter((p) => p.phase === 'ko')
                .sort((a, b) => (a.runde ?? 0) - (b.runde ?? 0) || (a.paarung ?? 0) - (b.paarung ?? 0))
                .map((p) => (
                  <div key={p.id} className="zuschauenspiel">
                    <span className="hinweis">{rundeText(p)}</span>
                    <span>{paarung(p)}</span>
                    <span>{p.status === 'beendet' ? `${ergebnis(p)} ✓` : p.status === 'laeuft' ? 'läuft' : ''}</span>
                  </div>
                ))}
            </div>
          )}
          {lage.laufend.length > 0 && (
            <div className="zuschauenblock">
              <h3>Läuft gerade</h3>
              {lage.laufend.map((p) => (
                <div key={p.id} className="zuschauenspiel">
                  <span>{paarung(p)}</span>
                  <span>{tischNummer(p.tisch_id) !== undefined ? `Tisch ${tischNummer(p.tisch_id)}` : ''}</span>
                </div>
              ))}
            </div>
          )}
          {lage.naechste.length > 0 && (
            <div className="zuschauenblock">
              <h3>Als Nächstes</h3>
              {lage.naechste.map((p) => (
                <div key={p.id} className="zuschauenspiel">
                  <span>{paarung(p)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="zuschauenblock">
        <h3>Heute beendet</h3>
        {heuteLage.heute.length === 0 && <p className="hinweis">Heute ist noch keine Partie zu Ende gegangen.</p>}
        {heuteLage.heute.map((p) => (
          <div key={p.id} className="zuschauenspiel">
            <span className="hinweis">{p.beendet ? uhrzeit(p.beendet) : ''}</span>
            <span>{paarung(p)}</span>
            <strong>{ergebnis(p)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
