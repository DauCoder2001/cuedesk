// PDF-Bericht eines Turniers, aufgebaut wie in v57: Kopfzeile, Abschluss-
// tabelle, Vermerk zum Stichkampf, danach alle Runden. Die Daten kommen
// fertig aufbereitet von der Turnierseite.

import { absatz, bauen, linie, neuesDokument, PDF_BREITE, PDF_RAND, platz, tabelle, text, ueberschrift } from './pdf';
import type { PdfDokument, Spalte, Zelle } from './pdf';

export type BerichtZeile = {
  platz: number;
  name: string;
  spiele: number;
  punkte: number; // ein Punkt je Sieg
  gewonnen: number;
  verloren: number;
  diff: number;
  rating: number | null; // nur bei Vorgabe
  ko?: string; // Startplatz in der KO-Runde, z. B. "A1"
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
  sieger: 'a' | 'b' | null; // erscheint fett
  tisch: number | null;
  dauer: number | null; // Spielzeit in Minuten, nur am Tablet gemessen
};

// Kreuztabelle einer Gruppe: Ergebnis je Paar aus Sicht der Zeile
export type BerichtKreuz = { namen: string[]; felder: string[][] };

export type Bericht = {
  titel: string; // Turniername
  kopf: string; // z.B. "9-Ball · Race to 5 · 8 Spieler · 10.10.2026 · Von 18:32 bis 22:04 · ..."
  ueberblick: string; // "Sieger: Kai · 28 Partien, 112 Sätze"
  vorlaeufig: boolean;
  zeilen: BerichtZeile[];
  stichkampf: string[]; // Vermerke "Platz 3-4: ..."
  kreuz: BerichtKreuz | null;
  runden: { name: string; spiele: BerichtSpiel[] }[];
};

// Name mit Rating und Vorgabe wie in v57: "Kai (525, +1)"
function nameMitWerten(name: string, rating: number | null, vorgabe: number): string {
  if (rating === null) return name;
  return `${name} (${rating}${vorgabe ? `, +${vorgabe}` : ''})`;
}

function kopfZeilen(dok: PdfDokument, b: { vorlaeufig: boolean; titel: string; kopf: string; ueberblick: string }) {
  text(dok, b.vorlaeufig ? 'Turnierergebnis (vorläufig)' : 'Turnierergebnis', PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 15, true);
  dok.y -= 18;
  text(dok, b.titel, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 11, true);
  dok.y -= 16;
  absatz(dok, b.kopf);
  if (b.ueberblick) absatz(dok, b.ueberblick, { groesse: 9, grauwert: 0 });
}

// Tabelle einer Gruppe oder des ganzen Turniers: Spiele, Siege, Niederlagen,
// Punkte, Saetze, Differenz, dazu Rating und KO-Startplatz, wo vorhanden
function gruppenTabelle(dok: PdfDokument, zeilen: BerichtZeile[]) {
  const mitRating = zeilen.some((z) => z.rating !== null);
  const mitKo = zeilen.some((z) => z.ko);
  tabelle(
    dok,
    [
      { text: 'Platz', align: 'mitte' },
      { text: 'Name', align: 'links' },
      { text: 'Spiele', align: 'mitte' },
      { text: 'S', align: 'mitte' },
      { text: 'N', align: 'mitte' },
      { text: 'Pkt.', align: 'mitte' },
      { text: 'Sätze', align: 'mitte' },
      { text: 'Satz-Diff.', align: 'mitte' },
      ...(mitRating ? [{ text: 'Rtg.', align: 'mitte' as const }] : []),
      ...(mitKo ? [{ text: 'KO', align: 'mitte' as const }] : [])
    ],
    zeilen.map((z) => [
      String(z.platz),
      z.name,
      String(z.spiele),
      String(z.punkte),
      String(z.spiele - z.punkte),
      String(z.punkte),
      `${z.gewonnen} : ${z.verloren}`,
      z.diff > 0 ? `+${z.diff}` : String(z.diff),
      ...(mitRating ? [z.rating === null ? '' : String(z.rating)] : []),
      ...(mitKo ? [z.ko ?? ''] : [])
    ])
  );
}

// Spalten Nr., Name, 1 bis n; die Diagonale bleibt leer
function kreuzTabelle(dok: PdfDokument, k: BerichtKreuz) {
  tabelle(
    dok,
    [
      { text: 'Nr.', align: 'mitte' },
      { text: 'Name', align: 'links' },
      ...k.namen.map((_, i) => ({ text: String(i + 1), align: 'mitte' as const }))
    ],
    k.namen.map((name, i) => [String(i + 1), name, ...k.felder[i]])
  );
}

