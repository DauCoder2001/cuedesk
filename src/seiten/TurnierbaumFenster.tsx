// Turnierbaum fuer die Turnierleitung (Knopf "Turnierbaum" im Turnierkopf):
// dasselbe Bild wie "TV zeigt: Turnierbaum" (scoreboards/tv-Turnierbaum.html),
// nur hell und als Fenster. Gerechnet in src/turnierbaum.ts; hier wird nur
// gezeichnet. Nur zum Ansehen, Ergebnisse stehen weiter im Spielplan.

import { Modal } from '../modal';
import type { BaumSeite, BaumSpiel, Turnierbaum } from '../turnierbaum';

export type BaumLive = { a: number; b: number; tisch: string | null };

function Seite({ seite, name, punkte, sieger, verlierer }: { seite: BaumSeite; name: (id: string) => string; punkte: number | null; sieger: boolean; verlierer: boolean }) {
  const klasse = seite.frei ? 'frei' : !seite.person ? 'wartet' : sieger ? 'sieg' : verlierer ? 'raus' : '';
  return (
    <div className={`baumseite ${klasse}`}>
      <span>{seite.person ? name(seite.person) : seite.frei ? 'Freilos' : seite.herkunft}</span>
      <span>{punkte ?? ''}</span>
    </div>
  );
}

function Spiel({ spiel, name, live }: { spiel: BaumSpiel; name: (id: string) => string; live: BaumLive | null }) {
  if (spiel.entfaellt) return null;
  const tisch = live?.tisch ?? spiel.tisch;
  const laeuft = !spiel.fertig && (live !== null || tisch !== null);
  const punkte: [number | null, number | null] =
    spiel.fertig && !spiel.freilos ? [spiel.s1, spiel.s2] : live && !spiel.fertig ? [live.a, live.b] : [null, null];
  return (
    <div className={`baumspiel${laeuft ? ' live' : ''}`}>
      <div className="baumkopf">{laeuft ? `● ${tisch ? `Tisch ${tisch}` : 'läuft'} · ${spiel.name}` : `${spiel.name}${spiel.freilos ? ' · Freilos' : ''}`}</div>
      <Seite seite={spiel.a} name={name} punkte={punkte[0]} sieger={spiel.sieger === 'a'} verlierer={spiel.sieger === 'b'} />
      <Seite seite={spiel.b} name={name} punkte={punkte[1]} sieger={spiel.sieger === 'b'} verlierer={spiel.sieger === 'a'} />
    </div>
  );
}

// Eine Zone (Gewinnerrunde, Verliererrunde, Endrunde): Spalten in Spielreihenfolge
function Zone({ titel, art, spiele, name, live }: { titel: string | null; art: 'g' | 'v' | 'e'; spiele: BaumSpiel[]; name: (id: string) => string; live: (s: BaumSpiel) => BaumLive | null }) {
  const spalten = [...new Set(spiele.map((s) => s.spalte))];
  return (
    <div className={`baumzone ${art}`}>
      {titel && <h3>{titel}</h3>}
      <div className="baumspalten">
        {spalten.map((sp) => (
          <div key={sp} className="baumspalte">
            <h4>{sp}</h4>
            {spiele
              .filter((s) => s.spalte === sp)
              .map((s) => (
                <Spiel key={s.id} spiel={s} name={name} live={s.fertig ? null : live(s)} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TurnierbaumFenster({
  baum,
  beendet,
  name,
  live,
  schliessen
}: {
  baum: Turnierbaum;
  beendet: boolean; // Turnier abgeschlossen
  name: (id: string) => string;
  live: (s: BaumSpiel) => BaumLive | null;
  schliessen: () => void;
}) {
  const g = baum.spiele.filter((s) => s.zone === 'G');
  const v = baum.spiele.filter((s) => s.zone === 'V');
  const e = baum.spiele.filter((s) => s.zone === 'E');
  // Bis 16 Spieler passt die Endrunde neben Gewinner- und Verliererrunde; darueber alles untereinander
  const nebeneinander = g.filter((s) => s.spalte === 'Gewinnerrunde 1').length <= 8;
  return (
    <Modal weit abbrechen={schliessen}>
      <div className="bearbeitenkopf">
        <h2>
          Turnierbaum{' '}
          <span className="hinweis baumstand">
            {baum.art === 'dko' ? 'Doppel-KO' : 'KO-Runde'} · {baum.beendet} von {baum.gesamt} Spielen beendet{beendet ? ' · Endstand' : ''}
          </span>
        </h2>
        <button type="button" title="Schließt den Turnierbaum und kehrt zum Turnier zurück." onClick={schliessen}>
          Schließen
        </button>
      </div>
      {baum.art !== 'dko' ? (
        <div className="baum">
          <Zone titel={null} art="e" spiele={e} name={name} live={live} />
        </div>
      ) : nebeneinander ? (
        <div className="baum">
          <div className="baumzonen">
            <Zone titel="Gewinnerrunde" art="g" spiele={g} name={name} live={live} />
            <Zone titel="Verliererrunde" art="v" spiele={v} name={name} live={live} />
          </div>
          <div className="baumendrunde">
            <Zone titel="Endrunde" art="e" spiele={e} name={name} live={live} />
          </div>
        </div>
      ) : (
        <div className="baumzonen">
          <Zone titel="Gewinnerrunde" art="g" spiele={g} name={name} live={live} />
          <Zone titel="Verliererrunde" art="v" spiele={v} name={name} live={live} />
          <Zone titel="Endrunde" art="e" spiele={e} name={name} live={live} />
        </div>
      )}
      <p className="hinweis">
        Sieger fett, Ausgeschiedene grau, laufende Spiele gelb mit Tisch und Stand. Nur zum Ansehen: Ergebnisse trägst du im Spielplan ein.
      </p>
    </Modal>
  );
}
