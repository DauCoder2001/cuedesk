import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
    <RueckfrageDialog abbrechen={() => schliessen(false)}>
      <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{offen.text}</p>
      <div className="knopfpaar">
        <button type="button" autoFocus onClick={() => schliessen(true)}>
          {offen.ja}
        </button>
        <button type="button" onClick={() => schliessen(false)}>
          Abbrechen
        </button>
      </div>
    </RueckfrageDialog>
  ) : null;

  return [element, fragen];
}

// Modaler Rahmen fuer Rueckfragen (auch src/ungespeichert.tsx). Das native
// <dialog> mit showModal() liegt in der obersten Ebene ueber jedem anderen
// Dialog, haelt den Fokus fest, sperrt die Seite dahinter und schliesst mit
// Escape. Klick neben den Dialog zaehlt als Abbrechen. Beim Schliessen kehrt
// der Fokus zum Ausloeser zurueck.
export function RueckfrageDialog({ abbrechen, children }: { abbrechen: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  // Layout-Effekt: oeffnen vor dem ersten Bild, schliessen bevor React das
  // Element entfernt - nur close() gibt den Fokus an den Ausloeser zurueck
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const vorher = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      if (vorher instanceof HTMLElement && vorher.isConnected) vorher.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="rueckfragedialog"
      onCancel={(e) => {
        // Escape: Der Aufrufer schliesst ueber seinen Zustand
        e.preventDefault();
        abbrechen();
      }}
      onClick={(e) => e.target === e.currentTarget && abbrechen()}
    >
      <div className="dialog">{children}</div>
    </dialog>
  );
}
