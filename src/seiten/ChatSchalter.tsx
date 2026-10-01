// Knopf "Chat an/aus" im Kopf von Turnier und Liga-Spieltag, unter dem
// Live-Schalter. Erscheint nur, wenn der Verein den Chat eingeschaltet hat;
// so laesst er sich auch bei laufenden und aelteren Turnieren schalten.
export default function ChatSchalter({ an, schalten }: { an: boolean; schalten: (an: boolean) => void }) {
  return (
    <span className="umschalter">
      <button
        type="button"
        className={an ? 'aktiv' : ''}
        title="Mitglieder können auf der Seite „Zuschauen“ schreiben, solange das Turnier läuft."
        onClick={() => !an && schalten(true)}
      >
        Chat an
      </button>
      <button
        type="button"
        className={an ? '' : 'aktiv'}
        title="Kein Chat zu diesem Turnier. Bisherige Beiträge bleiben gespeichert, sind aber nicht mehr zu sehen."
        onClick={() => an && schalten(false)}
      >
        Chat aus
      </button>
    </span>
  );
}
