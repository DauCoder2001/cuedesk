import { describe, expect, test } from 'vitest';
import { diffText, turnierBilanz } from '../src/turnier-bilanz';

const p = (a: string | null, b: string | null, ea: number | null, eb: number | null, status = 'beendet') => ({
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  status
});

describe('Bilanz ueber das ganze Turnier', () => {
  const bilanz = turnierBilanz([
    p('frank', 'olli', 5, 3), // Gruppe
    p('frank', 'kai', 2, 5), // Gruppe
    p('frank', 'olli', 7, 6), // Finale
    p('frank', 'kai', 4, 2, 'laeuft'), // laeuft noch: zaehlt nicht
    p('olli', null, 5, 0), // ohne Gegner: zaehlt nicht
    p('kai', 'olli', null, null) // ohne Ergebnis: zaehlt nicht
  ]);

  test('Spiele, Siege und Saetze aus allen beendeten Partien', () => {
    expect(bilanz.get('frank')).toEqual({ spiele: 3, siege: 2, gewonnen: 14, verloren: 14 });
    expect(bilanz.get('olli')).toEqual({ spiele: 2, siege: 0, gewonnen: 9, verloren: 12 });
    expect(bilanz.get('kai')).toEqual({ spiele: 1, siege: 1, gewonnen: 5, verloren: 2 });
  });

  test('Satzdifferenz mit Vorzeichen', () => {
    expect(diffText({ spiele: 1, siege: 1, gewonnen: 5, verloren: 2 })).toBe('+3');
    expect(diffText({ spiele: 1, siege: 0, gewonnen: 2, verloren: 5 })).toBe('-3');
    expect(diffText({ spiele: 0, siege: 0, gewonnen: 0, verloren: 0 })).toBe('0');
  });
});
