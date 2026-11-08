import { describe, expect, test } from 'vitest';
import { agentErreichbar, andereAmTisch, belegtText, herunterfahrenFrage, herunterfahrenMeldung } from '../src/geraete';

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

describe('TV-Gerät herunterfahren', () => {
  const jetzt = Date.parse('2026-11-08T12:00:00Z');

  test('Agent gilt zwei Minuten lang als erreichbar', () => {
    expect(agentErreichbar('2026-11-08T11:59:30Z', jetzt)).toBe(true);
    expect(agentErreichbar('2026-11-08T11:58:00Z', jetzt)).toBe(false);
    expect(agentErreichbar(null, jetzt)).toBe(false);
  });

  test('Texte richten sich nach der Anzahl', () => {
    expect(herunterfahrenFrage(1)).toContain('TV-Gerät herunterfahren?');
    expect(herunterfahrenFrage(2)).toContain('Alle 2 TV-Geräte herunterfahren?');
    expect(herunterfahrenMeldung(1)).toBe('Das TV-Gerät fährt in den nächsten 30 Sekunden herunter.');
    expect(herunterfahrenMeldung(3)).toBe('3 TV-Geräte fahren in den nächsten 30 Sekunden herunter.');
  });
});
