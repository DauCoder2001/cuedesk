// Ungespeicherte Eingaben nicht stillschweigend verlieren.
//
// Formulare melden sich mit useUngespeichert(), solange ihre Eingaben vom
// gespeicherten Stand abweichen. Vor jedem Wechsel (Reiter, anderer Eintrag,
// neuer Eintrag, Verein, Abmelden) fragt wechselErlaubt(): Speichern,
// Verwerfen oder Zurueck. Beim Neuladen oder Schliessen des Fensters fragt der
// Browser selbst.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Eintrag = { beschreibung: string; speichern: () => Promise<unknown> };
type Wahl = 'speichern' | 'verwerfen' | 'zurueck';

const Kontext = createContext<{
  melden: (schluessel: string, eintrag: Eintrag | null) => void;
  wechselErlaubt: () => Promise<boolean>;
} | null>(null);

// Text der Rueckfrage aus den Beschreibungen der offenen Formulare
export function frageText(beschreibungen: string[]): string {
  if (beschreibungen.length === 1) return `${beschreibungen[0]} ist noch nicht gespeichert.`;
  return `Noch nicht gespeichert:\n${beschreibungen.map((b) => `– ${b}`).join('\n')}`;
}

// Weicht der Formularstand vom festgehaltenen Stand ab? Beide als Werte,
// verglichen ueber JSON - reicht fuer die einfachen Formulardaten hier.
export function weichtAb(aktuell: unknown, ursprung: unknown): boolean {
  if (aktuell === null || aktuell === undefined || ursprung === null || ursprung === undefined) return false;
  return JSON.stringify(aktuell) !== JSON.stringify(ursprung);
}

export function UngespeichertBereich({ children }: { children: ReactNode }) {
  const eintraege = useRef(new Map<string, Eintrag>());
  const [frage, setFrage] = useState<string | null>(null);
  const antwort = useRef<((wahl: Wahl) => void) | null>(null);

  useEffect(() => {
    const vorDemVerlassen = (e: BeforeUnloadEvent) => {
      if (eintraege.current.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', vorDemVerlassen);
    return () => window.removeEventListener('beforeunload', vorDemVerlassen);
  }, []);

  const melden = useCallback((schluessel: string, eintrag: Eintrag | null) => {
    if (eintrag) eintraege.current.set(schluessel, eintrag);
    else eintraege.current.delete(schluessel);
  }, []);

  const wechselErlaubt = useCallback(async () => {
    if (eintraege.current.size === 0) return true;
    const offen = [...eintraege.current.values()];
    const wahl = await new Promise<Wahl>((fertig) => {
      antwort.current = fertig;
      setFrage(frageText(offen.map((e) => e.beschreibung)));
    });
    setFrage(null);
    antwort.current = null;
    if (wahl === 'zurueck') return false;
    if (wahl === 'speichern') {
      // Jede Speicher-Funktion liefert true, wenn sie gespeichert hat. Sonst
      // (Pflichtfeld leer, Fehler) bleibt man beim Formular und sieht den Hinweis.
      for (const e of offen) {
        if ((await e.speichern()) !== true) return false;
      }
    }
    eintraege.current.clear();
    return true;
  }, []);

  const waehlen = (wahl: Wahl) => antwort.current?.(wahl);

  return (
    <Kontext.Provider value={{ melden, wechselErlaubt }}>
      {children}
      {frage && (
        <div className="dialoghintergrund" onClick={() => waehlen('zurueck')}>
          <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{frage}</p>
            <div className="knopfpaar">
              <button type="button" autoFocus title="Erst speichern, dann weiter" onClick={() => waehlen('speichern')}>
                Speichern
              </button>
              <button type="button" className="gefahrknopf" title="Die Eingaben verwerfen und weiter" onClick={() => waehlen('verwerfen')}>
                Verwerfen
              </button>
              <button type="button" title="Beim Formular bleiben" onClick={() => waehlen('zurueck')}>
                Zurück
              </button>
            </div>
          </div>
        </div>
      )}
    </Kontext.Provider>
  );
}

// Vor einem Wechsel aufrufen: `if (!(await wechselErlaubt())) return;`
export function useWechsel(): () => Promise<boolean> {
  const k = useContext(Kontext);
  return k?.wechselErlaubt ?? (async () => true);
}

// Ein Formular meldet sich an, solange `geaendert` gilt. `speichern` muss
// true liefern, wenn es gespeichert hat.
export function useUngespeichert(
  schluessel: string,
  geaendert: boolean,
  beschreibung: string,
  speichern: () => Promise<unknown>
): () => Promise<boolean> {
  const k = useContext(Kontext);
  const aktuellesSpeichern = useRef(speichern);
  aktuellesSpeichern.current = speichern;
  useEffect(() => {
    if (!k) return;
    k.melden(schluessel, geaendert ? { beschreibung, speichern: () => aktuellesSpeichern.current() } : null);
    return () => k.melden(schluessel, null);
  }, [k, schluessel, geaendert, beschreibung]);
  return k?.wechselErlaubt ?? (async () => true);
}
