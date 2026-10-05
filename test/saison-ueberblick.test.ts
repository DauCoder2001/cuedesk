import { describe, expect, test } from 'vitest';
import { dauerText, saisonUeberblick, spieldauer } from '../src/saison-ueberblick';

const p = (a: string, b: string, ea: number, eb: number, minuten: number | null = null, tisch: string | null = null) => ({
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  begonnen: minuten === null ? null : '2026-10-01T18:00:00Z',
  beendet: minuten === null ? null : new Date(Date.parse('2026-10-01T18:00:00Z') + minuten * 60000).toISOString(),
  tisch_id: tisch
});

describe('Saison-Ueberblick', () => {
  const mitglieder = new Set(['frank', 'olli', 'kai']);
  const u = saisonUeberblick(
    [
      p('frank', 'olli', 5, 3, 20, 't1'),
      p('frank', 'kai', 5, 1, 10, 't2'),
      p('olli', 'kai', 5, 4, 30, 't1'),
      p('frank', 'gast', 2, 5), // von Hand eingetragen: keine Dauer
      p('gast', 'kai', 5, 0, 600, 't2') // 10 Stunden: vergessenes Tablet, zaehlt nicht
    ],
    (id) => mitglieder.has(id)
  );

  test('Spiele und Spielzeit nur aus erfasster Dauer', () => {
    expect(u.spiele).toBe(5);
    expect(u.mitDauer).toBe(3);
    expect(u.minuten).toBe(60);
    expect(u.schnitt).toBe(20);
    expect(u.jeTisch).toEqual([
      { tischId: 't1', minuten: 50 },
      { tischId: 't2', minuten: 10 }
    ]);
  });

  test('aktivster und beste drei nur Mitglieder, Gast zaehlt bei Spielen mit', () => {
    expect(u.aktivster).toEqual({ id: 'frank', spiele: 3, siege: 2 });
    expect(u.beste.map((z) => z.id)).toEqual(['frank', 'olli']);
    expect(u.beste.some((z) => z.id === 'gast')).toBe(false);
  });

  test('Dauer und Text', () => {
    expect(spieldauer({ ...p('a', 'b', 1, 0), begonnen: '2026-10-01T18:00:00Z', beendet: '2026-10-01T17:00:00Z' })).toBeNull();
    expect(dauerText(11817)).toBe('196 h 57 min');
    expect(dauerText(41)).toBe('41 min');
  });
});
