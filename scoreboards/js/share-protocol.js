// =============================================================
//  Protokoll teilen / per Mail senden
//  Verwendung (ES-Modul):
//    import { setupProtocolShare } from "../js/share-protocol.js";
//    setupProtocolShare({
//      btnId: 'log-share', summaryId: 'log-summary',
//      tableId: 'log-table', legendId: 'log-legend',
//      titel: () => '14.1 Protokoll - Tisch ' + tableId
//    });
//
//  Auf dem iPad uebergibt navigator.share die fertige HTML-Datei ans
//  Teilen-Blatt; Mail haengt sie dort als Anhang an. Kann das Geraet keine
//  Dateien teilen, oeffnet mailto: mit dem Protokoll als Text im Rumpf.
//
//  Der Inhalt wird aus dem BEREITS GERENDERTEN Protokoll gelesen (der Knopf
//  sitzt im offenen Protokoll) - es gibt also keinen zweiten Renderpfad,
//  der vom Bildschirm abweichen koennte.
// =============================================================

// Regeln aus den Stylesheets der Seite einsammeln, damit die Datei genauso
// aussieht wie das Protokoll auf dem Schirm.
const SELEKTOR = /(^|[\s,>])(#log-|\.pz-|\.ls-|#ptable|#summary|#legend)/;

function seitenCss() {
  const teile = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let regeln;
    try { regeln = sheet.cssRules; }
    catch (e) { continue; }        // fremdes Stylesheet -> nicht lesbar, ueberspringen
    if (!regeln) continue;
    for (const r of Array.from(regeln)) {
      if (r.selectorText && SELEKTOR.test(r.selectorText)) teile.push(r.cssText);
    }
  }
  return teile.join('\n');
}

// Sockel + Notnagel, falls oben nichts herauskam (z. B. alle Stylesheets extern).
const BASIS_CSS = `
  body { font-family: Arial, sans-serif; background: #fff; color: #222; margin: 16px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .kopf-datum { font-size: 12px; color: #666; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed;
          font-size: 14px; text-align: center; }
  th, td { padding: 5px 2px; border-bottom: 1px solid #eee; }
  thead th { background: #f4f4f4; }
  .fuss { margin-top: 14px; font-size: 11px; color: #888; }
  @page { size: A4 portrait; margin: 12mm; }
`;

function textVon(id) {
  const el = document.getElementById(id);
  return el ? el.innerHTML : '';
}

// Kopfzeile als Text. NICHT ueber textContent des ganzen Blocks - das klebt
// Name und Punktzahl aneinander ("Spieler 17"). Stattdessen Feld fuer Feld.
export function summaryText(summaryId) {
  const sum = document.getElementById(summaryId);
  if (!sum) return '';
  const zeilen = [];
  sum.querySelectorAll('.ls-p').forEach(p => {
    const feld = k => { const e = p.querySelector(k); return e ? e.textContent.trim() : ''; };
    zeilen.push([feld('.ls-name'), feld('.ls-score'), feld('.ls-stats')].filter(Boolean).join('  '));
  });
  const ziel = sum.querySelector('.ls-target');
  if (ziel) {
    const z = Array.from(ziel.children).map(e => e.textContent.trim()).filter(Boolean).join(' · ');
    if (z) zeilen.push(z);
  }
  // Notnagel, falls die Struktur einmal abweicht
  if (!zeilen.length) return sum.textContent.replace(/\s+/g, ' ').trim();
  return zeilen.filter(Boolean).join('\n');
}

// Paarung "A vs. B" aus dem gerenderten Kopf. Beide Boards schreiben die Namen
// in .ls-name (Platzhalter "Spieler 1"/"Spieler 2", solange nichts eingegeben
// wurde). Leer, wenn dort nicht genau zwei Namen stehen - z. B. wenn am Tisch
// gerade kein 14.1 laeuft; dann bleiben Betreff und Text wie bisher.
export function paarungText(summaryId) {
  const sum = document.getElementById(summaryId);
  if (!sum) return '';
  const namen = Array.from(sum.querySelectorAll('.ls-name'))
    .map(e => e.textContent.trim()).filter(Boolean);
  return namen.length === 2 ? namen[0] + ' vs. ' + namen[1] : '';
}

