import { describe, expect, test } from 'vitest';
import { KEIN_FILTER, auswahl, filterAktiv, passt } from '../src/turnierliste';

const zeilen = [
  { name: '9-Ball Vereinsmeisterschaft', datum: '2026-11-07', disziplin: '9-Ball', modus: 'Zwei Gruppen', stand: 'in Vorbereitung' },
  { name: '9-Ball Vereinsmeisterschaft', datum: '2025-11-08', disziplin: '9-Ball', modus: 'Zwei Gruppen', stand: 'beendet' },
  { name: 'Monatsturnier Oktober', datum: '2026-10-03', disziplin: '8-Ball', modus: 'Einzelgruppe', stand: 'beendet' }
];
const gefiltert = (f: Partial<typeof KEIN_FILTER>) => zeilen.filter((z) => passt(z, { ...KEIN_FILTER, ...f })).map((z) => z.datum);

describe('Filter der Turnierliste', () => {
  test('ohne Filter alles', () => {
    expect(gefiltert({})).toHaveLength(3);
    expect(filterAktiv(KEIN_FILTER)).toBe(false);
  });
  test('Name als Teil, ohne Gross- und Kleinschreibung', () => {
    expect(gefiltert({ suche: ' vereinsMEISTER ' })).toEqual(['2026-11-07', '2025-11-08']);
  });
  test('Filter wirken zusammen', () => {
    expect(gefiltert({ jahr: '2026', stand: 'beendet' })).toEqual(['2026-10-03']);
    expect(gefiltert({ disziplin: '9-Ball', jahr: '2025' })).toEqual(['2025-11-08']);
    expect(filterAktiv({ ...KEIN_FILTER, modus: 'Einzelgruppe' })).toBe(true);
  });
  test('Auswahl nur aus vorhandenen Werten, Jahre neueste zuerst', () => {
    expect(auswahl(zeilen)).toEqual({
      jahre: ['2026', '2025'],
      disziplinen: ['8-Ball', '9-Ball'],
      modi: ['Einzelgruppe', 'Zwei Gruppen'],
      staende: ['beendet', 'in Vorbereitung']
    });
  });
});
