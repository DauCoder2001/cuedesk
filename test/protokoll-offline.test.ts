import { describe, expect, it } from 'vitest';
import { insProtokoll, PROTOKOLL_ANZAHL, protokollErgaenzen, protokollLesen } from '../scoreboards/js/protokoll-offline';

const spiel = (n: number) => ({ tisch: '2', player1: `Rot ${n}`, player2: `Blau ${n}`, score1: 5, score2: n });

describe('Offline-Protokoll am Pool-Scoreboard', () => {
  it('neuestes Spiel vorn, hoechstens 10', () => {
    let liste = protokollLesen(null);
    for (let n = 1; n <= 12; n += 1) liste = protokollErgaenzen(liste, spiel(n), new Date(2026, 10, 5, 12, n));
    expect(liste).toHaveLength(PROTOKOLL_ANZAHL);
    expect(liste[0]).toMatchObject({ table: '2', gameType: 'pool', player1: 'Rot 12', score1: 5, score2: 12, date: '5.11.2026', timestamp: '12:12' });
    expect(liste[9].player1).toBe('Rot 3');
  });

  it('kaputter Speicher ergibt leere Liste', () => {
    expect(protokollLesen('{kaputt')).toEqual([]);
    expect(protokollLesen('{"a":1}')).toEqual([]);
    expect(protokollLesen(JSON.stringify([{ player1: 'A' }, null, 3]))).toHaveLength(1);
  });

  it('nur beendete Spiele mit Punkten', () => {
    expect(insProtokoll(0, 0, 5, false)).toBe(false);
    expect(insProtokoll(3, 2, 5, false)).toBe(false); // abgebrochen
    expect(insProtokoll(5, 2, 5, true)).toBe(true);
    expect(insProtokoll(7, 4, 0, false)).toBe(true); // freies Spiel ohne Race-to
  });
});
