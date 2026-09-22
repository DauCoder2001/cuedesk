// PDF-Bericht eines Turniers, aufgebaut wie in v57: Kopfzeile, Abschluss-
// tabelle, Vermerk zum Stichkampf, auf neuer Seite alle Runden. Die Daten
// kommen fertig aufbereitet von der Turnierseite.

import { absatz, bauen, neuesDokument, PDF_BREITE, PDF_RAND, tabelle, text, ueberschrift } from './pdf';

export type BerichtZeile = {
  platz: number;
  name: string;
  punkte: number;
  gewonnen: number;
  verloren: number;
  diff: number;
  rating: number | null; // nur bei Vorgabe
};

export type BerichtSpiel = {
  nameA: string;
  nameB: string;
  standA: number | null;
  standB: number | null;
  vorgabeA: number;
  vorgabeB: number;
  ratingA: number | null;
  ratingB: number | null;
};

export type Bericht = {
  titel: string; // Turniername
  kopf: string; // z.B. "9-Ball · Race to 5 · 8 Spieler · 10.10.2026 · Von 18:32 bis 22:04 · ..."
  vorlaeufig: boolean;
  zeilen: BerichtZeile[];
  stichkampf: string[]; // Vermerke "Platz 3-4: ..."
  runden: { name: string; spiele: BerichtSpiel[] }[];
};

// Name mit Rating und Vorgabe wie in v57: "Kai (525, +1)"
function nameMitWerten(name: string, rating: number | null, vorgabe: number): string {
  if (rating === null) return name;
  return `${name} (${rating}${vorgabe ? `, +${vorgabe}` : ''})`;
}

export function berichtPdf(b: Bericht): Uint8Array {
  const dok = neuesDokument();
  text(dok, b.vorlaeufig ? 'Turnierergebnis (vorläufig)' : 'Turnierergebnis', PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 15, true);
  dok.y -= 18;
  text(dok, b.titel, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 11, true);
  dok.y -= 16;
  absatz(dok, b.kopf);

  const mitRating = b.zeilen.some((z) => z.rating !== null);
  ueberschrift(dok, 'Abschlusstabelle', 11);
  tabelle(
    dok,
    [
      { text: 'Platz', align: 'mitte' },
      { text: 'Name', align: 'links' },
      { text: 'Pkt.', align: 'mitte' },
      { text: 'Sum.', align: 'mitte' },
      { text: 'Satz-Diff.', align: 'mitte' },
      ...(mitRating ? [{ text: 'Rtg.', align: 'mitte' as const }] : [])
    ],
    b.zeilen.map((z) => [
      String(z.platz),
      z.name,
      String(z.punkte),
      `${z.gewonnen}:${z.verloren}`,
      z.diff > 0 ? `+${z.diff}` : String(z.diff),
      ...(mitRating ? [z.rating === null ? '' : String(z.rating)] : [])
    ])
  );
  b.stichkampf.forEach((vermerk) => absatz(dok, vermerk));

  ueberschrift(dok, 'Ergebnisse', 11, true);
  for (const runde of b.runden) {
    ueberschrift(dok, runde.name, 9);
    tabelle(
      dok,
      [
        { text: 'Spieler 1', align: 'rechts' },
        { text: 'Ergebnis', align: 'mitte' },
        { text: 'Spieler 2', align: 'links' }
      ],
      runde.spiele.map((s) => [
        nameMitWerten(s.nameA, s.ratingA, s.vorgabeA),
        s.standA !== null && s.standB !== null ? `${s.standA} : ${s.standB}` : '- : -',
        nameMitWerten(s.nameB, s.ratingB, s.vorgabeB)
      ])
    );
  }
  return bauen(dok, b.titel);
}

export function berichtDateiname(titel: string, datum: string): string {
  return `${(titel || 'Turnierergebnis').replace(/[^a-zA-Z0-9_-]+/g, '_')}_${datum}.pdf`;
}
