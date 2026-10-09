import { useLayoutEffect, useRef } from 'react';
import type { ReactNode, Ref } from 'react';

// Rahmen fuer alle Dialoge der Anwendung. Das native <dialog> mit showModal()
// liegt in der obersten Ebene, ein spaeter geoeffneter (z. B. eine Rueckfrage)
// immer ueber dem frueheren. Es haelt den Fokus fest, sperrt die Seite
// dahinter und schliesst mit Escape. Klick neben den Dialog zaehlt wie
// Escape als `abbrechen`; wer waehrend einer Arbeit nicht schliessen darf,
// prueft das in `abbrechen` selbst. Beim Schliessen kehrt der Fokus zum
// Ausloeser zurueck.
//
// Der Fokus geht beim Oeffnen auf das erste bedienbare Element im Dialog;
// autoFocus von React greift nicht, weil der Dialog beim Einhaengen noch
// geschlossen ist.
//
//   {offen && <Modal abbrechen={() => setOffen(false)}>...</Modal>}
export function Modal({
  abbrechen,
  breit,
  bereich,
  children
}: {
  abbrechen: () => void;
  breit?: boolean;
  bereich?: Ref<HTMLDivElement>; // z. B. usePflicht().bereich
  children: ReactNode;
}) {
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
      className={breit ? 'modal breit' : 'modal'}
      onCancel={(e) => {
        // Escape: Der Aufrufer schliesst ueber seinen Zustand
        e.preventDefault();
        abbrechen();
      }}
      onClick={(e) => e.target === e.currentTarget && abbrechen()}
    >
      <div className="dialog" ref={bereich}>
        {children}
      </div>
    </dialog>
  );
}
