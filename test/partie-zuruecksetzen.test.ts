import { describe, expect, test, vi } from 'vitest';

vi.mock('../src/supabase', () => ({ supabase: {} }));

import { zuruecksetzbar } from '../src/partie-zuruecksetzen';

const offen = { tisch_id: null, status: 'geplant' as const, ergebnis_a: null, ergebnis_b: null };

describe('zuruecksetzbar', () => {
  test('offene Partie: nichts zurueckzusetzen', () => {
    expect(zuruecksetzbar(offen)).toBe(false);
    expect(zuruecksetzbar(null)).toBe(false);
  });

  test('am Tisch, laufend, beendet oder mit Ergebnis', () => {
    expect(zuruecksetzbar({ ...offen, tisch_id: 't1' })).toBe(true);
    expect(zuruecksetzbar({ ...offen, status: 'laeuft' })).toBe(true);
    expect(zuruecksetzbar({ ...offen, status: 'beendet', ergebnis_a: 60, ergebnis_b: 42 })).toBe(true);
    expect(zuruecksetzbar({ ...offen, ergebnis_a: 2 })).toBe(true);
  });
});
