import TvHerunterfahren from './TvHerunterfahren';
import type { TurnierEinstellungen } from './Turniere';

// Zeile "TV zeigt:" im festen Kopf von Turnier, Teamvergleich und Liga-Spieltag
// (Audit-Befund 5, 19.11.2026): Umschalter fuer die TV-Anzeige und daneben
// "TV-Gerät herunterfahren". Welche Ansichten es gibt, entscheidet die
// jeweilige Seite; ohne Ansichten steht nur der Knopf in der Zeile (Liga-Spieltag
// mit einer Begegnung nach dem Abschluss).

export type TvAnsicht = NonNullable<TurnierEinstellungen['tvAnsicht']>;
export type TvOption = readonly [wert: TvAnsicht, name: string];

// "Live + Nächste" gibt es bei 3 bis 6 aktiven Tischen: bei 3 und 5 in der
// freien Kachel des TV-Rasters, bei 4 und 6 als Spalte rechts
export const mitLiveNaechste = (aktiveTische: number) => aktiveTische >= 3 && aktiveTische <= 6;

export default function TvZeile({
  vereinId,
  optionen,
  aktiv,
  setzen,
  laeuftNoch
}: {
  vereinId: string;
  optionen: readonly TvOption[];
  aktiv: TvAnsicht;
  setzen: (wert: TvAnsicht) => void;
  laeuftNoch?: string; // z. B. "Das Turnier läuft noch." - Warnung beim Herunterfahren
}) {
  return (
    <div className="zeile">
      {optionen.length > 0 && (
        <>
          <span className="hinweis">TV zeigt:</span>
          <span className="umschalter">
            {optionen.map(([wert, name]) => (
              <button
                key={wert}
                type="button"
                className={aktiv === wert ? 'aktiv' : ''}
                title={`Legt fest, was die TV-Anzeige zeigt: ${name}`}
                onClick={() => setzen(wert)}
              >
                {name}
              </button>
            ))}
          </span>
        </>
      )}
      <TvHerunterfahren vereinId={vereinId} laeuftNoch={laeuftNoch} />
    </div>
  );
}
