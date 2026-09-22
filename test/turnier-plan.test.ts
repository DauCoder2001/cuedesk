import { describe, expect, test } from 'vitest';
import { abschnittName, ergebnisVomTablet, planStatus, tabletSpielplan, tvErgebnis } from '../scoreboards/js/turnier-plan';
import type { PlanPartie } from '../scoreboards/js/turnier-plan';

const namen: Record<string, string> = { s: 'Sven', k: 'Kai', o: 'Olli', g: 'Gerd' };
const partie = (id: string, a: string, b: string, extra: Partial<PlanPartie> = {}): PlanPartie => ({
  id,
  spieler_a: a,
  spieler_b: b,
  race_to: 5,
  vorgabe_a: 0,
  vorgabe_b: 0,
  status: 'geplant',
  tisch_id: null,
  runde: 1,
  begonnen: null,
  ...extra
});

describe('Spielplan fuer das Tablet', () => {
  test('Status: beendet, am Tisch, offen', () => {
    expect(planStatus({ status: 'beendet', tisch_id: 't1' })).toBe('completed');
    expect(planStatus({ status: 'laeuft', tisch_id: 't1' })).toBe('running');
    expect(planStatus({ status: 'laeuft', tisch_id: null })).toBe('pending');
    expect(planStatus({ status: 'geplant', tisch_id: null })).toBe('pending');
  });

  test('Eintraege mit Namen, Tischnummer, Vorgabe und Reihenfolge', () => {
    const plan = tabletSpielplan(
      [
        partie('p1', 's', 'k', { vorgabe_b: 2 }),
        partie('p2', 'o', 'g', { tisch_id: 't2', status: 'laeuft', begonnen: '2026-09-22T18:00:00Z', runde: 2 })
      ],
      (id) => namen[id],
      (id) => (id === 't2' ? '2' : null)
    );
    expect(Object.keys(plan)).toEqual(['p1', 'p2']);
    expect(plan.p1).toMatchObject({ player1: 'Sven', player2: 'Kai', status: 'pending', vorgabe1: 0, vorgabe2: 2, group: 'Runde 1' });
    expect(plan.p2).toMatchObject({ status: 'running', table: '2', startedAt: Date.parse('2026-09-22T18:00:00Z') });
  });
});

test('Beschriftung mit Gruppe und Phase 2', () => {
  expect(abschnittName({ runde: 2, gruppe: 'B', phase: 'gruppe' })).toBe('Gruppe B · Runde 2');
  expect(abschnittName({ runde: null, gruppe: null, phase: 'phase2' })).toBe('Phase 2');
  expect(abschnittName({ runde: 3 })).toBe('Runde 3');
  expect(abschnittName({ runde: 2, gruppe: 'qf3', phase: 'ko' })).toBe('Viertelfinale 3');
  expect(abschnittName({ runde: 4, gruppe: 'bro', phase: 'ko' })).toBe('Spiel um Platz 3');
  expect(abschnittName({ runde: null, gruppe: null, phase: 'phase3' })).toBe('Phase 3');
});

describe('Ergebnis vom Tablet', () => {
  const eintrag = { player1: 'Sven', player2: 'Kai' };

  test('gleiche Seiten', () => {
    expect(ergebnisVomTablet(eintrag, { player1: 'Sven', player2: 'Kai', score1: 5, score2: 3 })).toEqual({
      ergebnis_a: 5,
      ergebnis_b: 3
    });
  });

  test('nach Seitenwechsel wird zurueckgetauscht', () => {
    expect(ergebnisVomTablet(eintrag, { player1: 'Kai', player2: 'Sven', score1: 3, score2: 5 })).toEqual({
      ergebnis_a: 5,
      ergebnis_b: 3
    });
  });
});

describe('Ergebnis fuer den Fernseher', () => {
  test('Rangliste nach v57-Regeln mit Siegen, Niederlagen und Saetzen', () => {
    const partie = (a: string, b: string, ea: number, eb: number) => ({
      spieler_a: a, spieler_b: b, vorgabe_a: 0, vorgabe_b: 0, ergebnis_a: ea, ergebnis_b: eb
    });
    const e = tvErgebnis(
      { name: 'Test', disziplin: '9-Ball', raceTo: 3, datum: '2026-10-10' },
      ['s', 'k', 'o'],
      [partie('s', 'k', 3, 1), partie('k', 'o', 3, 2), partie('s', 'o', 1, 3)],
      {},
      (id) => namen[id]
    );
    // alle je 1 Sieg; Satzdifferenz: Sven +2-2=0, Kai -2+1=-1, Olli -1+2=+1
    expect(e.groups[1].map((z) => z.name)).toEqual(['Olli', 'Sven', 'Kai']);
    expect(e.groups[1][0]).toMatchObject({ games: 2, wins: 1, losses: 1, plus: 5, minus: 4 });
  });
});
