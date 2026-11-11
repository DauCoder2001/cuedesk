import { describe, expect, test } from 'vitest';
import { serienwertung } from '../src/serien';
import { datumKurz, serienDateiname, serienPdf } from '../src/serienbericht';

describe('Serien-Rangliste als PDF', () => {
  test('Datum kurz wie v15', () => {
    expect(datumKurz('2026-09-05')).toBe('5.9.');
    expect(datumKurz('2026-12-24')).toBe('24.12.');
  });

  test('Tabelle mit geteilten Plaetzen und Streichergebnissen in Klammern', () => {
    const turniere = [
      { id: 't1', name: 'Eins', datum: '2026-01-10', teilnehmer: 3, platzierungen: [{ spieler: 'A', platz: 1 }, { spieler: 'B', platz: 2 }, { spieler: 'C', platz: 3 }] },
      { id: 't2', name: 'Zwei', datum: '2026-02-10', teilnehmer: 3, platzierungen: [{ spieler: 'B', platz: 1 }, { spieler: 'A', platz: 2 }, { spieler: 'C', platz: 3 }] }
    ];
    const spieler = serienwertung(turniere, { streicher: 1, bonus: 0 }, (s) => s);
    const bytes = serienPdf({
      name: 'Freitagsserie',
      saison: '26/27',
      disziplin: '8-Ball',
      streicher: 1,
      bonus: 0,
      stand: new Date(2026, 8, 22),
      turniere,
      spieler,
      anzeige: (s) => `Spieler ${s}`
    });
    const text = new TextDecoder('latin1').decode(bytes);
    const zeilen = (text.match(/\((?:[^()\\]|\\.)*\) Tj/g) ?? []).map((x) => x.slice(1, -4));
    // A und B je 3 Punkte (beste 1 zaehlt): geteilter Platz 1, Ziffer nur einmal
    expect(zeilen).toContain('Saison 26/27 \\267 2 Turniere \\267 3 Spieler \\267 Stand 22.09.2026 \\267 gewertet: beste 1 \\267 ohne Sieger-Bonus');
    expect(zeilen.filter((z) => z === '1.')).toHaveLength(1);
    expect(zeilen).toContain('\\(2\\)');
    expect(zeilen).toContain('10.1.');
    expect(serienDateiname('Freitagsserie', '26/27')).toBe('Serienwertung_Freitagsserie_26_27.pdf');
  });

  // Format nach Zahl der Turniere: hochkant, quer, quer in Bloecken
  const bericht = (anzahl: number) => {
    const turniere = Array.from({ length: anzahl }, (_, i) => ({
      id: `t${i}`, name: `T${i}`, datum: new Date(Date.UTC(2026, 0, 7 + 7 * i)).toISOString().slice(0, 10), teilnehmer: 2,
      platzierungen: [{ spieler: 'A', platz: 1 }, { spieler: 'B', platz: 2 }]
    }));
    return {
      name: 'Mittwochs', saison: '2026', disziplin: '9-Ball', streicher: 0, bonus: 0, stand: new Date(2026, 10, 11),
      turniere, spieler: serienwertung(turniere, { streicher: 0, bonus: 0 }, (s) => s), anzeige: (s: string) => `Spieler ${s}`
    };
  };
  const pdfText = (anzahl: number) => new TextDecoder('latin1').decode(serienPdf(bericht(anzahl)));

  test('wenige Turniere hochkant, viele quer, sehr viele in Bloecken', () => {
    expect(pdfText(8)).toContain('/MediaBox [0 0 595.28 841.89]');
    const zwanzig = pdfText(20);
    expect(zwanzig).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(zwanzig).not.toContain('(Turniere 1 bis');
    const vierzig = pdfText(40);
    expect(vierzig).toContain('(Turniere 1 bis 20)');
    expect(vierzig).toContain('(Turniere 21 bis 40)');
    expect(vierzig).not.toContain('...');
  });
});
