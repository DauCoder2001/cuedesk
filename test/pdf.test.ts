import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { bauen, neuesDokument, pdfEscape, tabelle, textbreite, ueberschrift } from '../src/pdf';
import { berichtPdf } from '../src/turnierbericht';
import { prognose, prognoseText, saetzeRest } from '../src/zeitprognose';

const V57 = 'C:/Users/Haas/Documents/Claude Projekte/Turnier light als Programm/turnierplan_billard_v57.html';

function stueck(quelle: string, anfang: string): string {
  const start = quelle.indexOf(anfang);
  if (start < 0) throw new Error(`${anfang} fehlt`);
  let tiefe = 0;
  let i = start;
  // bis zur passenden schliessenden Klammer (Funktion) oder zum Semikolon (Konstante)
  for (; i < quelle.length; i += 1) {
    const z = quelle[i];
    if (z === '{' || z === '[') tiefe += 1;
    if (z === '}' || z === ']') {
      tiefe -= 1;
      if (tiefe === 0 && anfang.startsWith('function')) return quelle.slice(start, i + 1);
    }
    if (z === ';' && tiefe === 0 && !anfang.startsWith('function')) return quelle.slice(start, i + 1);
  }
  throw new Error(`${anfang} unvollstaendig`);
}

describe('PDF-Schreiber', () => {
  test('Umlaute und Klammern werden nach WinAnsi maskiert', () => {
    expect(pdfEscape('Müller (Gast) – 10 €')).toBe('M\\374ller \\(Gast\\) \\226 10 \\200');
  });

  test('gueltiger Aufbau mit Kopf, Verweistabelle und Seitenzahl', () => {
    const dok = neuesDokument();
    ueberschrift(dok, 'Abschlusstabelle', 11);
    tabelle(dok, [{ text: 'Platz' }, { text: 'Name' }], [['1', 'Kai']]);
    const inhalt = new TextDecoder('latin1').decode(bauen(dok, 'Test'));
    expect(inhalt.startsWith('%PDF-1.4\n')).toBe(true);
    expect(inhalt).toContain('/Count 1');
    expect(inhalt).toContain('(Seite 1 von 1)');
    expect(inhalt.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  test('Bericht mit vielen Runden bricht auf mehrere Seiten um', () => {
    const spiele = Array.from({ length: 6 }, (_, i) => ({
      nameA: `Spieler ${i}`, nameB: 'Kai', standA: 5, standB: 3, vorgabeA: 0, vorgabeB: 1, ratingA: 500, ratingB: 525
    }));
    const pdf = berichtPdf({
      titel: 'Testturnier',
      kopf: '9-Ball · Race to 5',
      vorlaeufig: false,
      zeilen: [{ platz: 1, name: 'Kai', punkte: 3, gewonnen: 15, verloren: 7, diff: 8, rating: 525 }],
      stichkampf: [],
      runden: Array.from({ length: 11 }, (_, r) => ({ name: `Runde ${r + 1}`, spiele }))
    });
    const inhalt = new TextDecoder('latin1').decode(pdf);
    expect(inhalt).toContain('(Kai \\(525, +1\\))');
    expect(Number(/\/Count (\d+)/.exec(inhalt)?.[1])).toBeGreaterThanOrEqual(3);
  });
});

describe.skipIf(!existsSync(V57))('PDF-Schreiber gleich wie in v57', () => {
  const q = existsSync(V57) ? readFileSync(V57, 'utf8') : '';
  const v57 = new Function(
    `${stueck(q, 'const PDF_BREITE')} ${stueck(q, 'const PDF_HOEHE')} ${stueck(q, 'const PDF_RAND')}
     ${stueck(q, 'const PDF_W_NORMAL')} ${stueck(q, 'const PDF_W_FETT')} ${stueck(q, 'const PDF_W_SONDER')}
     ${['pdfZeichenbreite', 'pdfTextbreite', 'pdfKuerzen', 'pdfEscape', 'pdfDokument', 'pdfNeueSeite', 'pdfPlatz',
        'pdfText', 'pdfLinie', 'pdfRechteck', 'pdfUeberschrift', 'pdfTabelle']
       .map((n) => stueck(q, `function ${n}(`)).join('\n')}
     return { pdfEscape, pdfTextbreite, pdfDokument, pdfUeberschrift, pdfTabelle };`
  )() as {
    pdfEscape: (t: string) => string;
    pdfTextbreite: (t: string, g: number, f: boolean) => number;
    pdfDokument: () => { seiten: string[][] };
    pdfUeberschrift: (d: unknown, t: string, g: number, n: boolean) => void;
    pdfTabelle: (d: unknown, s: unknown[], z: string[][]) => void;
  };

  test('Maskierung und Breiten identisch', () => {
    for (const t of ['Müller-Lüdenscheidt', 'Öl (5 €) „Ä“ – ß', 'Kai 3:1 +2']) {
      expect(pdfEscape(t)).toBe(v57.pdfEscape(t));
      expect(textbreite(t, 8.5, true)).toBeCloseTo(v57.pdfTextbreite(t, 8.5, true), 6);
    }
  });

  test('Tabellen-Seiten zeichnen identisch', () => {
    const zeilen = Array.from({ length: 70 }, (_, i) => [String(i + 1), `Spieler Ä${i}`, `${i}:3`]);
    const spalten = [{ text: 'Platz', align: 'mitte' as const }, { text: 'Name', align: 'links' as const }, { text: 'Sätze', align: 'rechts' as const }];
    const alt = v57.pdfDokument();
    v57.pdfUeberschrift(alt, 'Abschlusstabelle', 11, false);
    v57.pdfTabelle(alt, spalten, zeilen);
    const neu = neuesDokument();
    ueberschrift(neu, 'Abschlusstabelle', 11);
    tabelle(neu, spalten, zeilen);
    expect(neu.seiten).toEqual(alt.seiten);
  });
});

describe('Zeitprognose', () => {
  const p = (a: number | null, b: number | null) => ({ standA: a, standB: b, vorgabeA: 0, vorgabeB: 0, raceTo: 5 });
  const beginn = Date.parse('2026-10-10T18:00:00');

  test('Restsaetze: offene Spiele mit 1,6 x Race to', () => {
    expect(saetzeRest([p(5, 3), p(null, null), p(2, 1)])).toBeCloseTo(8 + 5);
  });

  test('zu frueh, Schaetzung, beendet', () => {
    expect(prognose([p(1, 0)], beginn, null, beginn + 5 * 60000).art).toBe('zu-frueh');
    // 16 Saetze in 40 Minuten = 0,4 je Minute, offen 8 Saetze -> 20 Minuten
    const s = prognose([p(5, 3), p(5, 3), p(null, null)], beginn, null, beginn + 40 * 60000);
    expect(s).toEqual({ art: 'schaetzung', beginn, ende: beginn + 60 * 60000 });
    expect(prognoseText(s, beginn + 40 * 60000)).toBe('ca. Turnierende: 19:00 Uhr · Beginn 18:00 Uhr');
    const e = prognose([p(5, 3)], beginn, beginn + 95 * 60000);
    expect(prognoseText(e)).toBe('Turnier beendet: 19:35 Uhr · Dauer 1:35 h (Beginn 18:00 Uhr)');
  });
});
