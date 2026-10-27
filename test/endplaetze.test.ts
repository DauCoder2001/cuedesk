import { describe, expect, it } from 'vitest';
import { vorlaeufigeEndplaetze } from '../src/endplaetze';
import type { EndplatzPartie } from '../src/endplaetze';

const partie = (id: string, phase: string, paarung: number, a: string, b: string, ea: number | null, eb: number | null, tisch: string | null = null): EndplatzPartie => ({
  id,
  phase,
  gruppe: null,
  paarung,
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  vorgabe_a: 0,
  vorgabe_b: 0,
  race_to: 3,
  status: ea === null ? (tisch ? 'laeuft' : 'geplant') : 'beendet',
  tisch_id: tisch
});

describe('vorlaeufige Endplaetze', () => {
  it('ohne angesetzte Duelle gibt es keine', () => {
    expect(vorlaeufigeEndplaetze('zwei-gruppen', { raceTo: 3 }, [], [], () => null)).toBeNull();
    expect(vorlaeufigeEndplaetze('einzelgruppe', { raceTo: 3 }, [], [], () => null)).toBeNull();
  });

  it('Zwei Gruppen: offene Duelle als Platzbereich, entschiedene fest, Spielfreie hinten', () => {
    const e = { raceTo: 3, racePhase2: 3, phase2: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2'] } };
    const partien = [
      partie('d1', 'phase2', 1, 'a1', 'b1', null, null, 'tisch-1'),
      partie('d2', 'phase2', 2, 'a2', 'b2', 1, 3)
    ];
    const r = vorlaeufigeEndplaetze('zwei-gruppen', e, [], partien, (id) => (id === 'tisch-1' ? '1' : null));
    expect(r?.art).toBe('duelle');
    expect(r?.beendet).toBe(1);
    expect(r?.gesamt).toBe(2);
    expect(r?.zeilen).toEqual([
      { von: 1, bis: 2, personen: ['a1', 'b1'], info: '', offen: true, partieId: 'd1', tisch: '1' },
      { von: 3, bis: 3, personen: ['b2'], info: '3 : 1', offen: false, partieId: null, tisch: null },
      { von: 4, bis: 4, personen: ['a2'], info: '1 : 3', offen: false, partieId: null, tisch: null },
      { von: 5, bis: 5, personen: ['a3'], info: 'spielfrei', offen: false, partieId: null, tisch: null }
    ]);
  });
});
