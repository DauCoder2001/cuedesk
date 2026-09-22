/* ============================================================
   TV-Auto-Fit: skaliert einen "Stage"-Container so, dass sein
   Inhalt immer komplett in den sichtbaren Bereich passt – auch
   auf dem Kiosk-TV (kein Scrollen) und bei beliebiger Aufloesung
   oder Spielerzahl.

   overscanPct laesst einen Sicherheitsrand frei (viele TVs
   beschneiden den Bildrand). Wert kommt live aus system/tvSettings.

   Erwartete Struktur:
     <div id="tv-viewport"><div id="tv-stage"> ...Inhalt... </div></div>
     #tv-viewport{position:fixed;inset:0;display:flex;
                  align-items:center;justify-content:center;}
     #tv-stage{transform-origin:center center;}
     body{overflow:hidden;}

   Verwendung:
     import { startTvAutofit } from "./js/tv-autofit.js";
     const refit = startTvAutofit(stageEl, () => overscanPct);
     // nach jedem Render / Datenwechsel:  refit();
   ============================================================ */
export function startTvAutofit(stage, getOverscan) {
  // Synchron messen + skalieren. offsetWidth/offsetHeight sind von transform
  // UNBEEINFLUSST (liefern die echte, ungeskalierte Inhaltsgroesse) und das Lesen
  // erzwingt ein frisches Layout – daher kein requestAnimationFrame noetig (das
  // koennte in ausgeblendeten Tabs ausbleiben und den Refit dauerhaft blockieren).
  function fit() {
    let pct = Number(getOverscan && getOverscan());
    if (!Number.isFinite(pct)) pct = 0;
    pct = Math.max(0, Math.min(20, pct));
    const m = 1 - pct / 100;                      // Sicherheitsrand (Faktor)
    const availW = window.innerWidth  * m;
    const availH = window.innerHeight * m;
    const cw = stage.offsetWidth, ch = stage.offsetHeight;
    if (!cw || !ch) return;
    const k = Math.min(availW / cw, availH / ch, 1);   // nur verkleinern
    stage.style.transform = 'scale(' + k + ')';
  }

  window.addEventListener('resize', fit);
  fit();
  return fit;
}
