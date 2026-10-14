import { describe, expect, test } from 'vitest';
import { abendLesen, datumAusDateiname, disziplinAusDateiname, namenDesAbends, namenVorschlagen } from '../src/excel-serie';
import type { Raster } from '../src/excel-serie';

// Nachgebaute Abend-Blaetter ohne echte Namen. Zeile/Spalte ab 0.
function raster(zellen: [number, number, string | number][]): Raster {
  const r: Raster = [];
  for (const [z, s, v] of zellen) {
    while (r.length <= z) r.push([]);
    r[z][s] = v;
  }
  return r;
}

// Altes Layout: Kopfzeile mit Namen ab Spalte 9 im Abstand 3, Namensspalte 4,
// eigenes Ergebnis im Schnittpunkt, Gegner zwei Spalten weiter.
function kreuztabelle(zellen: [number, number, string | number][], kopfZeile: number, beschriftung: number, namen: string[], erg: number[][]) {
  namen.forEach((n, j) => zellen.push([kopfZeile, 9 + 3 * j, n]));
  zellen.push([beschriftung, 4, `Teilnehmer Gruppe ${kopfZeile < 10 ? 1 : 2}`]);
  zellen.push([beschriftung, 44, 'Platz']);
  namen.forEach((n, i) => {
    zellen.push([beschriftung + 1 + i, 4, n]);
    zellen.push([beschriftung + 1 + i, 8, n]);
    namen.forEach((_, j) => {
      if (i === j) return;
      zellen.push([beschriftung + 1 + i, 9 + 3 * j, erg[i][j]]);
      zellen.push([beschriftung + 1 + i, 11 + 3 * j, erg[j][i]]);
    });
  });
}

describe('Abend-Datei lesen', () => {
  test('zwei Gruppen, Platzierungsspiele, Endplatzierung, Freilos', () => {
    const z: [number, number, string | number][] = [];
    // Gruppe 1: A1 schlaegt alle; erg[i][j] = Ergebnis von i gegen j
    kreuztabelle(z, 1, 6, ['Anton', 'Berta', 'Cora'], [[0, 2, 2], [1, 0, 2], [0, 1, 0]]);
    // Gruppe 2 mit Freilos: Spiele gegen Freilos fallen weg
    kreuztabelle(z, 19, 24, ['Dora', 'Emil', 'Freilos'], [[0, 2, 2], [0, 0, 2], [0, 0, 0]]);
    // Spielplan rechts mit denselben Namen darf nicht als Kopfzeile gelten
    z.push([5, 49, 'Anton'], [5, 52, 'Berta'], [5, 55, 'Cora'], [7, 49, 'Anton'], [7, 52, 'Berta']);
    // Platzierungsspiele: Paare in Nachbarzeilen, Name / Ergebnis (+1) / Platz (+3)
    z.push([41, 8, 'Auspielung der Plätze']);
    z.push([43, 8, 'Anton'], [43, 9, 2], [43, 11, 1], [44, 8, 'Dora'], [44, 9, 1], [44, 11, 2]);
    z.push([46, 8, 'Berta'], [46, 9, 0], [46, 11, 4], [47, 8, 'Emil'], [47, 9, 2], [47, 11, 3]);
    z.push([49, 8, 'Cora'], [49, 9, 2], [49, 11, 5]); // ohne Gegner: kein Spiel
    // Endplatzierung
    ['Anton', 'Dora', 'Emil', 'Berta', 'Cora', 'Freilos'].forEach((n, i) => z.push([43 + i, 23, `${i + 1}. Platz`], [43 + i, 26, n]));

    const a = abendLesen(raster(z));
    expect(a.gruppen).toEqual([
      { name: 'A', spieler: ['Anton', 'Berta', 'Cora'] },
      { name: 'B', spieler: ['Dora', 'Emil'] }
    ]);
    const gruppe = a.spiele.filter((s) => s.phase === 'gruppe');
    expect(gruppe).toHaveLength(4);
    expect(gruppe[0]).toMatchObject({ a: 'Anton', b: 'Berta', ergA: 2, ergB: 1, gruppe: 'A' });
    expect(gruppe.find((s) => s.gruppe === 'B')).toMatchObject({ a: 'Dora', b: 'Emil', ergA: 2, ergB: 0 });
    const platz = a.spiele.filter((s) => s.phase === 'phase3');
    expect(platz).toEqual([
      { a: 'Anton', b: 'Dora', ergA: 2, ergB: 1, phase: 'phase3', gruppe: null, paarung: 1 },
      { a: 'Berta', b: 'Emil', ergA: 0, ergB: 2, phase: 'phase3', gruppe: null, paarung: 2 }
    ]);
    expect(a.platzierung.map((p) => p.name)).toEqual(['Anton', 'Dora', 'Emil', 'Berta', 'Cora']);
    expect(a.raceTo).toBe(2);
    expect(a.warnungen).toEqual([]);
    expect(namenDesAbends(a).sort()).toEqual(['Anton', 'Berta', 'Cora', 'Dora', 'Emil']);
  });

  test('nur eine Gruppe: Endplatz aus der Spalte Platz', () => {
    const z: [number, number, string | number][] = [];
    kreuztabelle(z, 1, 6, ['Anton', 'Berta'], [[0, 4], [3, 0]]);
    z.push([7, 44, 2], [8, 44, 1]); // Anton 2., Berta 1. (Werte stehen im Blatt)
    z.push([24, 4, 'Teilnehmer Gruppe 2']);
    ['1. Platz', '2. Platz'].forEach((t, i) => z.push([43 + i, 23, t]));
    const a = abendLesen(raster(z));
    expect(a.platzierung).toEqual([{ platz: 1, name: 'Berta' }, { platz: 2, name: 'Anton' }]);
    expect(a.warnungen).toEqual(['Nur eine Gruppe: Endplatz = Platz in der Gruppe.']);
  });

  test('meldet fehlende Endplaetze und widerspruechliche Ergebnisse', () => {
    const z: [number, number, string | number][] = [];
    kreuztabelle(z, 1, 6, ['Anton', 'Berta'], [[0, 2], [1, 0]]);
    z[z.findIndex(([r, s]) => r === 8 && s === 11)][2] = 0; // Berta-Zeile passt nicht
    z.push([43, 23, '1. Platz'], [43, 26, 'Anton']);
    const a = abendLesen(raster(z));
    expect(a.warnungen).toContain('Gruppe A: Anton gegen Berta steht unterschiedlich in der Tabelle.');
    expect(a.warnungen).toContain('Ohne Endplatz: Berta.');
  });
});