// Reine Textfassung fuer die mailto-Rueckfallebene: dieselben Tabellenzeilen,
// nur in Spalten ausgerichtet. Von den Kopfzeilen nur die untere (die obere
// hat colspan und wuerde die Spaltenbreiten verziehen).
function alsText(tableId, summaryId) {
  const zeilen = [];
  const kopf = summaryText(summaryId);
  if (kopf) zeilen.push(kopf, '');
  const tab = document.getElementById(tableId);
  if (tab) {
    const kopfZeile = tab.querySelector('thead tr:last-child');
    const trs = (kopfZeile ? [kopfZeile] : []).concat(Array.from(tab.querySelectorAll('tbody tr')));
    const alle = trs.map(tr => Array.from(tr.cells).map(c => c.textContent.trim()));
    const breite = [];
    alle.forEach(z => z.forEach((c, i) => { breite[i] = Math.max(breite[i] || 0, c.length); }));
    alle.forEach(z => zeilen.push(z.map((c, i) => c.padEnd(breite[i])).join('  ').trimEnd()));
  }
  return zeilen.join('\n');
}

// Umlaute und Sonderzeichen aus dem Dateinamen halten.
function dateiSicher(s) {
  return String(s || '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/_+/g, '_')     // sonst "Tisch9__2026-.." wenn Namen fehlen
    .replace(/^[-_]+|[-_]+$/g, '');
}

// Ein Fehler beim Einrichten darf die aufrufende Seite nicht mitreissen. Der
// Aufruf steht bei den Boards im selben Skriptblock wie deren Initialisierung -
// ohne diese Kapsel wuerde ein Ausrutscher hier das ganze Board am Starten hindern.
export function setupProtocolShare(opts) {
  try { einrichten(opts); }
  catch (e) { console.error('Teilen-Knopf nicht verfuegbar:', e); }
}

function einrichten(opts) {
  const o = opts || {};
  const btn = document.getElementById(o.btnId || 'log-share');
  if (!btn) return;

  const wert = v => (typeof v === 'function' ? v() : v);

  btn.addEventListener('click', () => {
    const titel = wert(o.titel) || 'Protokoll';
    // Ohne die Paarung steht im Posteingang nur "... - Tisch 3".
    const paar = paarungText(o.summaryId || 'log-summary');
    const titelVoll = paar ? titel + ' - ' + paar : titel;
    const datum = new Date();
    const stempel = datum.toISOString().slice(0, 10);
    const name = dateiSicher(wert(o.dateiBasis) || titel) + '_' + stempel + '.html';

    const css = (seitenCss() || '') + BASIS_CSS;
    const html =
      '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + titelVoll + '</title><style>' + css + '</style></head><body>' +
      '<h1>' + titelVoll + '</h1>' +
      '<p class="kopf-datum">' + datum.toLocaleString('de-DE') + '</p>' +
      '<div id="' + (o.summaryId || 'log-summary') + '">' + textVon(o.summaryId || 'log-summary') + '</div>' +
      (document.getElementById(o.tableId || 'log-table')
        ? document.getElementById(o.tableId || 'log-table').outerHTML : '') +
      '<div id="' + (o.legendId || 'log-legend') + '">' + textVon(o.legendId || 'log-legend') + '</div>' +
      '<p class="fuss">Erstellt mit dem Billard-Turnier-Scoreboard.</p>' +
      '</body></html>';

    // Synchron bauen, damit die Nutzergeste fuer navigator.share erhalten bleibt.
    let datei = null;
    try { datei = new File([html], name, { type: 'text/html' }); } catch (e) { /* alte Browser */ }

    if (datei && navigator.canShare && navigator.canShare({ files: [datei] })) {
      const p = navigator.share({ files: [datei], title: titelVoll });
      // Bricht der Nutzer das Teilen-Blatt ab, ist das kein Fehler.
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return;
    }

    // Rueckfallebene: Mail mit dem Protokoll als Text.
    const kurz = 'Vollstaendiges Protokoll bitte ueber "Drucken" als PDF sichern - '
               + 'es ist fuer den Mailtext zu lang.';
    const paarZeile = paar ? paar + '\n\n' : '';
    let rumpf = paarZeile + alsText(o.tableId || 'log-table', o.summaryId || 'log-summary');
    // Gemessen wird der fertige Rumpf - das ist die Laenge, auf die es fuer die
    // mailto-URL ankommt.
    if (encodeURIComponent(rumpf).length > 1500) {
      rumpf = paarZeile + summaryText(o.summaryId || 'log-summary') + '\n\n' + kurz;
    }
    window.location.href = 'mailto:?subject=' + encodeURIComponent(titelVoll) +
                           '&body=' + encodeURIComponent(rumpf);
  });
}
