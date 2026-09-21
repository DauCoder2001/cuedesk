/* ============================================================
   Inaktivitaets-Erkennung (Leerlauf).

   startIdleAction(action, idleMs, checkMs?)
   - Fuehrt action() aus, sobald idleMs lang KEINE lokale Eingabe
     (Tippen/Klick/Touch) erfolgt ist. Firebase-Updates zaehlen
     bewusst NICHT (es geht um "dieses Geraet wird gerade nicht bedient").
   - Nach dem Ausloesen wird der Zaehler zurueckgesetzt -> action()
     feuert pro Leerlauf-Phase einmal (nicht im checkMs-Takt).
   - Robust gegen Timer-Drosselung: vergleicht periodisch die
     verstrichene Zeit statt eines einzelnen langen setTimeout.

   startIdleRedirect(targetUrl, idleMs, checkMs?)
   - Bequemer Spezialfall: springt bei Leerlauf auf targetUrl.

   Verwendung:
     import { startIdleAction, startIdleRedirect } from "./js/idle-timeout.js";
     // Scoreboard: nach 4 h Leerlauf zurueck zur Startseite
     startIdleRedirect('Tablet-Startseite.html?table=' + tableId, 4*60*60*1000);
     // Admin-Seite: nach 30 min Leerlauf abmelden
     startIdleAction(() => { if (isAdmin) signOut(auth); }, 30*60*1000);
   ============================================================ */
export function startIdleAction(action, idleMs, checkMs = 60000) {
  let last = Date.now();
  const bump = () => { last = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, bump, { passive: true }));
  setInterval(() => {
    if (Date.now() - last >= idleMs) {
      last = Date.now();   // Zaehler zuruecksetzen -> pro Leerlauf-Phase einmal
      action();
    }
  }, checkMs);
}

export function startIdleRedirect(targetUrl, idleMs, checkMs = 60000) {
  startIdleAction(() => { window.location.href = targetUrl; }, idleMs, checkMs);
}
