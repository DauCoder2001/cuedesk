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
