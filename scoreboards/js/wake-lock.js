// =============================================================
//  Screen Wake Lock – haelt den Bildschirm an (Kiosk-Betrieb)
//  Verwendung (ES-Modul):
//    import { keepScreenAwake } from "../js/wake-lock.js";
//    keepScreenAwake();
//
//  - No-op auf Browsern ohne Wake-Lock-API (iOS < 16.4, Firefox):
//    nur ein Konsolen-Hinweis, kein Fehler.
//  - Faellt bei visibilitychange, erster Eingabe UND periodisch nach,
//    damit auch reine Anzeige-Seiten (tv/*) ohne Interaktion abgedeckt
//    sind und ein vom OS freigegebener Lock erneut angefordert wird.
// =============================================================

export function keepScreenAwake() {
  if (!('wakeLock' in navigator)) {
    console.info('[wake-lock] Screen Wake Lock nicht unterstuetzt – ggf. Auto-Sperre am Geraet manuell auf "Nie" stellen.');
    return;
  }

  let lock = null;

  const acquire = async () => {
    if (lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch (e) {
      // z.B. noch kein User-Trigger oder Seite nicht sichtbar – spaeter erneut versuchen
      lock = null;
    }
  };

  acquire();                                              // best-effort direkt beim Laden

  document.addEventListener('visibilitychange', () => {   // nach Rueckkehr aus dem Hintergrund
    if (document.visibilityState === 'visible') acquire();
  });

  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>  // erste Eingabe (v.a. iOS)
    document.addEventListener(ev, acquire, { passive: true }));

  setInterval(acquire, 30000);                            // periodisch nachfassen (auch ohne Klick)
}
