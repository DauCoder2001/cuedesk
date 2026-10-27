import { describe, expect, it } from 'vitest';
import { rundenFolge } from '../src/reihenfolge';
import type { Reihenfolge } from '../src/reihenfolge';

// Gruppe A mit 7 Spielern (7 Runden), Gruppe B mit 6 (5 Runden), je 3 Spiele
function plan(beendet: (gruppe: string, runde: number) => number = () => 0) {
  const partien: { gruppe: string; runde: number; phase: string; status: string }[] = [];
  for (const [gruppe, runden] of [['A', 7], ['B', 5]] as const) {
    for (let r = 1; r <= runden; r++) {
      for (let i = 0; i < 3; i++) partien.push({ gruppe, runde: r, phase: 'gruppe', status: i < beendet(gruppe, r) ? 'beendet' : 'geplant' });
    }
  }
  return partien;
}

const liste = (partien: ReturnType<typeof plan>, art: Reihenfolge) =>
  [...rundenFolge(partien, art)].sort((a, b) => a[1] - b[1]).map(([k]) => k.replace('|', ''));

describe('rundenFolge', () => {
  it('abwechselnd: wie bisher, A haengt hinten an', () => {
    expect(liste(plan(), 'abwechselnd')).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4', 'A5', 'B5', 'A6', 'A7']);
  });

  it('gleich verteilt: beide Gruppen enden fast gleichzeitig', () => {
    expect(liste(plan(), 'verteilt')).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'A4', 'B3', 'A5', 'B4', 'A6', 'B5', 'A7']);
  });

  it('laufend: die Gruppe mit mehr offenen Spielen zuerst, fertige Runden vorne', () => {
    // A1 und B1 fertig: A hat 18 offene Spiele, B 12
    const p = plan((g, r) => (r === 1 ? 3 : 0));
    expect(liste(p, 'laufend')).toEqual(['A1', 'B1', 'A2', 'A3', 'B2', 'A4', 'B3', 'A5', 'B4', 'A6', 'B5', 'A7']);
    // B hinkt hinterher: B hat noch alles offen, A schon drei Runden fertig
    const q = plan((g, r) => (g === 'A' && r <= 3 ? 3 : 0));
    expect(liste(q, 'laufend').slice(0, 6)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'A4']);
  });

  it('Duelle und KO bleiben aussen vor', () => {
    const p = [...plan(), { gruppe: null as unknown as string, runde: 1, phase: 'phase2', status: 'geplant' }];
    expect(rundenFolge(p, 'verteilt').size).toBe(12);
  });
});
