import { describe, expect, test } from 'vitest';
import { einsaetze, hoechstensMatches, pruefen, stand, vorschlag } from '../src/teamvergleich';
import type { StandPartie } from '../src/teamvergleich';

const rot = ['r1', 'r2', 'r3', 'r4', 'r5'];
const blau = ['b1', 'b2', 'b3', 'b4', 'b5'];
const race = { team: 5, doppel: 5, einzel: 5 };

describe('Teamvergleich: Prüfen', () => {
  test('gültige Teams', () => {
    expect(pruefen(rot, blau, 7, race)).toEqual([]);
  });
  test('ungleich groß, zu klein, doppelt, in beiden Teams', () => {
    expect(pruefen(rot, blau.slice(0, 4), 7, race)).toContain('Beide Teams brauchen gleich viele Spieler.');
    expect(pruefen(['r1'], ['b1'], 7, race)).toContain('Jedes Team braucht 2 bis 8 Spieler.');
    expect(pruefen(['r1', 'r1'], ['b1', 'b2'], 7, race)).toContain('Ein Spieler steht doppelt im selben Team.');
    expect(pruefen(['r1', 'x'], ['b1', 'x'], 7, race)).toContain('Ein Spieler kann nicht in beiden Teams spielen.');
  });
  test('Ziel und Race to im erlaubten Bereich', () => {
    expect(pruefen(rot, blau, 0, race)).toContain('Sieg bei 1 bis 21 Punkten.');
    expect(pruefen(rot, blau, 7, { ...race, einzel: 0 })).toContain('Race to: 1 bis 15.');
  });
});

describe('Teamvergleich: Vorschlag', () => {
  const plan = vorschlag(rot, blau, 7);

  test('Block 1 ist das Team-Match ohne Spieler, danach Doppel und Einzel im Wechsel', () => {
    expect(plan[0]).toEqual({ block: 1, art: 'team', paarung: 1, a: [], b: [] });
    expect(plan.filter((m) => m.block === 2).every((m) => m.art === 'doppel')).toBe(true);
    expect(plan.filter((m) => m.block === 3).every((m) => m.art === 'einzel')).toBe(true);
  });

  test('genau so viele Matches, wie höchstens gebraucht werden', () => {
    expect(hoechstensMatches(7)).toBe(13);
    expect(plan).toHaveLength(13);
    expect(vorschlag(rot, blau, 11)).toHaveLength(21);
  });

  test('niemand spielt zweimal im selben Block', () => {
    const bloecke = new Set(plan.map((m) => m.block));
    for (const nr of bloecke) {
      const ids = plan.filter((m) => m.block === nr).flatMap((m) => [...m.a, ...m.b]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('Seite A immer Team Rot, Seite B immer Team Blau', () => {
    plan.forEach((m) => {
      m.a.forEach((id) => expect(rot).toContain(id));
      m.b.forEach((id) => expect(blau).toContain(id));
    });
  });

  test('Einsätze gleichmäßig verteilt (höchstens einer Unterschied), jeder spielt mindestens einmal', () => {
    for (let n = 2; n <= 8; n += 1) {
      for (const ziel of [3, 5, 7, 11]) {
        const a = Array.from({ length: n }, (_, i) => `r${i}`);
        const b = Array.from({ length: n }, (_, i) => `b${i}`);
        const zahl = einsaetze(vorschlag(a, b, ziel));
        const werte = [...a, ...b].map((id) => zahl.get(id) ?? 0);
        expect(Math.max(...werte) - Math.min(...werte), `n=${n} ziel=${ziel}`).toBeLessThanOrEqual(1);
        if (2 * ziel - 2 >= n) expect(Math.min(...werte), `n=${n} ziel=${ziel}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('Einzel-Gegner wiederholen sich in aufeinanderfolgenden Einzel-Blöcken nicht', () => {
    const lang = vorschlag(rot, blau, 11);
    const paare = lang.filter((m) => m.art === 'einzel').map((m) => `${m.a[0]}-${m.b[0]}`);
    expect(new Set(paare).size).toBe(paare.length);
  });

  test('andere Variante ergibt einen anderen Vorschlag', () => {
    expect(vorschlag(rot, blau, 7, 1)).not.toEqual(plan);
  });
});

describe('Teamvergleich: Stand', () => {
  const p = (id: string, a: number | null, b: number | null, status: StandPartie['status'] = 'beendet'): StandPartie => ({
    id,
    status,
    ergebnis_a: a,
    ergebnis_b: b
  });

  test('Punkte je Team, noch kein Sieger', () => {
    expect(stand([p('1', 5, 3), p('2', 2, 5), p('3', 5, 4)], 3)).toMatchObject({ a: 2, b: 1, sieger: null });
  });

  test('Ziel erreicht: offene Matches entfallen, laufende werden gemeldet', () => {
    const s = stand([p('1', 5, 3), p('2', 5, 1), p('3', null, null, 'laeuft'), p('4', null, null, 'geplant')], 2);
    expect(s).toMatchObject({ a: 2, b: 0, sieger: 'A', entfallen: ['4'], laufend: ['3'] });
  });

  test('nach dem Sieg beendete Matches zählen nicht mehr', () => {
    const s = stand([p('1', 5, 3), p('2', 5, 1), p('3', 1, 5)], 2);
    expect(s).toMatchObject({ a: 2, b: 0, sieger: 'A' });
  });
});
