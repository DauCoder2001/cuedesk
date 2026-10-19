import { describe, expect, test } from 'vitest';
import { andereAmTisch, belegtText } from '../src/geraete';

const g = (id: string, name: string, tisch_id: string | null) => ({ id, name, tisch_id, zuletzt_gesehen: null });
const geraete = [g('a', 'Tablet A', 't1'), g('b', 'Tablet B', 't2'), g('c', 'Fernseher', null)];

describe('Geräte am selben Tisch', () => {
  test('anderes Gerät am Tisch wird gefunden, das eigene nicht', () => {
    expect(andereAmTisch(geraete, 't1').map((x) => x.name)).toEqual(['Tablet A']);
    expect(andereAmTisch(geraete, 't1', 'a')).toEqual([]);
    expect(andereAmTisch(geraete, 't3')).toEqual([]);
  });

  test('ohne Tisch (Fernseher) ist nie belegt', () => {
    expect(andereAmTisch(geraete, null)).toEqual([]);
    expect(andereAmTisch(geraete, '')).toEqual([]);
  });

  test('Text der Rückfrage nennt Tisch, Gerät und letzten Kontakt', () => {
    const text = belegtText('Tisch 1', [geraete[0]], () => 'noch nicht gemeldet');
    expect(text).toContain('An Tisch 1 hängt schon „Tablet A“ (noch nicht gemeldet).');
    expect(text).toContain('überschreiben sich gegenseitig den Spielstand');
  });
});
