// =============================================================
//  Vollbild-Umschalter fuer die Kopfzeile
//  Verwendung (ES-Modul):
//    import { setupFullscreenButton } from "../js/fullscreen.js";
//    setupFullscreenButton();          // erwartet <button id="fsBtn">
//
//  Der Button wird ausgeblendet, wenn er nichts bewirken kann:
//    - Browser ohne Fullscreen-API (z. B. iPhone-Safari)
//    - Seite laeuft bereits ohne Browser-Leisten (Home-Bildschirm-App,
//      installierte PWA, Kiosk) -> es gibt nichts zu verstecken
// =============================================================

export function setupFullscreenButton(btnId = 'fsBtn') {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const root = document.documentElement;
  const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const chromeless =
    window.navigator.standalone === true ||                      // iOS: Home-Bildschirm-App
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches;

  if (!canFullscreen || chromeless) { btn.style.display = 'none'; return; }

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const sync = () => { btn.textContent = isFullscreen() ? '⤡ Beenden' : '⤢ Vollbild'; };

  btn.addEventListener('click', () => {
    // Ein abgelehnter Request (z. B. ohne Nutzergeste) darf nichts kaputtmachen.
    try {
      const p = isFullscreen()
        ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* still ignorieren – Beschriftung bleibt wie sie ist */ }
  });

  // Faengt auch das Verlassen per ESC oder Wischgeste ab.
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, sync));

  sync();
}