// Ergebnisse einer Runde; Tisch und Spielzeit nur, wenn es sie im Bericht gibt
function spieleTabelle(dok: PdfDokument, spiele: BerichtSpiel[], mitTisch: boolean, mitDauer: boolean) {
  const spalten: Spalte[] = [
    { text: 'Spieler 1', align: 'rechts' },
    { text: 'Ergebnis', align: 'mitte' },
    { text: 'Spieler 2', align: 'links' },
    ...(mitTisch ? [{ text: 'Tisch', align: 'mitte' as const }] : []),
    ...(mitDauer ? [{ text: 'Spielzeit', align: 'mitte' as const }] : [])
  ];
  const zeilen: Zelle[][] = spiele.map((s) => [
    { text: nameMitWerten(s.nameA, s.ratingA, s.vorgabeA), fett: s.sieger === 'a' },
    s.standA !== null && s.standB !== null ? `${s.standA} : ${s.standB}` : '- : -',
    { text: nameMitWerten(s.nameB, s.ratingB, s.vorgabeB), fett: s.sieger === 'b' },
    ...(mitTisch ? [s.tisch === null ? '–' : String(s.tisch)] : []),
    ...(mitDauer ? [s.dauer === null ? '–' : `${Math.round(s.dauer)} Min.`] : [])
  ]);
  tabelle(dok, spalten, zeilen);
}

const SPIEL_HINWEIS = 'Sieger fett. Spielzeit nur bei am Tablet gespielten Partien.';

function rundenAusgeben(dok: PdfDokument, runden: { name: string; spiele: BerichtSpiel[] }[], alle: BerichtSpiel[]) {
  const mitTisch = alle.some((s) => s.tisch !== null);
  const mitDauer = alle.some((s) => s.dauer !== null);
  for (const runde of runden) {
    ueberschrift(dok, runde.name, 9);
    spieleTabelle(dok, runde.spiele, mitTisch, mitDauer);
  }
}

export function berichtPdf(b: Bericht): Uint8Array {
  const dok = neuesDokument();
  kopfZeilen(dok, b);

  ueberschrift(dok, 'Endtabelle', 11);
  gruppenTabelle(dok, b.zeilen);
  b.stichkampf.forEach((vermerk) => absatz(dok, vermerk));

  if (b.kreuz) {
    ueberschrift(dok, 'Kreuztabelle', 11);
    kreuzTabelle(dok, b.kreuz);
    absatz(dok, 'Ergebnis je Zeile aus Sicht des Spielers links.');
  }

  const alle = b.runden.flatMap((r) => r.spiele);
  ueberschrift(dok, 'Ergebnisse', 11);
  rundenAusgeben(dok, b.runden, alle);
  absatz(dok, SPIEL_HINWEIS);
  return bauen(dok, b.titel);
}

// ---------- Gruppenturniere und Doppel-KO ----------

// Bericht fuer Zwei Gruppen, Gruppen mit KO und Doppel-KO, aufgebaut wie der
// Druckbericht in v64 und v74: Kopf, Endtabelle, die Folgephasen, danach die
// Tabellen und Ergebnisse jeder Gruppe und zum Schluss die Hinweise zur
// Auslosung. Die Tabellen kommen fertig aufbereitet von der Turnierseite.
export type BerichtBlock =
  | { art: 'tabelle'; titel: string; spalten: Spalte[]; zeilen: Zelle[][]; fussnote?: string }
  | { art: 'gruppe'; titel: string; zeilen: BerichtZeile[]; vermerke: string[]; kreuz: BerichtKreuz | null }
  | { art: 'runden'; titel: string; runden: { name: string; spiele: BerichtSpiel[] }[] };

export type GruppenBericht = {
  titel: string;
  kopf: string;
  ueberblick: string;
  vorlaeufig: boolean;
  bloecke: BerichtBlock[];
  hinweise: string[]; // Setzungen, Gruppentausch, Nachtraege
};

export function gruppenBerichtPdf(b: GruppenBericht): Uint8Array {
  const dok = neuesDokument();
  kopfZeilen(dok, b);

  const alle = b.bloecke.flatMap((x) => (x.art === 'runden' ? x.runden.flatMap((r) => r.spiele) : []));
  for (const block of b.bloecke) {
    if (block.art === 'tabelle') {
      if (block.zeilen.length === 0) continue;
      ueberschrift(dok, block.titel, 11);
      tabelle(dok, block.spalten, block.zeilen);
      if (block.fussnote) absatz(dok, block.fussnote);
    } else if (block.art === 'gruppe') {
      ueberschrift(dok, block.titel, 11);
      gruppenTabelle(dok, block.zeilen);
      block.vermerke.forEach((v) => absatz(dok, v));
      if (block.kreuz) {
        ueberschrift(dok, `${block.titel} - Kreuztabelle`, 9);
        kreuzTabelle(dok, block.kreuz);
      }
    } else {
      ueberschrift(dok, block.titel, 11);
      rundenAusgeben(dok, block.runden, alle);
    }
  }
  if (alle.length > 0) absatz(dok, SPIEL_HINWEIS);

  // Fussnote wie in v64 buildDrawNote
  if (b.hinweise.length > 0) {
    platz(dok, 26);
    dok.y -= 6;
    linie(dok, PDF_RAND, dok.y + 8, PDF_BREITE - PDF_RAND, dok.y + 8, 0.5, 0.7);
    text(dok, 'Hinweise zur Auslosung', PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 8, true, 'links', 0.3);
    dok.y -= 11;
    // Lange Hinweise (Aufgabe mit Grund) werden umbrochen
    b.hinweise.forEach((zeile) => absatz(dok, zeile, { grauwert: 0.3 }));
  }
  return bauen(dok, b.titel);
}

export function berichtDateiname(titel: string, datum: string): string {
  return `${(titel || 'Turnierergebnis').replace(/[^a-zA-Z0-9_-]+/g, '_')}_${datum}.pdf`;
}
