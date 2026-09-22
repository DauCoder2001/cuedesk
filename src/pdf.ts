// PDF-Erzeugung ohne Fremdbibliothek, uebernommen aus dem Turnierplan v57.
//
// Ein PDF ist eine Textdatei mit Objekten, Zeichenbefehlen und einer
// Verweistabelle am Ende. Fuer Tabellen in Helvetica genuegt das hier
// Aufgebaute vollstaendig. Getestet in test/pdf.test.ts.

export const PDF_BREITE = 595.28; // A4 hoch, Angaben in Punkt
export const PDF_HOEHE = 841.89;
export const PDF_RAND = 40;

// Zeichenbreiten der Standardschrift Helvetica in 1/1000 der Schriftgroesse,
// fuer die Zeichen 32 bis 126.
const W_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const W_FETT = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
const W_SONDER: Record<string, [number, number]> = {
  ä: [556, 556], ö: [556, 611], ü: [556, 611], ß: [556, 611],
  Ä: [667, 722], Ö: [778, 778], Ü: [722, 722],
  é: [556, 556], è: [556, 556], á: [556, 556], à: [556, 556],
  ç: [500, 556], ñ: [556, 611], '·': [278, 278], '–': [556, 556],
  '§': [556, 556], '°': [400, 400], '„': [333, 500], '“': [333, 500]
};

// Zeichen, die in Windows-1252 an anderer Stelle stehen als in Unicode
const WIN_ANSI: Record<number, number> = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02c6: 136,
  0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147,
  0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155,
  0x0153: 156, 0x017e: 158, 0x0178: 159
};

export type Ausrichtung = 'links' | 'rechts' | 'mitte';
export type Spalte = { text: string; align?: Ausrichtung };
export type PdfDokument = { seiten: string[][]; strom: string[]; y: number };

function zeichenbreite(zeichen: string, fett: boolean): number {
  const code = zeichen.charCodeAt(0);
  if (code >= 32 && code <= 126) return (fett ? W_FETT : W_NORMAL)[code - 32];
  const s = W_SONDER[zeichen];
  if (s) return s[fett ? 1 : 0];
  return fett ? 611 : 556; // unbekanntes Zeichen: mittlere Breite
}

export function textbreite(text: string, groesse: number, fett: boolean): number {
  let summe = 0;
  for (const z of text) summe += zeichenbreite(z, fett);
  return (summe * groesse) / 1000;
}

// Text auf eine Hoechstbreite kuerzen, Rest durch Auslassungspunkte ersetzen
export function kuerzen(text: string, maxBreite: number, groesse: number, fett: boolean): string {
  if (textbreite(text, groesse, fett) <= maxBreite) return text;
  let kurz = text;
  while (kurz.length > 1 && textbreite(kurz + '...', groesse, fett) > maxBreite) kurz = kurz.slice(0, -1);
  return kurz + '...';
}

// Text fuer den PDF-Strom aufbereiten: Steuerzeichen maskieren, Zeichen
// oberhalb von 127 als Oktalwert nach WinAnsi (entspricht Windows-1252).
export function pdfEscape(text: string): string {
  let aus = '';
  for (const z of text) {
    let code = z.codePointAt(0) as number;
    if (z === '\\') aus += '\\\\';
    else if (z === '(') aus += '\\(';
    else if (z === ')') aus += '\\)';
    else if (code < 128) aus += z;
    else {
      if (WIN_ANSI[code] !== undefined) code = WIN_ANSI[code];
      if (code > 255) code = 63; // nicht darstellbar: Fragezeichen
      aus += '\\' + code.toString(8).padStart(3, '0');
    }
  }
  return aus;
}

export function neuesDokument(): PdfDokument {
  const dok: PdfDokument = { seiten: [], strom: [], y: 0 };
  neueSeite(dok);
  return dok;
}

export function neueSeite(dok: PdfDokument): void {
  dok.strom = [];
  dok.seiten.push(dok.strom);
  dok.y = PDF_HOEHE - PDF_RAND;
}

// Sicherstellen, dass die angegebene Hoehe auf der Seite noch Platz hat
export function platz(dok: PdfDokument, hoehe: number): void {
  if (dok.y - hoehe < PDF_RAND + 24) neueSeite(dok);
}

export function text(
  dok: PdfDokument,
  inhalt: string,
  x: number,
  breite: number,
  groesse: number,
  fett: boolean,
  ausrichtung: Ausrichtung = 'links',
  grauwert = 0
): void {
  const t = kuerzen(String(inhalt), breite, groesse, fett);
  let px = x;
  if (ausrichtung === 'rechts') px = x + breite - textbreite(t, groesse, fett);
  else if (ausrichtung === 'mitte') px = x + (breite - textbreite(t, groesse, fett)) / 2;
  dok.strom.push(
    `${grauwert} g BT /${fett ? 'F2' : 'F1'} ${groesse} Tf 1 0 0 1 ${px.toFixed(2)} ${dok.y.toFixed(2)} Tm (${pdfEscape(t)}) Tj ET 0 g`
  );
}

export function linie(dok: PdfDokument, x1: number, y1: number, x2: number, y2: number, dicke: number, grauwert: number) {
  dok.strom.push(`${grauwert} G ${dicke} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S 0 G`);
}

