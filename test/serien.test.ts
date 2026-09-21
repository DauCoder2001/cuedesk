import { describe, expect, test } from 'vitest';
import { punkteFuer, serienwertung } from '../src/serien';
import type { SerienTurnier } from '../src/serien';

const turnier = (
  id: string,
  datum: string,
  teilnehmer: number,
  reihenfolge: string[]
): SerienTurnier => ({
  id,
  name: id,
  datum,
  teilnehmer,
  platzierungen: reihenfolge.map((spieler, i) => ({ spieler, platz: i + 1 }))
});

describe('Punkte je Platz', () => {
  test('Teilnehmerzahl plus eins minus Platz, Bonus fuer den Sieger', () => {
    expect(punkteFuer(1, 8, 1)).toBe(9);
    expect(punkteFuer(2, 8, 1)).toBe(7);
    expect(punkteFuer(8, 8, 1)).toBe(1);
    expect(punkteFuer(1, 8, 0)).toBe(8);
  });

  test('unmoegliche Plaetze geben nichts', () => {
    expect(punkteFuer(9, 8, 1)).toBe(0);
    expect(punkteFuer(0, 8, 1)).toBe(0);
  });
});

describe('Wertung einer Serie', () => {
  const turniere = [
    turnier('t1', '2026-01-10', 4, ['A', 'B', 'C', 'D']),
    turnier('t2', '2026-02-10', 4, ['B', 'A', 'D', 'C']),
    turnier('t3', '2026-03-10', 4, ['C', 'D', 'A', 'B'])
  ];

  test('ohne Streichergebnisse zaehlen alle Turniere', () => {
    const liste = serienwertung(turniere, { streicher: 0, bonus: 1 });
    const summen = Object.fromEntries(liste.map((s) => [s.spieler, s.summe]));
    // A: 5 + 3 + 2 = 10, B: 3 + 5 + 1 = 9, C: 2 + 1 + 5 = 8, D: 1 + 2 + 3 = 6
    expect(summen).toEqual({ A: 10, B: 9, C: 8, D: 6 });
    expect(liste.map((s) => s.spieler)).toEqual(['A', 'B', 'C', 'D']);
  });

  test('mit Streichergebnissen zaehlen nur die besten zwei', () => {
    const liste = serienwertung(turniere, { streicher: 2, bonus: 1 });
    const a = liste.find((s) => s.spieler === 'A')!;
    expect(a.summe).toBe(8); // 5 + 3, die 2 faellt heraus
    expect(a.gespielt).toBe(3);
    expect(a.gewertet).toBe(2);
    expect(Object.values(a.ergebnisse).filter((e) => e.gestrichen)).toHaveLength(1);
  });

  test('bei Punktgleichheit entscheiden die besseren Plaetze', () => {
    // B: 4 + 1 = 5, C: 3 + 2 = 5. Gleiche Summe, aber B hat einen ersten Platz.
    const eigene = [
      turnier('x1', '2026-01-10', 4, ['B', 'C', 'D', 'A']),
      turnier('x2', '2026-02-10', 4, ['D', 'A', 'C', 'B'])
    ];
    const liste = serienwertung(eigene, { streicher: 0, bonus: 0 });
    const b = liste.find((s) => s.spieler === 'B')!;
    const c = liste.find((s) => s.spieler === 'C')!;
    expect(b.summe).toBe(c.summe);
    expect(liste.indexOf(b)).toBeLessThan(liste.indexOf(c));
  });

  test('doppelte Platzierung: die bessere zaehlt', () => {
    const doppelt: SerienTurnier = {
      id: 'd1',
      name: 'doppelt',
      datum: '2026-01-10',
      teilnehmer: 4,
      platzierungen: [
        { spieler: 'A', platz: 3 },
        { spieler: 'A', platz: 1 }
      ]
    };
    const liste = serienwertung([doppelt], { streicher: 0, bonus: 1 });
    expect(liste[0].summe).toBe(5);
  });
});
