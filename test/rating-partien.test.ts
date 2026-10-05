import { describe, expect, test } from 'vitest';
import { gewertetePartien } from '../src/rating-partien';
import type { GewertetePartie } from '../src/rating-partien';

const p = (id: string, datum: string, disziplin: string, a: string, b: string, wa: number, wb: number): GewertetePartie => ({
  id,
  datum,
  disziplin,
  a,
  b,
  wa,
  wb
});

describe('Partien hinter einem Rating-Wert', () => {
  const stichtag = '2026-10-05';
  const partien = [
    p('neu9', '2026-09-01', '9-ball', 'olli', 'frank', 5, 3),
    p('neu8', '2026-08-01', '8-ball', 'olli', 'kai', 4, 4),
    p('fremd', '2026-08-02', '9-ball', 'kai', 'frank', 5, 0),
    p('leer', '2026-08-03', '9-ball', 'olli', 'kai', 0, 0),
    p('alt', '2023-01-01', '9-ball', 'olli', 'frank', 5, 1)
  ];

  test('nur eigene Partien, ohne 0:0, ohne Partien vor dem Rueckgriff', () => {
    expect(gewertetePartien(partien, 'olli', 'gesamt', stichtag).map((x) => x.id).sort()).toEqual(['neu8', 'neu9']);
  });

  test('je Disziplin nur diese Disziplin', () => {
    expect(gewertetePartien(partien, 'olli', '9-ball', stichtag).map((x) => x.id)).toEqual(['neu9']);
    expect(gewertetePartien(partien, 'olli', '10-ball', stichtag)).toEqual([]);
  });

  test('wenige Racks: Fenster reicht weiter zurueck, hoechstens bis zum Rueckgriff', () => {
    const mitAlt = [...partien, p('vorjahr', '2025-03-01', '9-ball', 'olli', 'frank', 5, 2)];
    expect(gewertetePartien(mitAlt, 'olli', '9-ball', stichtag).map((x) => x.id)).toEqual(['neu9', 'vorjahr']);
    // mit genug Racks im Fenster bleibt das Vorjahr draussen
    expect(gewertetePartien(mitAlt, 'olli', '9-ball', stichtag, { mindestRacks: 5 }).map((x) => x.id)).toEqual(['neu9']);
  });
});