export function rechteck(dok: PdfDokument, x: number, y: number, breite: number, hoehe: number, grauwert: number) {
  dok.strom.push(`${grauwert} g ${x.toFixed(2)} ${y.toFixed(2)} ${breite.toFixed(2)} ${hoehe.toFixed(2)} re f 0 g`);
}

// Ueberschrift. Eine Ueberschrift steht nie allein am Seitenende: Tabellenkopf
// und zwei Zeilen muessen noch passen. mitNeuerSeite erzwingt einen Wechsel.
export function ueberschrift(dok: PdfDokument, inhalt: string, groesse: number, mitNeuerSeite = false): void {
  if (mitNeuerSeite && dok.strom.length > 0) neueSeite(dok);
  else platz(dok, groesse + 52);
  dok.y -= dok.strom.length > 0 ? 10 : 0;
  text(dok, inhalt, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, groesse, true, 'links');
  dok.y -= groesse * 0.4 + 6;
}

// Absatz in kleiner grauer Schrift
export function absatz(dok: PdfDokument, inhalt: string): void {
  platz(dok, 14);
  text(dok, inhalt, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 8, false, 'links', 0.35);
  dok.y -= 14;
}

// Tabelle; die Spaltenbreiten ergeben sich aus dem breitesten Inhalt
export function tabelle(dok: PdfDokument, spalten: Spalte[], zeilen: string[][]): void {
  const nutzbar = PDF_BREITE - 2 * PDF_RAND;
  const GROESSE = 8.5;
  const ZEILE = 13;
  const roh = spalten.map((sp, k) => {
    let max = textbreite(sp.text, GROESSE, true);
    zeilen.forEach((z) => (max = Math.max(max, textbreite(String(z[k] ?? ''), GROESSE, false))));
    return max + 10;
  });
  const summe = roh.reduce((a, b) => a + b, 0);
  const breiten = roh.map((b) => (b * nutzbar) / summe);

  const kopf = () => {
    platz(dok, ZEILE * 2);
    rechteck(dok, PDF_RAND, dok.y - 3.5, nutzbar, ZEILE, 0.9);
    let x = PDF_RAND;
    spalten.forEach((sp, k) => {
      text(dok, sp.text, x + 4, breiten[k] - 8, GROESSE, true, sp.align ?? 'links');
      x += breiten[k];
    });
    dok.y -= ZEILE;
    linie(dok, PDF_RAND, dok.y + 9.5, PDF_BREITE - PDF_RAND, dok.y + 9.5, 0.6, 0.45);
  };

  kopf();
  zeilen.forEach((z) => {
    if (dok.y - ZEILE < PDF_RAND + 24) {
      neueSeite(dok);
      kopf();
    }
    let x = PDF_RAND;
    spalten.forEach((sp, k) => {
      text(dok, String(z[k] ?? ''), x + 4, breiten[k] - 8, GROESSE, false, sp.align ?? 'links');
      x += breiten[k];
    });
    dok.y -= ZEILE;
    linie(dok, PDF_RAND, dok.y + 9.5, PDF_BREITE - PDF_RAND, dok.y + 9.5, 0.3, 0.8);
  });
  dok.y -= 6;
}

// Fertiges PDF als Byte-Folge: Catalog, Seitenbaum, zwei Standardschriften
// und je Seite ein Inhaltsstrom, dazu Seitennummern.
export function bauen(dok: PdfDokument, titel: string): Uint8Array<ArrayBuffer> {
  const objekte: string[] = [];
  const anzahl = dok.seiten.length;

  dok.seiten.forEach((strom, i) => {
    const t = `Seite ${i + 1} von ${anzahl}`;
    const breite = textbreite(t, 7.5, false);
    strom.push(
      `0.45 g BT /F1 7.5 Tf 1 0 0 1 ${(PDF_BREITE - PDF_RAND - breite).toFixed(2)} ${(PDF_RAND - 12).toFixed(2)} Tm (${pdfEscape(t)}) Tj ET 0 g`
    );
  });

  objekte[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const seitenIds = dok.seiten.map((_, i) => 5 + i * 2);
  objekte[2] = `<< /Type /Pages /Kids [${seitenIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${anzahl} >>`;
  objekte[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objekte[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  dok.seiten.forEach((strom, i) => {
    const seiteId = 5 + i * 2;
    const inhaltId = seiteId + 1;
    objekte[seiteId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_BREITE} ${PDF_HOEHE}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${inhaltId} 0 R >>`;
    const inhalt = strom.join('\n');
    objekte[inhaltId] = `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`;
  });
  const infoId = 5 + anzahl * 2;
  objekte[infoId] = `<< /Title (${pdfEscape(titel || 'Turnierergebnis')}) /Producer (CueDesk) >>`;

  let datei = '%PDF-1.4\n';
  const versatz: number[] = [];
  for (let i = 1; i <= infoId; i += 1) {
    if (objekte[i] === undefined) continue;
    versatz[i] = datei.length;
    datei += `${i} 0 obj\n${objekte[i]}\nendobj\n`;
  }
  const xrefStart = datei.length;
  datei += `xref\n0 ${infoId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= infoId; i += 1) datei += `${String(versatz[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  datei += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(datei.length);
  for (let i = 0; i < datei.length; i += 1) bytes[i] = datei.charCodeAt(i) & 0xff;
  return bytes;
}

// Im Browser herunterladen
export function herunterladen(bytes: Uint8Array, dateiname: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
