import { describe, expect, test } from 'vitest';
import { dauerText, kachel } from '../src/live';

const jetzt = Date.parse('2026-09-22T20:00:00Z');
const frisch = '2026-09-22T19:59:00Z';

describe('Kachel eines Tisches', () => {
  test('ohne Stand oder veraltet ist der Tisch frei', () => {
    expect(kachel(null, null, jetzt)).toEqual({ art: 'frei', bereit: false });
    expect(kachel({ gameType: 'pool', score1: 3, score2: 1 }, '2026-09-22T16:00:00Z', jetzt)).toEqual({
      art: 'frei',
      bereit: false
    });
  });

  test('frisches Board ohne Spiel ist bereit, nicht besetzt', () => {
    expect(kachel({ gameType: 'pool', score1: 0, score2: 0 }, frisch, jetzt)).toEqual({ art: 'frei', bereit: true });
    expect(kachel({ gameType: '14.1', s1: 0, s2: 0, log: [] }, frisch, jetzt)).toEqual({ art: 'frei', bereit: true });
  });

  test('ein Spiel zaehlt auch bei 0:0, sobald es angefangen hat', () => {
    // Namen eingetragen
    expect(kachel({ gameType: 'pool', score1: 0, score2: 0, player1: 'Kai' }, frisch, jetzt).art).toBe('pool');
    // Uhr laeuft
    expect(kachel({ gameType: 'pool', score1: 0, score2: 0, startedAt: jetzt - 60000 }, frisch, jetzt).art).toBe('pool');
    // Turnierspiel
    expect(kachel({ gameType: 'pool', score1: 0, score2: 0, tournamentMatchId: 'x' }, frisch, jetzt).art).toBe('pool');
    expect(kachel({ gameType: '14.1', s1: 0, s2: 0, log: [], player2: 'Olli' }, frisch, jetzt).art).toBe('14.1');
  });

  test('Pool: Stand, Race-to und Anstoss', () => {
    const k = kachel(
      { gameType: 'pool', player1: 'Sven', player2: 'Olli', score1: 3, score2: 2, raceTo: 5, nextBreak: 2 },
      frisch,
      jetzt
    );
    expect(k).toMatchObject({ art: 'pool', laeuft: true, stand1: 3, stand2: 2, raceTo: 5, hinweis: 'Nächster Anstoß: Olli' });
  });

  test('Pool: Race-to erreicht heisst beendet', () => {
    const k = kachel({ gameType: 'pool', score1: 5, score2: 2, raceTo: 5 }, frisch, jetzt);
    expect(k).toMatchObject({ laeuft: false, hinweis: 'Spiel beendet' });
  });

  test('14.1: wer am Tisch ist, Ziel und Aufnahme', () => {
    const k = kachel(
      { gameType: '14.1', player1: 'Matthias H', player2: 'Kai', s1: 37, s2: 21, turn: 1, target: 60, targetInn: 0, inn1: 14, inn2: 13, log: [{}] },
      frisch,
      jetzt
    );
    expect(k).toMatchObject({ art: '14.1', laeuft: true, hinweis: 'Am Tisch: Matthias H', ziel: 'Ziel 60 · Aufnahme 14' });
  });

  test('14.1: gesperrt heisst beendet, Aufnahmen-Limit wird gezeigt', () => {
    const k = kachel({ gameType: '14.1', s1: 60, s2: 12, locked: true, target: 60, targetInn: 20, inn1: 9, inn2: 9 }, frisch, jetzt);
    expect(k).toMatchObject({ laeuft: false, hinweis: 'Spiel beendet', ziel: 'Ziel 60 / 20 Aufn. · Aufnahme 9' });
  });

  test('Dauer in Minuten und Stunden', () => {
    expect(dauerText(jetzt - 32 * 60000, jetzt)).toBe('läuft seit 32 min');
    expect(dauerText(jetzt - 75 * 60000, jetzt)).toBe('läuft seit 1:15 h');
    expect(dauerText(null, jetzt)).toBe('läuft');
  });
});
