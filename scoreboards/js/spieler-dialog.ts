// Auswahl der Disziplin fuer ein Pool-Spiel: drei grosse Knoepfe.
type PoolDisziplin = '8-ball' | '9-ball' | '10-ball';

export function disziplinDialog(vorgabe?: PoolDisziplin | null): Promise<PoolDisziplin | null> {
  return new Promise((fertig) => {
    const hinter = document.createElement('div');
    hinter.className = 'app-dlg-overlay';
    hinter.innerHTML = `
      <div class="app-dlg-box" role="dialog" aria-modal="true">
        <div class="app-dlg-title">Welche Disziplin wurde gespielt?</div>
        <div class="dz-knoepfe" style="display:flex;gap:10px;margin-top:8px"></div>
        <div class="app-dlg-actions"><button type="button" class="app-dlg-cancel">Abbrechen</button></div>
      </div>`;
    const leiste = hinter.querySelector('.dz-knoepfe') as HTMLElement;
    const schliessen = (wahl: PoolDisziplin | null) => {
      hinter.remove();
      fertig(wahl);
    };
    (
      [
        ['8-ball', '8-Ball'],
        ['9-ball', '9-Ball'],
        ['10-ball', '10-Ball']
      ] as [PoolDisziplin, string][]
    ).forEach(([wert, text]) => {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.textContent = text;
      knopf.style.cssText = `flex:1;padding:18px 8px;font-size:18px;${
        wert === vorgabe ? 'outline:3px solid #f1c40f;' : ''
      }`;
      knopf.addEventListener('click', () => schliessen(wert));
      leiste.appendChild(knopf);
    });
    (hinter.querySelector('.app-dlg-cancel') as HTMLElement).addEventListener('click', () => schliessen(null));
    hinter.addEventListener('click', (e) => {
      if (e.target === hinter) schliessen(null);
    });
    document.body.appendChild(hinter);
  });
}

// Auswahl eines Spielers am Tablet: Suche in der Mitgliederliste, darunter
// die Moeglichkeit, einen Gast mit Namen neu anzulegen. Gestaltet wie die
// uebrigen Dialoge der Scoreboards (dialogs.js).

type Eintrag = { id: string; name: string; gast: boolean };
export type Wahl = { id: string | null; name: string };

export function spielerDialog(titel: string, personen: Eintrag[], vorgabe = ''): Promise<Wahl | null> {
  return new Promise((fertig) => {
    const hinter = document.createElement('div');
    hinter.className = 'app-dlg-overlay';
    hinter.innerHTML = `
      <div class="app-dlg-box" role="dialog" aria-modal="true" style="max-width:520px">
        <div class="app-dlg-title"></div>
        <input class="app-dlg-input" type="search" placeholder="Name suchen" autocomplete="off">
        <div class="sp-liste" style="max-height:48vh;overflow:auto;margin-top:10px;border:1px solid #e2e8f0;border-radius:6px"></div>
        <div class="sp-gast" style="margin-top:12px;display:none">
          <div style="font-size:13px;color:#555;margin-bottom:6px">Nicht in der Liste? Als Gast anlegen:</div>
          <button type="button" class="sp-gast-knopf" style="width:100%"></button>
        </div>
        <div class="app-dlg-actions"><button type="button" class="app-dlg-cancel">Abbrechen</button></div>
      </div>`;

    const titelFeld = hinter.querySelector('.app-dlg-title') as HTMLElement;
    const suche = hinter.querySelector('.app-dlg-input') as HTMLInputElement;
    const liste = hinter.querySelector('.sp-liste') as HTMLElement;
    const gastBereich = hinter.querySelector('.sp-gast') as HTMLElement;
    const gastKnopf = hinter.querySelector('.sp-gast-knopf') as HTMLButtonElement;
    titelFeld.textContent = titel;
    suche.value = vorgabe;

    const schliessen = (wahl: Wahl | null) => {
      hinter.remove();
      document.removeEventListener('keydown', taste);
      fertig(wahl);
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') schliessen(null);
    };

    function zeichnen() {
      const text = suche.value.trim().toLowerCase();
      const treffer = personen.filter((p) => p.name.toLowerCase().includes(text));
      liste.innerHTML = '';
      treffer.forEach((p) => {
        const zeile = document.createElement('button');
        zeile.type = 'button';
        zeile.style.cssText =
          'display:block;width:100%;text-align:left;background:#fff;color:#1f3b73;border:none;border-bottom:1px solid #eef2f7;border-radius:0;padding:12px 14px;font-size:16px;font-weight:normal';
        zeile.textContent = p.gast ? `${p.name}  (Gast)` : p.name;
        zeile.addEventListener('click', () => schliessen({ id: p.id, name: p.name }));
        liste.appendChild(zeile);
      });
      if (treffer.length === 0) {
        liste.innerHTML = '<div style="padding:12px 14px;color:#777">Niemand gefunden.</div>';
      }
      const name = suche.value.trim();
      const schonDa = personen.some((p) => p.name.toLowerCase() === name.toLowerCase());
      gastBereich.style.display = name.length >= 2 && !schonDa ? 'block' : 'none';
      gastKnopf.textContent = `„${name}“ als Gast anlegen`;
    }

    suche.addEventListener('input', zeichnen);
    gastKnopf.addEventListener('click', () => schliessen({ id: null, name: suche.value.trim() }));
    (hinter.querySelector('.app-dlg-cancel') as HTMLElement).addEventListener('click', () => schliessen(null));
    hinter.addEventListener('click', (e) => {
      if (e.target === hinter) schliessen(null);
    });
    document.addEventListener('keydown', taste);

    document.body.appendChild(hinter);
    zeichnen();
    suche.focus();
  });
}
