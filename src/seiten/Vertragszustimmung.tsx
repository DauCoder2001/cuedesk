import { useState } from 'react';
import { supabase } from '../supabase';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { VERTRAEGE, VERTRAG_FASSUNG, ZUSTIMMUNG_TEXT } from '../vertraege';

// Steht statt der Verwaltung, solange der Verein der aktuellen Fassung von
// Nutzungsbedingungen und AVV nicht zugestimmt hat (Stufe 23). Zustimmen
// kann nur ein Vereins-Administrator; Tablets und TV sind nicht betroffen.
export default function Vertragszustimmung({
  vereinId,
  vereinName,
  darfZustimmen,
  abmelden,
  zugestimmt
}: {
  vereinId: string;
  vereinName: string;
  darfZustimmen: boolean;
  abmelden: () => void;
  zugestimmt: () => void;
}) {
  const [haken, setHaken] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const pflicht = usePflicht<HTMLDivElement>();

  async function zustimmen() {
    if (!haken) return pflicht.melden('Bitte zuerst den Haken setzen.');
    setArbeitet(true);
    const { error } = await supabase.rpc('vertrag_zustimmen', { p_verein: vereinId, p_fassung: VERTRAG_FASSUNG });
    setArbeitet(false);
    if (error) return pflicht.melden(error.message);
    zugestimmt();
  }

  if (!darfZustimmen) {
    return (
      <div className="einspaltig">
        <section className="block">
          <h2>{vereinName}: noch keine Zustimmung</h2>
          <p>
            Der Verein hat den Nutzungsbedingungen noch nicht zugestimmt. Das erledigt ein Vereins-Administrator; danach
            geht es hier wie gewohnt weiter.
          </p>
          <div className="knopfpaar">
            <button type="button" title="Von CueDesk abmelden" onClick={abmelden}>
              Abmelden
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="einspaltig">
      <section className="block" ref={pflicht.bereich}>
        <h2>Bevor es losgeht</h2>
        <p>
          CueDesk verarbeitet die Daten von {vereinName} in eurem Auftrag. Dafür braucht es die Zustimmung des Vereins zu
          diesen beiden Texten:
        </p>
        <ul className="rechtsliste">
          {VERTRAEGE.map((v) => (
            <li key={v.datei}>
              {v.name} (Fassung {v.fassung}){' '}
              <a href={`${import.meta.env.BASE_URL}${v.datei}`} target="_blank" rel="noreferrer" title={`${v.name} in einem neuen Fenster öffnen`}>
                öffnen ↗
              </a>
            </li>
          ))}
        </ul>
        <label className="ankreuz">
          <input
            type="checkbox"
            checked={haken}
            onChange={(e) => {
              setHaken(e.target.checked);
              pflicht.zuruecksetzen();
            }}
          />
          <span>{ZUSTIMMUNG_TEXT}</span>
        </label>
        <div className="knopfpaar">
          <button
            type="button"
            title="Speichert die Zustimmung mit Fassung, Zeitpunkt und deinem Konto."
            disabled={arbeitet}
            onClick={() => void zustimmen()}
          >
            Für den Verein zustimmen
          </button>
          <button type="button" title="Von CueDesk abmelden, ohne zuzustimmen" onClick={abmelden}>
            Abmelden
          </button>
          <Pflichthinweis hinweis={pflicht.hinweis} ohneLegende />
        </div>
      </section>
    </div>
  );
}
