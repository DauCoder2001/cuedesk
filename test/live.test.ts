import { describe, expect, test } from 'vitest';
import { dauerText, einzelspielAusStand, kachel, laufenderStand, laufenderStandText, liveAktiv, nichtGespeichert } from '../src/live';

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

  test('Turnierpartie oder freies Spiel', () => {
    expect(kachel({ gameType: 'pool', score1: 2, tournamentMatchId: 'p2' }, frisch, jetzt)).toMatchObject({ turnierspiel: true });
    expect(kachel({ gameType: 'pool', player1: 'Highlander', score1: 2 }, frisch, jetzt)).toMatchObject({ turnierspiel: false });
    expect(kachel({ gameType: '14.1', s1: 5, tournamentMatchId: 'p1' }, frisch, jetzt)).toMatchObject({ turnierspiel: true });
    expect(kachel({ gameType: '14.1', s1: 5 }, frisch, jetzt)).toMatchObject({ turnierspiel: false });
  });

  test('Laufender Stand im Spielplan, auch nach Seitenwechsel', () => {
    const z141 = { gameType: '14.1', player1: 'Frank F.', player2: 'Kura', s1: 14, s2: 28, inn1: 1, inn2: 1, tournamentMatchId: 'p1' };
    const s = laufenderStand(z141, frisch, 'Frank F.', 'Kura (Bassum)', jetzt);
    expect(s).toEqual({ a: 14, b: 28, aufnahme: 1, beendet: false });
    expect(laufenderStandText(s!, 1)).toBe('● Tisch 1 · 14 : 28 · Aufn. 1');
    // Seiten am Board getauscht: Kura steht links
    const getauscht = { ...z141, player1: 'Kura', player2: 'Frank F.', s1: 28, s2: 14 };
    expect(laufenderStand(getauscht, frisch, 'Frank F.', 'Kura (Bassum)', jetzt)).toMatchObject({ a: 14, b: 28 });
    // Pool am Ziel, noch nicht bestaetigt
    const pool = { gameType: 'pool', player1: 'Sven', player2: 'Olli', score1: 4, score2: 2, raceTo: 4, tournamentMatchId: 'p2' };
    expect(laufenderStandText(laufenderStand(pool, frisch, 'Sven', 'Olli', jetzt)!, 2)).toBe('● Tisch 2 · 4 : 2 · beendet, noch nicht bestätigt');
    // Freies Spiel gehoert in keinen Spielplan
    expect(laufenderStand({ gameType: 'pool', player1: 'A', score1: 1 }, frisch, 'A', 'B', jetzt)).toBeNull();
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

describe('Liegengeblieben und nicht gespeichert', () => {
  const alt = '2026-09-22T16:00:00Z'; // vier Stunden her
  test('veraltetes begonnenes Spiel wird gemeldet, mit dem alten Stand', () => {
    const k = nichtGespeichert({ gameType: 'pool', score1: 0, score2: 3, raceTo: 3, player1: 'Ingo', player2: 'Matthias' }, alt, jetzt);
    expect(k?.art).toBe('pool');
    expect(k && k.art !== 'frei' && [k.spieler1, k.stand1, k.stand2, k.laeuft]).toEqual(['Ingo', 0, 3, false]);
  });

  test('frischer Stand, leeres Board oder kein Stand: nichts zu melden', () => {
    expect(nichtGespeichert({ gameType: 'pool', score1: 1, score2: 0, player1: 'Kai' }, frisch, jetzt)).toBeNull();
    expect(nichtGespeichert({ gameType: 'pool', score1: 0, score2: 0 }, alt, jetzt)).toBeNull();
    expect(nichtGespeichert(null, alt, jetzt)).toBeNull();
    expect(nichtGespeichert({ gameType: 'pool', score1: 2, score2: 1 }, null, jetzt)).toBeNull();
  });
});

describe('Einzelspiel aus liegengebliebenem Stand', () => {
  const alt = '2026-09-22T16:00:00Z';
  const pool = { gameType: 'pool', score1: 0, score2: 3, raceTo: 3, player1: 'Ingo', player2: 'Matthias', player1Id: 'i', player2Id: 'm', startedAt: Date.parse('2026-09-22T15:30:00Z') };

  test('Pool mit Spielern aus der Liste: Zeile wie am Tablet, Zeit vom Stand', () => {
    expect(einzelspielAusStand(pool, alt, '9-ball', 'v', 't')).toEqual({
      verein_id: 'v',
      turnier_id: null,
      disziplin: '9-ball',
      datum: '2026-09-22',
      tisch_id: 't',
      spieler_a: 'i',
      spieler_b: 'm',
      race_to: 3,
      ergebnis_a: 0,
      ergebnis_b: 3,
      status: 'beendet',
      rating_werten: false,
      begonnen: '2026-09-22T15:30:00.000Z',
      beendet: '2026-09-22T16:00:00.000Z'
    });
  });

  test('Race nicht erreicht: abgebrochen', () => {
    expect(einzelspielAusStand({ ...pool, score2: 2 }, alt, '8-ball', 'v', 't')?.status).toBe('abgebrochen');
  });

  test('nicht moeglich bei 14.1, Turnierpartie, frei eingetippten oder gleichen Spielern', () => {
    expect(einzelspielAusStand({ gameType: '14.1', s1: 20, s2: 10, player1: 'A', player1Id: 'i', player2Id: 'm' }, alt, '9-ball', 'v', 't')).toBeNull();
    expect(einzelspielAusStand({ ...pool, tournamentMatchId: 'x' }, alt, '9-ball', 'v', 't')).toBeNull();
    expect(einzelspielAusStand({ ...pool, player2Id: null }, alt, '9-ball', 'v', 't')).toBeNull();
    expect(einzelspielAusStand({ ...pool, player2Id: 'i' }, alt, '9-ball', 'v', 't')).toBeNull();
  });
});

describe('Live-Uebertragung', () => {
  test('nur bei laufendem Turnier, Live fehlt = an', () => {
    expect(liveAktiv([])).toBe(false);
    expect(liveAktiv([{ status: 'geplant', einstellungen: {} }])).toBe(false);
    expect(liveAktiv([{ status: 'laeuft', einstellungen: {} }])).toBe(true);
    expect(liveAktiv([{ status: 'laeuft', einstellungen: { live: false } }])).toBe(false);
    expect(liveAktiv([{ status: 'laeuft', einstellungen: { live: false } }, { status: 'laeuft', einstellungen: { live: true } }])).toBe(true);
    expect(liveAktiv([{ status: 'beendet', einstellungen: { live: true } }])).toBe(false);
  });
});
