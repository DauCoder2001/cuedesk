import { describe, expect, it } from 'vitest';
import { plaetzeText, stichkaempfeImTurnier } from '../src/stichkampf';
import type { StichkampfPartie } from '../src/stichkampf';

const partie = (a: string, b: string, ea: number | null, eb: number | null, gruppe: string | null = null): StichkampfPartie => ({
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  vorgabe_a: 0,
  vorgabe_b: 0,
  race_to: 3,
  phase: 'gruppe',
  gruppe
});

// Drei Spieler im Kreis: jeder einmal 3:1 gewonnen, alles gleich
const kreis = (x: string, y: string, z: string, gruppe: string | null = null, letztes: number | null = 1) => [
  partie(x, y, 3, 1, gruppe),
  partie(y, z, 3, 1, gruppe),
  partie(z, x, 3, letztes, gruppe)
];

describe('Stichkampf', () => {
  it('Einzelgruppe: offen erst, wenn alle Spiele beendet sind', () => {
    const aufstellung = ['a', 'b', 'c'].map((id) => ({ id, gruppe: null }));
    expect(stichkaempfeImTurnier('einzelgruppe', { raceTo: 3 }, aufstellung, kreis('a', 'b', 'c', null, null), true)).toEqual([]);
    const offen = stichkaempfeImTurnier('einzelgruppe', { raceTo: 3 }, aufstellung, kreis('a', 'b', 'c'), true);
    expect(offen).toHaveLength(1);
    expect(offen[0]).toMatchObject({ gruppe: null, von: 1, bis: 3 });
    expect([...offen[0].personen].sort()).toEqual(['a', 'b', 'c']);
    expect(plaetzeText(offen[0])).toBe('Platz 1–3');
  });

  it('Von Hand entschieden: nicht mehr offen', () => {
    const aufstellung = ['a', 'b', 'c'].map((id) => ({ id, gruppe: null }));
    const e = { raceTo: 3, handReihenfolge: { '0-1-2': [2, 0, 1] } };
    expect(stichkaempfeImTurnier('einzelgruppe', e, aufstellung, kreis('a', 'b', 'c'), true)).toEqual([]);
  });

  it('Gruppen: je Gruppe sofort, bis die Plaetze fixiert sind', () => {
    const aufstellung = [
      ...['a', 'b', 'c'].map((id) => ({ id, gruppe: 'A' })),
      ...['d', 'e', 'f'].map((id) => ({ id, gruppe: 'B' }))
    ];
    const partien = [...kreis('a', 'b', 'c', 'A'), ...kreis('d', 'e', 'f', 'B', null)];
    const offen = stichkaempfeImTurnier('zwei-gruppen', { raceTo: 3 }, aufstellung, partien, true);
    expect(offen.map((s) => s.gruppe)).toEqual(['A']);
    expect(stichkaempfeImTurnier('zwei-gruppen', { raceTo: 3, phase2: { A: [], B: [] } }, aufstellung, partien, true)).toEqual([]);
    expect(stichkaempfeImTurnier('gruppen-ko', { raceTo: 3 }, aufstellung, partien, true).map((s) => s.gruppe)).toEqual(['A']);
  });

  it('Doppel-KO und Liga: nie', () => {
    const aufstellung = ['a', 'b', 'c'].map((id) => ({ id, gruppe: null }));
    expect(stichkaempfeImTurnier('doppel-ko', { raceTo: 3 }, aufstellung, kreis('a', 'b', 'c'), true)).toEqual([]);
    expect(stichkaempfeImTurnier('liga', { raceTo: 3 }, aufstellung, kreis('a', 'b', 'c'), true)).toEqual([]);
  });
});
