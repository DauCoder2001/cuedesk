// Knopf "Chat an/aus" im Kopf von Turnier und Liga-Spieltag, unter dem
// Live-Schalter. Erscheint nur, wenn der Verein den Chat eingeschaltet hat;
// so laesst er sich auch bei laufenden und aelteren Turnieren schalten.
// Bei "Live aus" ist er gesperrt und zeigt "Chat aus" (Stufe 29); die
// gespeicherte Einstellung bleibt und gilt wieder, sobald Live an ist.
export default function ChatSchalter({
  an,
  schalten,
  gesperrt = false
}: {
  an: boolean;
  schalten: (an: boolean) => void;
  gesperrt?: boolean;
}) {
  const wirksam = an && !gesperrt;
  const sperrText = 'Ohne Live-Übertragung gibt es keinen Chat. Mit „Live an“ ist er wieder so wie vorher.';
  return (
    <span className="umschalter">
      <button
        type="button"
        className={wirksam ? 'aktiv' : ''}
        disabled={gesperrt}
        title={gesperrt ? sperrText : 'Mitglieder können auf der Seite „Zuschauen“ schreiben, solange das Turnier läuft.'}
        onClick={() => !an && schalten(true)}
      >
        Chat an
      </button>
      <button
        type="button"
        className={wirksam ? '' : 'aktiv'}
        disabled={gesperrt}
        title={
          gesperrt ? sperrText : 'Kein Chat zu diesem Turnier. Bisherige Beiträge bleiben gespeichert, sind aber nicht mehr zu sehen.'
        }
        onClick={() => an && schalten(false)}
      >
        Chat aus
      </button>
    </span>
  );
}
