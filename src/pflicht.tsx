// Pflichtfelder in allen Formularen.
//
// Ein Eingabefeld mit `required` bekommt per CSS ein Sternchen an seiner
// Beschriftung (.feld > span:first-child, siehe stil.css). usePflicht()
// gehoert zu genau einem Formular: `bereich` kommt an das umschliessende
// Element, `pruefen()` an den Anfang der Absende-Funktion. Leere Pflichtfelder
// werden dann rot umrandet und neben dem Knopf genannt; `melden()` zeigt dort
// auch andere Hinweise des Formulars.
import { useCallback, useRef, useState } from 'react';

// "Adresse (für spätere Vereinsseiten)" -> "Adresse"
export function feldName(beschriftung: string): string {
  return beschriftung.replace(/\s*\(.*\)\s*$/, '').replace(/\s*:\s*$/, '').trim();
}

export function fehltText(namen: string[]): string | null {
  const eindeutig = [...new Set(namen.filter(Boolean))];
  if (eindeutig.length === 0) return null;
  return `Bitte ausfüllen: ${eindeutig.join(', ')}.`;
}

type Feld = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function usePflicht<T extends HTMLElement = HTMLDivElement>() {
  const bereich = useRef<T>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const pruefen = useCallback((): boolean => {
    const el = bereich.current;
    if (!el) return true;
    const leer = [...el.querySelectorAll<Feld>('input:required, select:required, textarea:required')].filter(
      (f) => !f.disabled && !f.value.trim()
    );
    const namen = leer.map((f) => {
      const beschriftung = f.closest('.feld')?.querySelector(':scope > span')?.textContent;
      return feldName(beschriftung ?? f.getAttribute('aria-label') ?? f.getAttribute('placeholder') ?? '');
    });
    el.classList.toggle('versucht', leer.length > 0);
    setHinweis(fehltText(namen));
    if (leer.length > 0) leer[0].focus();
    return leer.length === 0;
  }, []);

  // Zeigt einen Hinweis am Knopf; gibt nichts zurueck, damit
  // `return pflicht.melden('...')` in Absende-Funktionen passt.
  const melden = useCallback((text: string | null): void => {
    setHinweis(text);
  }, []);

  const zuruecksetzen = useCallback(() => {
    bereich.current?.classList.remove('versucht');
    setHinweis(null);
  }, []);

  return { bereich, pruefen, melden, zuruecksetzen, hinweis };
}

// Steht neben dem Absende-Knopf: sonst "* Pflichtfeld", nach einem
// Fehlversuch der Hinweis in Rot.
export function Pflichthinweis({ hinweis, ohneLegende = false }: { hinweis: string | null; ohneLegende?: boolean }) {
  if (hinweis) return <small className="pflichthinweis fehlt" role="alert">{hinweis}</small>;
  if (ohneLegende) return null;
  return <small className="pflichthinweis">* Pflichtfeld</small>;
}