describe('Dateinamen', () => {
  test('Datum und Monat', () => {
    expect(datumAusDateiname('2026-04-24_Gruppen_8-Ball.xlsx')).toEqual({ datum: '2026-04-24', monat: '2026-04' });
    expect(datumAusDateiname('2026-06_12_Gruppen-9Ball-2.Liga.xlsx')).toEqual({ datum: '2026-06-12', monat: '2026-06' });
    expect(datumAusDateiname('Fr Serie_1.Liga_Juni 2026.xlsx')).toEqual({ datum: null, monat: '2026-06' });
    expect(datumAusDateiname('Fr. Serie_1.Liga_April 26.xlsx')).toEqual({ datum: null, monat: '2026-04' });
    expect(datumAusDateiname('Fr. Serie  L.1 Oktober.xlsx')).toEqual({ datum: null, monat: null });
  });

  test('Disziplin', () => {
    expect(disziplinAusDateiname('2026-04-24_Gruppen_8-Ball.xlsx')).toBe('8-ball');
    expect(disziplinAusDateiname('2026-05-08_Gruppen-9Ball-2.Liga.xlsx')).toBe('9-ball');
    expect(disziplinAusDateiname('Fr Serie_1.Liga_Mai 2026.xlsx')).toBeNull();
  });
});

describe('Namen zuordnen', () => {
  const personen = [
    { id: 'p1', vorname: 'Anton', nachname: 'Muster', anzeigename: null },
    { id: 'p2', vorname: 'Berta', nachname: 'Beispiel', anzeigename: 'Bibi' },
    { id: 'p3', vorname: 'Cora', nachname: 'Probe', anzeigename: null },
    { id: 'p4', vorname: 'Cora', nachname: 'Test', anzeigename: null }
  ];
  test('voller Name, Anzeigename, Vorname N., eindeutiger Vorname, sonst Gast', () => {
    expect(namenVorschlagen(['Anton Muster', 'Bibi', 'Cora T.', 'Anton', 'Cora', 'Unbekannt'], personen)).toEqual({
      'Anton Muster': 'p1',
      Bibi: 'p2',
      'Cora T.': 'p4',
      Anton: 'p1',
      Cora: 'neu-gast',
      Unbekannt: 'neu-gast'
    });
  });
});
