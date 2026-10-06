import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Eigene Rueckfrage statt window.confirm: gleicher Stil wie die Anwendung.
//
//   const [rueckfrage, fragen] = useRueckfrage();
//   if (!(await fragen('Wirklich loeschen?'))) return;
//   ...
//   return <>{...}{rueckfrage}</>;

export function useRueckfrage(): [ReactNode, (text: string, ja?: string) => Promise<boolean>] {
  const [offen, setOffen] = useState<{ text: string; ja: string } | null>(null);
  const antwort = useRef<((ok: boolean) => void) | null>(null);

  const fragen = useCallback(
    (text: string, ja = 'Ja') =>
      new Promise<boolean>((fertig) => {
        antwort.current = fertig;
        setOffen({ text, ja });
      }),
    []
  );

  const schliessen = (ok: boolean) => {
    setOffen(null);
    antwort.current?.(ok);
    antwort.current = null;
  };

  const element = offen ? (
    // Eigene Ebene: Eine Rueckfrage liegt immer ueber einem offenen Dialog,
    // egal wo sie im Seitenaufbau steht
    <div className="dialoghintergrund rueckfrageebene" onClick={() => schliessen(false)}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{offen.text}</p>
        <div className="knopfpaar">
          <button type="button" autoFocus onClick={() => schliessen(true)}>
            {offen.ja}
          </button>
          <button type="button" onClick={() => schliessen(false)}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [element, fragen];
}
