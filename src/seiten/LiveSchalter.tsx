// Knopf "Live an/aus" im Kopf von Turnier und Liga-Spieltag (Stufe 25):
// Solange das Turnier laeuft und Live an ist, sehen Mitglieder und Fernseher
// die Spielstaende aller Tische; sonst nur die Turnierleitung. Die Regel
// selbst steht in der Datenbank (live_lesen, live_uebertragen).
export default function LiveSchalter({ an, schalten }: { an: boolean; schalten: (an: boolean) => void }) {
  return (
    <span className="umschalter">
      <button
        type="button"
        className={an ? 'aktiv' : ''}
        title="Spielstände aller Tische auf Live, Zuschauen und dem Fernseher zeigen, solange das Turnier läuft."
        onClick={() => !an && schalten(true)}
      >
        Live an
      </button>
      <button
        type="button"
        className={an ? '' : 'aktiv'}
        title="Keine Live-Übertragung: Spielstände sieht nur noch die Turnierleitung."
        onClick={() => an && schalten(false)}
      >
        Live aus
      </button>
    </span>
  );
}
