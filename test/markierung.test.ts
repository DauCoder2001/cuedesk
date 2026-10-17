import { describe, expect, test } from 'vitest';
import { gemeinsamePartie, istMarkiert, markierungUmschalten } from '../src/markierung';

const partie = (id: string, a: string, b: string, status = 'geplant') => ({ id, spieler_a: a, spieler_b: b, status });

describe('Teilnehmer markieren', () => {
  test('ankreuzen, abwaehlen, hoechstens zwei', () => {
    expect(markierungUmschalten([], 'a')).toEqual(['a']);
    expect(markierungUmschalten(['a'], 'b')).toEqual(['a', 'b']);
    expect(markierungUmschalten(['a', 'b'], 'c')).toEqual(['b', 'c']);
    expect(markierungUmschalten(['a', 'b'], 'a')).toEqual(['b']);
  });

  test('gemeinsame Partie: erste offene, sonst die letzte, Seiten egal', () => {
    const plan = [partie('g1', 'a', 'b', 'beendet'), partie('g2', 'c', 'd'), partie('d1', 'b', 'a')];
    expect(gemeinsamePartie(plan, 'a', 'b')?.id).toBe('d1');
    expect(gemeinsamePartie([plan[0]], 'b', 'a')?.id).toBe('g1');
    expect(gemeinsamePartie(plan, 'a', 'c')).toBeNull();
  });

  test('hervorgehoben: bei zwei nur ihre Partie, bei einem alle seine', () => {
    const ab = partie('p1', 'a', 'b');
    const ac = partie('p2', 'a', 'c');
    expect(istMarkiert(ab, ['a', 'b'], ab)).toBe(true);
    expect(istMarkiert(ac, ['a', 'b'], ab)).toBe(false);
    expect(istMarkiert(ac, ['a'], null)).toBe(true);
    expect(istMarkiert(partie('p3', 'c', 'd'), ['a'], null)).toBe(false);
    expect(istMarkiert(ab, [], null)).toBe(false);
  });
});
