import { describe, expect, it } from 'vitest';
import { rundenFolge, spielFolge } from '../src/reihenfolge';
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

  it('laufend: die ersten drei offenen Spiele bleiben stehen, bis sie starten', () => {
    // A 7 Spieler (7 Runden), B 6 Spieler (5 Runden), je 3 Spiele
    type P = { id: string; gruppe: string; runde: number; phase: string; status: string; tisch_id: string | null; begonnen: string | null; beendet: string | null };
    const partien: P[] = [];
    for (const [gruppe, runden] of [['A', 7], ['B', 5]] as const) {
      for (let r = 1; r <= runden; r++) {
        for (let i = 1; i <= 3; i++) partien.push({ id: `${gruppe}${r}${i}`, gruppe, runde: r, phase: 'gruppe', status: 'geplant', tisch_id: null, begonnen: null, beendet: null });
      }
    }
    const offen = (p: P) => p.status === 'geplant' && !p.tisch_id;
    const vorne = (liste: P[]) =>
      [...spielFolge(liste, 'laufend')]
        .filter(([id]) => offen(liste.find((x) => x.id === id) as P))
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id)
        .slice(0, 3);
    // Zum Vergleich ohne Verlauf: so wuerde nur der jetzige Stand rechnen
    const ohneVerlauf = () => vorne(partien.map((p) => ({ ...p, begonnen: null, beendet: null })));
    let minute = 0;
    const zeit = () => `2026-11-07T11:${String(minute++).padStart(2, '0')}:00Z`;
    const start = (id: string) => Object.assign(partien.find((x) => x.id === id) as P, { status: 'laeuft', tisch_id: 't', begonnen: zeit() });
    const ende = (id: string) => Object.assign(partien.find((x) => x.id === id) as P, { status: 'beendet', tisch_id: null, beendet: zeit() });
    for (const id of ['A11', 'A12', 'A13', 'A21', 'A22', 'A23']) {
      start(id);
      ende(id);
    }
    start('B11');
    const spitze = vorne(partien);
    expect(spitze).toEqual(['B12', 'B13', 'A31']);
    // B 1-1 endet: neu gerechnet kaeme A 3 nach vorne, die Spitze bleibt aber
    ende('B11');
    expect(ohneVerlauf()).toEqual(['A31', 'A32', 'A33']);
    expect(vorne(partien)).toEqual(spitze);
    // Startet ein Spiel der Spitze, rueckt nur dieser Platz nach
    start('B12');
    expect(vorne(partien).slice(0, 2)).toEqual(['B13', 'A31']);
  });

  it('Duelle und KO bleiben aussen vor', () => {
    const p = [...plan(), { gruppe: null as unknown as string, runde: 1, phase: 'phase2', status: 'geplant' }];
    expect(rundenFolge(p, 'verteilt').size).toBe(12);
  });
});
