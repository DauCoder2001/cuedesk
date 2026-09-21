// Hinweisleiste oben ueber dem Scoreboard, wenn sich die Kopplung des
// Tablets waehrend eines offenen Scoreboards aendert. Reine Anzeige; was
// passiert, entscheidet anbindung.ts ueber die uebergebenen Knoepfe.

export type Leiste =
  | { art: 'keine' }
  | { art: 'entkoppelt'; code: string | null; neuKoppeln: () => void }
  | { art: 'andererTisch'; neu: string | null; alt: string; wechseln: (() => void) | null }
  | { art: 'wiederGekoppelt'; neuLaden: () => void };

const FARBE = { entkoppelt: '#a32d2d', andererTisch: '#854f0b', wiederGekoppelt: '#0f6e56' };

let element: HTMLDivElement | null = null;

// Die Leiste liegt nicht ueber dem Scoreboard, sondern schiebt es nach unten:
// Sonst verdeckt sie die Knoepfe der Kopfzeile. Das 14.1-Board fuellt mit
// #app die volle Hoehe, das wird um die Leiste gekuerzt; das Pool-Board ist
// selbst eine Flex-Spalte und rueckt von allein.
function platzSchaffen() {
  const app = document.getElementById('app');
  if (!app) return;
  const hoehe = element ? element.offsetHeight : 0;
  const wert = hoehe ? `calc(100dvh - ${hoehe}px)` : '';
  app.style.height = wert;
  app.style.minHeight = wert;
}
window.addEventListener('resize', platzSchaffen); // Tablet gedreht: Leiste wird anders hoch

function knopf(text: string, aktion: () => void, textfarbe: string): HTMLButtonElement {
  const k = document.createElement('button');
  k.type = 'button';
  k.textContent = text;
  k.style.cssText = `background:#fff;color:${textfarbe};border:none;border-radius:6px;padding:6px 12px;font:inherit;font-weight:bold;cursor:pointer;white-space:nowrap`;
  k.addEventListener('click', aktion);
  return k;
}

export function leisteZeigen(leiste: Leiste): void {
  leisteAufbauen(leiste);
  platzSchaffen();
}

function leisteAufbauen(leiste: Leiste): void {
  if (leiste.art === 'keine') {
    element?.remove();
    element = null;
    return;
  }
  if (!element) {
    element = document.createElement('div');
    element.setAttribute('role', 'status');
    element.style.cssText =
      'flex:none;color:#fff;font:15px/1.35 Arial,sans-serif;' +
      'padding:8px 14px;display:flex;gap:12px;align-items:center;justify-content:space-between';
    document.body.prepend(element);
  }
  element.style.background = FARBE[leiste.art];
  element.replaceChildren();

  const text = document.createElement('span');
  element.appendChild(text);

  if (leiste.art === 'entkoppelt') {
    if (leiste.code) {
      text.innerHTML =
        'Kopplungscode <b style="font-size:20px;letter-spacing:3px;margin:0 4px">' +
        leiste.code +
        '</b> unter „Tische und Geräte“ eingeben (gültig 15 Minuten). Das Spiel läuft weiter.';
    } else {
      text.textContent =
        'Dieses Tablet ist nicht mehr mit CueDesk verbunden. Das Spiel läuft weiter, wird aber nicht gespeichert und ist nicht live zu sehen.';
      element.appendChild(knopf('Neu koppeln', leiste.neuKoppeln, FARBE.entkoppelt));
    }
    return;
  }

  if (leiste.art === 'wiederGekoppelt') {
    text.textContent =
      'Wieder gekoppelt. Das laufende Spiel wird noch nicht gespeichert. Nach dem Spiel neu laden, dann ist alles verbunden.';
    element.appendChild(knopf('Neu laden', leiste.neuLaden, FARBE.wiederGekoppelt));
    return;
  }

  text.textContent = leiste.neu
    ? `Dieses Tablet gehört jetzt zu Tisch ${leiste.neu}. Das Spiel läuft noch auf Tisch ${leiste.alt}.`
    : `Dieses Tablet ist keinem Tisch mehr zugeordnet. Das Spiel läuft noch auf Tisch ${leiste.alt}.`;
  if (leiste.neu && leiste.wechseln) {
    element.appendChild(knopf(`Zu Tisch ${leiste.neu}`, leiste.wechseln, FARBE.andererTisch));
  }
}
