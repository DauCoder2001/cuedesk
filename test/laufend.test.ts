import { describe, expect, it } from 'vitest';
import { andererImWeg, fuerTabletsZuAlt, gesternIso, spieltagVon } from '../src/laufend';

const jetzt = Date.parse('2026-10-23T10:00:00Z');
const turnier = (id: string, name = id) => ({ id, name, modus: 'einzelgruppe', einstellungen: {} });
const begegnung = (id: string, liga: Record<string, unknown>) => ({ id, name: id, modus: 'liga', einstellungen: { liga } });

describe('laufende Turniere an den Tablets', () => {
  it('rechnet gestern wie die Anbindung', () => {
    expect(gesternIso(jetzt)).toBe('2026-10-22');
    expect(fuerTabletsZuAlt('2026-10-22', jetzt)).toBe(false);
    expect(fuerTabletsZuAlt('2026-10-21', jetzt)).toBe(true);
  });

  it('kennt den Spieltag aller Begegnungen', () => {
    expect(spieltagVon(begegnung('b1', { begegnung: 1 }))).toBe('b1');
    expect(spieltagVon(begegnung('b2', { begegnung: 2, partner: 'b1' }))).toBe('b1');
    expect(spieltagVon(begegnung('d', { art: 'doppel', haupt: 'b1' }))).toBe('b1');
    expect(spieltagVon(turnier('t'))).toBeNull();
  });

  it('meldet ein anderes laufendes Turnier, aber nicht das eigene', () => {
    expect(andererImWeg(turnier('neu'), [turnier('neu')])).toBeNull();
    expect(andererImWeg(turnier('neu'), [turnier('alt', 'Spaß')])?.name).toBe('Spaß');
  });

  it('laesst Begegnungen desselben Spieltags zu, andere Spieltage nicht', () => {
    const zweite = begegnung('b2', { begegnung: 2, partner: 'b1' });
    expect(andererImWeg(zweite, [begegnung('b1', { begegnung: 1 })])).toBeNull();
    expect(andererImWeg(zweite, [begegnung('d', { art: 'doppel', haupt: 'b1' })])).toBeNull();
    expect(andererImWeg(zweite, [begegnung('x1', { begegnung: 1 })])?.id).toBe('x1');
    expect(andererImWeg(zweite, [turnier('t')])?.id).toBe('t');
  });
});
