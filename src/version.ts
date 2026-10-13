// Versionsangabe fuer die Konsole: laufende Nummer = Anzahl der Commits auf
// main (gleicher Programmstand -> gleiche Nummer in Testfassung und
// Produktion), dazu das Datum des Builds. Gesetzt beim Bauen von den
// Workflows "Auto Push Testfassung" und "Produktion" (VITE_VERSION_NR,
// VITE_VERSION_DATUM, VITE_VERSION_COMMIT); lokal fehlen sie.

export function versionText(nr: string | undefined, datum: string | undefined): string {
  const zahl = Number.parseInt(nr ?? '', 10);
  if (!Number.isFinite(zahl) || zahl <= 0 || !datum) return 'v0000_lokal';
  return `v${String(zahl).padStart(4, '0')}_${datum}`;
}

export function versionTipp(commit: string | undefined, testfassung: boolean): string {
  const umgebung = testfassung ? 'Testfassung' : 'Produktion';
  return commit ? `${umgebung} · Commit ${commit.slice(0, 7)}` : 'lokale Vorschau';
}

export const VERSION = versionText(import.meta.env.VITE_VERSION_NR, import.meta.env.VITE_VERSION_DATUM);
export const VERSION_TIPP = versionTipp(import.meta.env.VITE_VERSION_COMMIT, import.meta.env.VITE_TESTFASSUNG === '1');
