// Oeffentlicher Live-Link eines Turniers (Stufe 32): Schluessel, Adresse und
// Ablaufzeit. Reine Rechnung, abgesichert durch test/oeffentlicher-link.test.ts.
// Die Seite dazu ist live.html, die Daten liefert oeffentliche_ansicht().

// 24 Zufallsbytes als base64url = 32 Zeichen (die Datenbank verlangt >= 32)
export function neuerSchluessel(zufall: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = zufall(new Uint8Array(24));
  let text = '';
  bytes.forEach((b) => (text += String.fromCharCode(b)));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Adresse des Links; basis = Herkunft plus Basispfad der Anwendung
// (z. B. "https://daucoder2001.github.io/cuedesk/")
export function linkAdresse(basis: string, schluessel: string): string {
  return `${basis.endsWith('/') ? basis : `${basis}/`}live.html?k=${encodeURIComponent(schluessel)}`;
}

// Vorschlag fuer "gueltig bis": Ende des Turniertags (23:59 Ortszeit), bei
// einem Turnier in der Vergangenheit Ende des heutigen Tages.
// Ergebnis im Format von <input type="date">.
export function standardGueltigBis(turnierDatum: string, jetzt = new Date()): string {
  const heute = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
  return turnierDatum >= heute ? turnierDatum : heute;
}

// Tag aus <input type="date"> -> Zeitpunkt 23:59:59 Ortszeit (ISO)
export function tagesende(tag: string): string {
  const [j, m, t] = tag.split('-').map(Number);
  return new Date(j, m - 1, t, 23, 59, 59).toISOString();
}

// Zeitpunkt (ISO) -> Tag fuer <input type="date"> in Ortszeit
export function tagVon(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const istAbgelaufen = (gueltigBis: string, jetzt = Date.now()) => Date.parse(gueltigBis) <= jetzt;

// Hat die Anfrage den Browser gar nicht verlassen (kein Netz, Werbe- oder
// Tracking-Blocker)? So melden es Chrome/Edge, Firefox und Safari.
export const istVerbindungsfehler = (meldung: string | null) =>
  Boolean(meldung) && /failed to fetch|networkerror|load failed|network request failed/i.test(meldung as string);
