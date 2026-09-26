// Hilfen fuer mehrere Vereine (docs/Mandanten.md). Reine Rechnung, getestet in
// test/mandanten.test.ts.

// Adresse (slug) aus dem Vereinsnamen: klein, ohne Umlaute, Bindestriche statt
// Leerzeichen, hoechstens 30 Zeichen - wie es die Datenbank verlangt.
export function adresseAusName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

// Beim Tippen der Web-Adresse: wie adresseAusName, aber ein Bindestrich am
// Ende bleibt stehen, sonst liesse sich "pbc-" nie weitertippen.
export function webAdresseEingabe(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .slice(0, 30);
}

// Homepage als Link: "www.verein.de" -> "https://www.verein.de"; leer bleibt leer
export function homepageLink(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// ---------- Konsole: Zustand von Sicherung und Rating ----------

export const TAG_MS = 24 * 60 * 60 * 1000;
// Die Sicherung laeuft woechentlich; nach 8 Tagen ohne Meldung stimmt etwas nicht
export const SICHERUNG_HOECHSTENS_TAGE = 8;
// Grenze des Gratis-Tarifs von Supabase fuer die Datenbank
export const DATENBANK_GRENZE_BYTES = 500 * 1024 * 1024;

export type SicherungsMeldung = { zeit: string; erfolg: boolean };
export type RatingLauf = { status: string; start: string };

// Warnung zur Sicherung oder null, wenn alles in Ordnung ist
export function sicherungsWarnung(letzte: SicherungsMeldung | null, jetzt: Date): string | null {
  if (!letzte) return 'Von der Sicherung ist noch keine Meldung angekommen.';
  if (!letzte.erfolg) return 'Die letzte Sicherung ist fehlgeschlagen.';
  const tage = (jetzt.getTime() - new Date(letzte.zeit).getTime()) / TAG_MS;
  if (tage > SICHERUNG_HOECHSTENS_TAGE) return `Die letzte Sicherung ist ${Math.floor(tage)} Tage alt.`;
  return null;
}

// Warnung zum naechtlichen Rating: der juengste Lauf zaehlt
export function ratingWarnung(laeufe: RatingLauf[], jetzt: Date): string | null {
  if (laeufe.length === 0) return 'Das nächtliche Rating ist noch nie gelaufen.';
  const juengster = [...laeufe].sort((a, b) => b.start.localeCompare(a.start))[0];
  if (juengster.status !== 'succeeded') return 'Der letzte Lauf des nächtlichen Ratings ist fehlgeschlagen.';
  if ((jetzt.getTime() - new Date(juengster.start).getTime()) / TAG_MS > 2) return 'Das nächtliche Rating ist seit mehr als zwei Tagen nicht gelaufen.';
  return null;
}

// Groesse lesbar: 17058963 -> "16,3 MB"
export function groesseText(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '–';
  const einheiten = ['B', 'KB', 'MB', 'GB'];
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < einheiten.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  return `${wert.toLocaleString('de-DE', { maximumFractionDigits: stufe === 0 ? 0 : 1 })} ${einheiten[stufe]}`;
}

// Protokoll "Verein geändert": nur die Felder, die sich geändert haben,
// z. B. "Kurzname: Bassum → PBC · Test-Verein: nein → ja"
const FELD_TEXT: Record<string, string> = {
  name: 'Name',
  kurzname: 'Kurzname',
  slug: 'Web-Adresse',
  test: 'Test-Verein',
  strasse: 'Straße',
  plz: 'PLZ',
  ort: 'Ort',
  homepage: 'Homepage',
  kontakt_email: 'Kontakt-E-Mail'
};

export function aenderungText(details: Record<string, unknown>): string {
  const vorher = (details.vorher ?? {}) as Record<string, unknown>;
  const nachher = (details.nachher ?? {}) as Record<string, unknown>;
  const wert = (x: unknown) => (typeof x === 'boolean' ? (x ? 'ja' : 'nein') : String(x ?? '–'));
  return Object.keys(FELD_TEXT)
    .filter((k) => k in nachher && (vorher[k] ?? null) !== (nachher[k] ?? null))
    .map((k) => `${FELD_TEXT[k]}: ${wert(vorher[k])} → ${wert(nachher[k])}`)
    .join(' · ');
}
