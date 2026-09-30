// Nutzungsbedingungen und Vertrag zur Auftragsverarbeitung
// (nutzungsbedingungen.html, auftragsverarbeitung.html). Ein
// Vereins-Administrator stimmt fuer den Verein zu, gespeichert in
// vertragszustimmungen (Stufe 23). Aendert sich einer der Texte, die
// Fassung hochzaehlen: dann muss jeder Verein erneut zustimmen.

export const VERTRAG_FASSUNG = 'NB1-AVV1';
export const VERTRAG_KURZ = 'Fassung 1'; // Anzeige in der Konsole, mit der Fassung mitziehen

export const VERTRAEGE = [
  { name: 'Nutzungsbedingungen', fassung: 1, datei: 'nutzungsbedingungen.html' },
  { name: 'Vertrag zur Auftragsverarbeitung', fassung: 1, datei: 'auftragsverarbeitung.html' }
] as const;

export const ZUSTIMMUNG_TEXT = 'Ich darf den Verein vertreten und stimme beiden Texten für den Verein zu.';

// "NB1-AVV1" -> "Nutzungsbedingungen 1, Auftragsverarbeitung 1"; sonst unveraendert
export function fassungText(fassung: string): string {
  const treffer = /^NB(\d+)-AVV(\d+)$/.exec(fassung);
  return treffer ? `Nutzungsbedingungen ${treffer[1]}, Auftragsverarbeitung ${treffer[2]}` : fassung;
}
