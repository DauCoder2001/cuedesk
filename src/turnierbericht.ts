// PDF-Bericht eines Turniers, aufgebaut wie in v57: Kopfzeile, Abschluss-
// tabelle, Vermerk zum Stichkampf, auf neuer Seite alle Runden. Die Daten
// kommen fertig aufbereitet von der Turnierseite.

import { absatz, bauen, linie, neuesDokument, PDF_BREITE, PDF_RAND, platz, tabelle, text, ueberschrift } from './pdf';
import type { Spalte } from './pdf';

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

// ---------- Gruppenturniere ----------

// Bericht fuer Zwei Gruppen und Gruppen mit KO, aufgebaut wie der Druckbericht
// in v64 und v74: Kopf, Endtabelle, auf neuer Seite die Folgephasen, danach
// die Tabellen und Ergebnisse jeder Gruppe und zum Schluss die Hinweise zur
// Auslosung. Die Tabellen kommen fertig aufbereitet von der Turnierseite.
export type BerichtBlock =
  | { art: 'tabelle'; titel: string; neueSeite?: boolean; spalten: Spalte[]; zeilen: string[][] }
  | { art: 'gruppe'; titel: string; zeilen: BerichtZeile[]; vermerke: string[] }
  | { art: 'runden'; titel: string; runden: { name: string; spiele: BerichtSpiel[] }[] };

export type GruppenBericht = {
  titel: string;
  kopf: string;
  vorlaeufig: boolean;
  bloecke: BerichtBlock[];
  hinweise: string[]; // Setzungen, Gruppentausch, Nachtraege
};

function spieleTabelle(dok: ReturnType<typeof neuesDokument>, spiele: BerichtSpiel[]) {
  tabelle(
    dok,
    [
      { text: 'Spieler 1', align: 'rechts' },
      { text: 'Ergebnis', align: 'mitte' },
      { text: 'Spieler 2', align: 'links' }
    ],
    spiele.map((s) => [
      nameMitWerten(s.nameA, s.ratingA, s.vorgabeA),
      s.standA !== null && s.standB !== null ? `${s.standA} : ${s.standB}` : '- : -',
      nameMitWerten(s.nameB, s.ratingB, s.vorgabeB)
    ])
  );
}

export function gruppenBerichtPdf(b: GruppenBericht): Uint8Array {
  const dok = neuesDokument();
  text(dok, b.vorlaeufig ? 'Turnierergebnis (vorläufig)' : 'Turnierergebnis', PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 15, true);
  dok.y -= 18;
  text(dok, b.titel, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 11, true);
  dok.y -= 16;
  absatz(dok, b.kopf);

  for (const block of b.bloecke) {
    if (block.art === 'tabelle') {
      if (block.zeilen.length === 0) continue;
      ueberschrift(dok, block.titel, 11, Boolean(block.neueSeite));
      tabelle(dok, block.spalten, block.zeilen);
    } else if (block.art === 'gruppe') {
      const mitRating = block.zeilen.some((z) => z.rating !== null);
      ueberschrift(dok, block.titel, 11);
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
        block.zeilen.map((z) => [
          String(z.platz),
          z.name,
          String(z.punkte),
          `${z.gewonnen}:${z.verloren}`,
          z.diff > 0 ? `+${z.diff}` : String(z.diff),
          ...(mitRating ? [z.rating === null ? '' : String(z.rating)] : [])
        ])
      );
      block.vermerke.forEach((v) => absatz(dok, v));
    } else {
      ueberschrift(dok, block.titel, 11);
      for (const runde of block.runden) {
        ueberschrift(dok, runde.name, 9);
        spieleTabelle(dok, runde.spiele);
      }
    }
  }

  // Fussnote wie in v64 buildDrawNote
  if (b.hinweise.length > 0) {
    platz(dok, 26);
    dok.y -= 6;
    linie(dok, PDF_RAND, dok.y + 8, PDF_BREITE - PDF_RAND, dok.y + 8, 0.5, 0.7);
    ['Hinweise zur Auslosung', ...b.hinweise].forEach((zeile, i) => {
      platz(dok, 12);
      text(dok, zeile, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 8, i === 0, 'links', 0.3);
      dok.y -= 11;
    });
  }
  return bauen(dok, b.titel);
}

export function berichtDateiname(titel: string, datum: string): string {
  return `${(titel || 'Turnierergebnis').replace(/[^a-zA-Z0-9_-]+/g, '_')}_${datum}.pdf`;
}
