import { describe, expect, test } from 'vitest';
import {
  einsaetze,
  kaderHinweise,
  saisonAus,
  saisonBilanz,
  saisonListe,
  stammspielerHinweis
} from '../src/mannschaften';
import type { KaderEintrag, MannschaftKurz } from '../src/mannschaften';

// Aufbau wie im Mannschaftspass: erste Mannschaft, zweite und dritte.
const mannschaften: MannschaftKurz[] = [
  { id: 'm1', name: 'Erste', rang: 1 },
  { id: 'm2', name: 'Zweite', rang: 2 },
  { id: 'm3', name: 'Dritte', rang: 3 }
];

const kader: KaderEintrag[] = [
  { mannschaft_id: 'm1', person_id: 'a', stammspieler: true },
  { mannschaft_id: 'm2', person_id: 'b', stammspieler: true },
  { mannschaft_id: 'm3', person_id: 'c', stammspieler: true },
  { mannschaft_id: 'm3', person_id: 'd', stammspieler: false }
];

const name = (id: string) => id.toUpperCase();

describe('Saison', () => {
  test('beginnt im Juli', () => {
    expect(saisonAus('2026-09-12')).toBe('2026/27');
    expect(saisonAus('2026-07-01')).toBe('2026/27');
    expect(saisonAus('2026-06-30')).toBe('2025/26');
    expect(saisonAus('2027-02-14')).toBe('2026/27');
  });

  test('Jahrhundertwechsel bleibt zweistellig', () => {
    expect(saisonAus('2099-08-01')).toBe('2099/00');
  });

  test('Auswahlliste enthält die laufende Saison', () => {
    const liste = saisonListe('2026-09-12');
    expect(liste).toEqual(['2024/25', '2025/26', '2026/27', '2027/28']);
  });
});

describe('Hinweise zur Aufstellung', () => {
  test('wer im Kader steht, wird nicht gemeldet', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[2],
      aufgestellt: ['c', 'd'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual([]);
  });

  test('Aushilfe nach oben ist stumm', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[0],
      aufgestellt: ['a', 'c', 'd'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual([]);
  });

  test('Stammspieler von oben darf nicht nach unten', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[2],
      aufgestellt: ['a', 'c'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual(['A ist Stammspieler in Erste und darf hier nicht antreten.']);
  });

  test('wer in keinem Kader steht, wird gemeldet', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[1],
      aufgestellt: ['x'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual(['X steht in keinem Kader dieser Saison.']);
  });

  test('jeder Spieler wird nur einmal gemeldet', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[2],
      aufgestellt: ['x', 'x', 'x'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toHaveLength(1);
  });
});

describe('Einsätze', () => {
  test('zwei Partien in einer Begegnung sind ein Einsatz', () => {
    const zeilen = einsaetze([{ id: 't1', mannschaft_id: 'm3', spieler: ['c', 'c', 'd'] }]);
    expect(zeilen).toEqual([
      { person_id: 'c', mannschaft_id: 'm3', begegnungen: 1, partien: 2 },
      { person_id: 'd', mannschaft_id: 'm3', begegnungen: 1, partien: 1 }
    ]);
  });

  test('je Mannschaft getrennt gezählt', () => {
    const zeilen = einsaetze([
      { id: 't1', mannschaft_id: 'm3', spieler: ['d', 'd'] },
      { id: 't2', mannschaft_id: 'm1', spieler: ['d'] },
      { id: 't3', mannschaft_id: 'm1', spieler: ['d'] }
    ]);
    expect(zeilen).toHaveLength(2);
    expect(zeilen.find((z) => z.mannschaft_id === 'm1')).toMatchObject({ begegnungen: 2, partien: 2 });
    expect(zeilen.find((z) => z.mannschaft_id === 'm3')).toMatchObject({ begegnungen: 1, partien: 2 });
  });

  test('Spieltag ohne Mannschaft bleibt ohne Zuordnung', () => {
    const zeilen = einsaetze([{ id: 't1', mannschaft_id: null, spieler: ['a'] }]);
    expect(zeilen[0].mannschaft_id).toBeNull();
  });
});

describe('Saisonbilanz', () => {
  test('Siege, Unentschieden und Punkte', () => {
    const bilanz = saisonBilanz([
      { partiepunkte: [5, 3], matchpunkte: [3, 0], entschieden: true },
      { partiepunkte: [4, 4], matchpunkte: [1, 1], entschieden: true },
      { partiepunkte: [2, 6], matchpunkte: [0, 3], entschieden: true },
      { partiepunkte: [1, 0], matchpunkte: [3, 0], entschieden: false }
    ]);
    expect(bilanz).toEqual({
      begegnungen: 4,
      gewertet: 3,
      siege: 1,
      unentschieden: 1,
      niederlagen: 1,
      matchpunkte: [4, 4],
      partiepunkte: [12, 13]
    });
  });

  test('ohne Begegnungen bleibt alles auf null', () => {
    expect(saisonBilanz([])).toMatchObject({ begegnungen: 0, matchpunkte: [0, 0] });
  });
});

describe('Stammspieler', () => {
  test('vier genügen, darunter kommt ein Hinweis', () => {
    expect(stammspielerHinweis(4)).toBeNull();
    expect(stammspielerHinweis(2)).toBe('Erst 2 von 4 Stammspielern gemeldet.');
    expect(stammspielerHinweis(0)).toBe('Noch kein Stammspieler gemeldet (4 sind üblich).');
  });
});
