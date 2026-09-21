// =============================================================
//  Eigene Dialoge ohne Browser-Praefix ("… enthaelt")
//  - window.alert  -> gestyltes Hinweis-Modal (Aufrufe unveraendert)
//  - window.confirmModal(msg)        -> Promise<boolean>   (Ersatz fuer confirm)
//  - window.promptModal(msg, vorgabe)-> Promise<string|null>(Ersatz fuer prompt)
//  Als klassisches Script VOR den Modulen einbinden:
//    <script src="js/dialogs.js"></script>
//  confirm/prompt-Aufrufstellen werden auf 'await confirmModal(...)' bzw.
//  'await promptModal(...)' umgestellt (Funktion muss async sein).
// =============================================================
(function () {
  const style = document.createElement('style');
  style.textContent =
    '.app-dlg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:99999;}' +
    '.app-dlg-box{background:#fff;color:#333;border-radius:10px;padding:22px 24px;max-width:460px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:Arial,sans-serif;}' +
    '.app-dlg-box .app-dlg-title{font-weight:bold;color:#1f3b73;font-size:16px;margin-bottom:10px;}' +
    '.app-dlg-box .app-dlg-msg{white-space:pre-wrap;font-size:15px;line-height:1.5;}' +
    '.app-dlg-box .app-dlg-input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;margin-top:12px;box-sizing:border-box;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;}' +
    '.app-dlg-box .app-dlg-actions{text-align:right;margin-top:18px;}' +
    '.app-dlg-box .app-dlg-actions button{margin-left:8px;}' +
    '.app-dlg-box button{background:#1f3b73;color:#fff;border:none;padding:9px 22px;border-radius:7px;font-weight:bold;font-size:14px;cursor:pointer;}' +
    '.app-dlg-box button:hover{background:#16294f;}' +
    '.app-dlg-box button.app-dlg-cancel{background:#6c757d;}' +
    '.app-dlg-box button.app-dlg-cancel:hover{background:#5a6268;}';
  (document.head || document.documentElement).appendChild(style);

  function buildOverlay(innerHTML) {
    const ov = document.createElement('div');
    ov.className = 'app-dlg-overlay';
    ov.innerHTML = '<div class="app-dlg-box" role="dialog" aria-modal="true">' + innerHTML + '</div>';
    document.body.appendChild(ov);
    return ov;
  }

  const TITLE = '<div class="app-dlg-title">🎱 Billard-Turnier</div>';

  // Hinweis (Ersatz fuer alert) – nicht blockierend
  window.alert = function (msg) {
    const ov = buildOverlay(TITLE +
      '<div class="app-dlg-msg"></div>' +
      '<div class="app-dlg-actions"><button type="button" class="app-dlg-ok">OK</button></div>');
    ov.querySelector('.app-dlg-msg').textContent = String(msg == null ? '' : msg);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') close(); }
    ov.querySelector('.app-dlg-ok').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    ov.querySelector('.app-dlg-ok').focus();
  };

  // Ja/Nein-Abfrage (Ersatz fuer confirm) -> Promise<boolean>
  window.confirmModal = function (msg) {
    return new Promise((resolve) => {
      const ov = buildOverlay(TITLE +
        '<div class="app-dlg-msg"></div>' +
        '<div class="app-dlg-actions">' +
        '<button type="button" class="app-dlg-cancel">Abbrechen</button>' +
        '<button type="button" class="app-dlg-ok">OK</button></div>');
      ov.querySelector('.app-dlg-msg').textContent = String(msg == null ? '' : msg);
      const done = (val) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
      function onKey(e) { if (e.key === 'Escape') done(false); else if (e.key === 'Enter') done(true); }
      ov.querySelector('.app-dlg-ok').addEventListener('click', () => done(true));
      ov.querySelector('.app-dlg-cancel').addEventListener('click', () => done(false));
      ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
      document.addEventListener('keydown', onKey);
      ov.querySelector('.app-dlg-ok').focus();
    });
  };

  // Texteingabe (Ersatz fuer prompt) -> Promise<string|null> (null = abgebrochen)
  // opts (optional): { maxLength: N, numeric: true } begrenzt das Eingabefeld.
  window.promptModal = function (msg, vorgabe, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const ov = buildOverlay(TITLE +
        '<div class="app-dlg-msg"></div>' +
        '<input type="text" class="app-dlg-input">' +
        '<div class="app-dlg-actions">' +
        '<button type="button" class="app-dlg-cancel">Abbrechen</button>' +
        '<button type="button" class="app-dlg-ok">OK</button></div>');
      ov.querySelector('.app-dlg-msg').textContent = String(msg == null ? '' : msg);
      const inp = ov.querySelector('.app-dlg-input');
      inp.value = vorgabe == null ? '' : String(vorgabe);
      if (opts.maxLength) inp.maxLength = opts.maxLength;          // Eingabefeld auf N Zeichen begrenzen
      if (opts.numeric) {                                          // nur Ziffern zulassen
        inp.inputMode = 'numeric';
        inp.addEventListener('input', () => {
          let v = inp.value.replace(/\D/g, '');
          if (opts.maxLength) v = v.slice(0, opts.maxLength);
          inp.value = v;
        });
      }
      const done = (val) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
      function onKey(e) { if (e.key === 'Escape') done(null); }
      ov.querySelector('.app-dlg-ok').addEventListener('click', () => done(inp.value));
      ov.querySelector('.app-dlg-cancel').addEventListener('click', () => done(null));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } });
      ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
      document.addEventListener('keydown', onKey);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  };
})();
