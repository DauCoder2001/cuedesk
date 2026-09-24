import { describe, expect, test } from 'vitest';
import { kurzesRaceHinweis, siegchance, vorgabe } from '../src/vorgabe';

// Die Tabellen aus "Das Vereins-Rating erklaert" (Abschnitt 9)
describe('Vorgabe in Saetzen', () => {
  const tabelle: [number, number[]][] = [
    [25, [0, 0, 1, 1, 1, 1]],
    [50, [1, 1, 1, 1, 2, 2]],
    [100, [1, 1, 2, 2, 3, 3]],
    [150, [1, 2, 3, 3, 4, 4]],
    [200, [2, 2, 3, 4, 4, 5]],
    [300, [2, 3, 4, 4, 5, 6]]
  ];
  test.each(tabelle)('%i Punkte Unterschied, Race to 3 bis 8', (unterschied, erwartet) => {
    expect([3, 4, 5, 6, 7, 8].map((race) => vorgabe(500 + unterschied, 500, race))).toEqual(erwartet);
  });

  test('Siegchancen mit und ohne Vorgabe', () => {
    const rack = (d: number) => 1 / (1 + Math.pow(2, -d / 100));
    const prozent = (x: number) => Math.round(x * 100);
    expect(prozent(siegchance(rack(100), 5, 0))).toBe(86);
    expect(prozent(siegchance(rack(100), 5, 2))).toBe(57);
    expect(prozent(siegchance(rack(100), 7, 3))).toBe(56);
    expect(prozent(siegchance(rack(200), 5, 3))).toBe(66);
  });
});

describe('Hinweis fuer kurze Races', () => {
  test('ab Race to 5 kein Hinweis', () => {
    expect(kurzesRaceHinweis([5, 7])).toBeNull();
    expect(kurzesRaceHinweis([])).toBeNull();
  });

  test('das kuerzeste Race zaehlt', () => {
    expect(kurzesRaceHinweis([5, 3, 4])).toContain('Race to 3 beträgt die Vorgabe höchstens 2 Sätze');
    expect(kurzesRaceHinweis([4])).toContain('höchstens 3 Sätze');
    expect(kurzesRaceHinweis([2])).toContain('höchstens 1 Satz,');
    expect(kurzesRaceHinweis([1])).toContain('keine Vorgabe');
  });

  test('ungueltige Eingaben aus dem Formular werden uebergangen', () => {
    expect(kurzesRaceHinweis([Number(''), Number('abc'), 6])).toBeNull();
  });
});
