import { describe, expect, test } from 'vitest';
import {
  ausspielziel,
  belegteSpieler,
  ergebnisSchonEingetragen,
  filterNamen,
  freiesSpielLaeuft,
  freilosAbschliessen,
  freilosWertung,
  fremdesTurnierspiel,
  gehoertZumTisch,
  haengendeSpiele,
  hat141Partien,
  koFortschreibung,
  ohneSpielParameter,
  offeneSpiele,
  poolAuswahl,
  poolModus,
  siegerText,
  spielAbschliessen,
  spielBeanspruchen,
  spielZuruecklegen,
  wartetText,
  wechselRueckfrage,
  zeige141Auswahl,
  zielErreicht
} from '../scoreboards/js/board-regeln';
import type { BoardSpiel, BoardTurnier } from '../scoreboards/js/board-regeln';

const spiel = (extra: Partial<BoardSpiel> = {}): BoardSpiel => ({
  player1: 'Sven',
  player2: 'Kai',
  status: 'pending',
  table: null,
  startedAt: null,
  raceTo: 4,
  ...extra
});

// Ein Liga-Spieltag, wie ihn das Tablet sieht
const spieltag = (): BoardTurnier => ({
  status: 'running',
  raceTo: 4,
  schedule: {
    p1: spiel({ discipline: '14.1', player1: 'Frank', player2: 'Marcel', raceTo: 60, innings: 25 }),
    p2: spiel({ discipline: '8-Ball', player1: 'Kai', player2: 'Thomas' }),
    p3: spiel({ discipline: '9-Ball', player1: 'Olli', player2: 'Maxim', status: 'running', table: '2' }),
    p4: spiel({ discipline: '10-Ball', player1: 'Sven', player2: 'Waldemar', status: 'completed' }),
    p5: spiel({ discipline: '14.1', player1: 'Sven', player2: '', raceTo: 60 }) // Gegner noch offen
  }
});

describe('Haengende Spiele', () => {
  const mitLaufendem141 = (): BoardTurnier => {
    const t = spieltag()!;
    t.schedule!.p1 = spiel({ discipline: '14.1', player1: 'Frank', player2: 'Marcel', status: 'running', table: '1' });
    return t;
  };

  test('laeuft hier, aber der Tisch haelt es nicht mehr', () => {
    const frei = { gameType: 'pool', player1: 'Spieler 1', player2: 'Spieler 2' };
    expect(haengendeSpiele(mitLaufendem141(), '14.1', 1, frei).map((m) => m.id)).toEqual(['p1']);
    expect(haengendeSpiele(mitLaufendem141(), '14.1', '1', null).map((m) => m.id)).toEqual(['p1']);
  });

  test('nicht, solange der Tisch das Spiel haelt', () => {
    expect(haengendeSpiele(mitLaufendem141(), '14.1', 1, { gameType: '14.1', tournamentMatchId: 'p1' })).toEqual([]);
  });

  test('nur am eigenen Tisch und am passenden Board', () => {
    expect(haengendeSpiele(mitLaufendem141(), '14.1', 2, null)).toEqual([]);
    expect(haengendeSpiele(mitLaufendem141(), 'pool', 1, null)).toEqual([]);
    expect(haengendeSpiele(spieltag(), 'pool', 2, null).map((m) => m.id)).toEqual(['p3']);
  });

  test('Turnierpartie der anderen Spielart am Tisch', () => {
    expect(fremdesTurnierspiel({ gameType: '14.1', tournamentMatchId: 'p1' }, 'pool')).toBe(true);
    expect(fremdesTurnierspiel({ gameType: 'pool', tournamentMatchId: 'p2' }, '14.1')).toBe(true);
    expect(fremdesTurnierspiel({ gameType: 'pool', tournamentMatchId: 'p2' }, 'pool')).toBe(false);
    expect(fremdesTurnierspiel({ gameType: '14.1', s1: 5 }, 'pool')).toBe(false);
    expect(fremdesTurnierspiel(null, 'pool')).toBe(false);
  });
});

describe('Wechsel der Spielart', () => {
  const stand141 = { gameType: '14.1', player1: 'Tom', player2: 'Tim', s1: 11, s2: 8, inn1: 1, inn2: 0, log: [{}] };
  const standPool = { gameType: 'pool', player1: 'Tom', player2: 'Tim', score1: 3, score2: 2, raceTo: 5 };

  test('laufendes 14.1-Spiel: Pool-Board fragt nach', () => {
    const frage = wechselRueckfrage(stand141, 'pool', '1');
    expect(frage).toContain('An Tisch 1 läuft ein 14.1-Spiel');
    expect(frage).toContain('Tom 11 : 8 Tim (1 Aufnahme)');
    expect(frage).toContain('geht dabei verloren');
  });

  test('laufendes 8/9/10-Spiel: 14.1-Board fragt nach', () => {
    expect(wechselRueckfrage(standPool, '14.1', '2')).toContain('Tom 3 : 2 Tim');
  });

  test('leer, nur Namen, beendet oder Turnier: keine Rueckfrage', () => {
    expect(wechselRueckfrage(null, 'pool', '1')).toBeNull();
    expect(wechselRueckfrage({ gameType: '14.1', player1: 'Tom', s1: 0, s2: 0, log: [] }, 'pool', '1')).toBeNull();
    expect(wechselRueckfrage({ ...stand141, locked: true }, 'pool', '1')).toBeNull();
    expect(wechselRueckfrage({ ...stand141, tournamentMatchId: 'm1' }, 'pool', '1')).toBeNull();
    expect(wechselRueckfrage({ ...standPool, score1: 0, score2: 0 }, '14.1', '1')).toBeNull();
    expect(wechselRueckfrage({ ...standPool, score1: 5 }, '14.1', '1')).toBeNull();
  });

  test('gleiche Spielart: keine Rueckfrage', () => {
    expect(wechselRueckfrage(stand141, '14.1', '1')).toBeNull();
    expect(wechselRueckfrage(standPool, 'pool', '1')).toBeNull();
  });
});

describe('Freies Spiel', () => {
  test('frischer Tisch ist kein angefangenes Spiel', () => {
    expect(freiesSpielLaeuft({ gameType: 'pool', player1: 'Spieler 1', player2: 'Spieler 2', score1: 0, score2: 0 }, 'pool')).toBe(false);
    expect(freiesSpielLaeuft(null, 'pool')).toBe(false);
  });

  test('Punkte, Namen, Startzeit oder der Vermerk zaehlen als angefangen', () => {
    expect(freiesSpielLaeuft({ gameType: 'pool', score1: 1 }, 'pool')).toBe(true);
    expect(freiesSpielLaeuft({ gameType: 'pool', player1: 'Hans', player2: 'Spieler 2' }, 'pool')).toBe(true);
    expect(freiesSpielLaeuft({ gameType: 'pool', startedAt: 1 }, 'pool')).toBe(true);
    expect(freiesSpielLaeuft({ gameType: 'pool', frei: true }, 'pool')).toBe(true);
  });

  test('Turnierspiel oder andere Spielart ist kein freies Pool-Spiel', () => {
    expect(freiesSpielLaeuft({ gameType: 'pool', score1: 3, tournamentMatchId: 'p2' }, 'pool')).toBe(false);
    expect(freiesSpielLaeuft({ gameType: '14.1', s1: 12 }, 'pool')).toBe(false);
  });

  test('14.1: auch ein Protokoll zaehlt', () => {
    expect(freiesSpielLaeuft({ gameType: '14.1', s1: 0, s2: 0, log: [] }, '14.1')).toBe(false);
    expect(freiesSpielLaeuft({ gameType: '14.1', log: [{}] }, '14.1')).toBe(true);
    expect(freiesSpielLaeuft({ gameType: '14.1', s2: -1 }, '14.1')).toBe(true);
  });
});

describe('Offene Paarungen je Board', () => {
  test('14.1-Board: nur 14.1 mit beiden Spielern', () => {
    expect(offeneSpiele(spieltag(), '14.1').map((m) => m.id)).toEqual(['p1']);
  });

  test('Pool-Board: offene Liga-Spiele ohne 14.1', () => {
    expect(offeneSpiele(spieltag(), 'pool').map((m) => m.id)).toEqual(['p2']);
  });

  test('ohne Turnier keine Paarungen', () => {
    expect(offeneSpiele(null, 'pool')).toEqual([]);
    expect(offeneSpiele({ status: 'running' }, '14.1')).toEqual([]);
  });

  test('Ueberschrift je nach Anzahl', () => {
    expect(wartetText(1, '14.1')).toBe('Ein 14.1-Spiel wartet noch:');
    expect(wartetText(2, '14.1')).toBe('2 14.1-Spiele warten noch:');
    expect(wartetText(1, 'pool')).toBe('Ein weiteres Spiel wartet noch:');
    expect(wartetText(3, 'pool')).toBe('3 weitere Spiele warten noch:');
  });
});

describe('Spielauswahl am Pool-Board', () => {
  const turnier = (): BoardTurnier => ({
    status: 'running',
    raceTo: 5,
    schedule: {
      a: spiel({ player1: 'Sven', player2: 'Kai' }),
      b: spiel({ player1: 'Olli', player2: 'Gerd', status: 'running', table: '1' }),
      c: spiel({ player1: 'Olli', player2: 'Hans' }), // Olli spielt gerade
      d: spiel({ player1: null as unknown as string, player2: 'Frank', phase: 'ko', title: 'Finale' }),
      e: spiel({ player1: 'FREILOS 1', player2: 'Bruno' }),
      f: spiel({ player1: 'Frank', player2: 'Marcel', discipline: '14.1' })
    }
  });

  test('belegte Spieler und Filternamen', () => {
    expect([...belegteSpieler(turnier())].sort()).toEqual(['Gerd', 'Olli']);
    expect(filterNamen(turnier())).toEqual(['Bruno', 'Frank', 'Hans', 'Kai', 'Marcel', 'Olli', 'Sven']);
  });

  test('spielbar zuerst, wartende KO-Spiele zuletzt, 14.1 fehlt', () => {
    const liste = poolAuswahl(turnier(), '');
    expect(liste.map((m) => m.id)).toEqual(['a', 'e', 'c', 'd']);
    expect(liste.find((m) => m.id === 'c')?._playable).toBe(false);
    expect(liste.find((m) => m.id === 'd')?._waiting).toBe(true);
    expect(liste.find((m) => m.id === 'e')?._freilos).toBe(true);
  });

  test('Doppel: ein Spieler in zwei Doppeln sperrt das zweite, solange das erste laeuft', () => {
    const plan = (ersterStatus: BoardSpiel['status']): BoardTurnier => ({
      status: 'running',
      schedule: {
        d1: spiel({ player1: 'Frank F. / Matthias N.', player2: 'Gast A / Gast B', status: ersterStatus, table: '1', personen: ['frank', 'matthias', 'ga', 'gb'] }),
        d2: spiel({ player1: 'Kai K. / Volker B.', player2: 'Gast C / Gast D', personen: ['kai', 'volker', 'gc', 'gd'] }),
        d3: spiel({ player1: 'Olli G. / Frank F.', player2: 'Gast E / Gast F', personen: ['olli', 'frank', 'ge', 'gf'] })
      }
    });
    const liste = poolAuswahl(plan('running'), '');
    expect(liste.find((m) => m.id === 'd2')?._playable).toBe(true);
    expect(liste.find((m) => m.id === 'd3')?._playable).toBe(false);
    // Ist Doppel 1 fertig, ist Frank wieder frei
    expect(poolAuswahl(plan('completed'), '').find((m) => m.id === 'd3')?._playable).toBe(true);
  });

  test('Ohne Kennungen (Pool-TS, offline) zaehlt weiter der Name', () => {
    const liste = poolAuswahl(turnier(), '');
    expect(liste.find((m) => m.id === 'c')?._playable).toBe(false);
    expect(liste.find((m) => m.id === 'a')?._playable).toBe(true);
  });

  test('Filter zeigt nur die Spiele eines Spielers', () => {
    expect(poolAuswahl(turnier(), 'Olli').map((m) => m.id)).toEqual(['c']);
  });

  test('Bildschirm je nach Lage', () => {
    expect(poolModus(true, false, false)).toBe('picker');
    expect(poolModus(true, false, true)).toBe('match');
    expect(poolModus(true, true, true)).toBe('free');
    expect(poolModus(false, false, false)).toBe('free');
  });

  test('14.1-Auswahl nur bei laufendem Turnier mit 14.1-Partien', () => {
    expect(zeige141Auswahl(true, false, false, true)).toBe(true);
    expect(zeige141Auswahl(true, true, false, true)).toBe(false);
    expect(zeige141Auswahl(true, false, true, true)).toBe(false);
    expect(zeige141Auswahl(true, false, false, false)).toBe(false);
    expect(zeige141Auswahl(false, false, false, true)).toBe(false);
  });

  test('14.1-Partien im Turnier, auch wenn alle gespielt sind', () => {
    expect(hat141Partien(spieltag())).toBe(true);
    const gespielt = spieltag()!;
    gespielt.schedule!.p1.status = 'completed';
    gespielt.schedule!.p5.status = 'completed';
    expect(offeneSpiele(gespielt, '14.1')).toEqual([]);
    expect(hat141Partien(gespielt)).toBe(true);
    expect(hat141Partien({ status: 'running', schedule: { a: spiel({ discipline: '9-Ball' }) } })).toBe(false);
    expect(hat141Partien(null)).toBe(false);
  });
});

describe('Spiel und Tisch', () => {
  test('gehoert nur dem Tisch, an dem es laeuft', () => {
    expect(gehoertZumTisch(spiel({ status: 'running', table: '3' }), 3)).toBe(true);
    expect(gehoertZumTisch(spiel({ status: 'running', table: '2' }), '3')).toBe(false);
    expect(gehoertZumTisch(spiel({ status: 'pending', table: '3' }), '3')).toBe(false);
    expect(gehoertZumTisch(null, '3')).toBe(false);
  });

  test('beanspruchen nur offen und mit beiden Spielern', () => {
    const m = spielBeanspruchen(spiel(), '4', 1000);
    expect(m).toMatchObject({ status: 'running', table: '4', startedAt: 1000 });
    expect(spielBeanspruchen(spiel({ status: 'running', table: '2' }), '4', 1000)).toBeUndefined();
    expect(spielBeanspruchen(spiel({ player2: null as unknown as string }), '4', 1000)).toBeUndefined();
    expect(spielBeanspruchen(null, '4', 1000)).toBeUndefined();
  });

  test('zuruecklegen und abschliessen nur am eigenen Tisch', () => {
    expect(spielZuruecklegen(spiel({ status: 'running', table: '4', startedAt: 5 }), '4')).toMatchObject({
      status: 'pending',
      table: null,
      startedAt: null
    });
    expect(spielZuruecklegen(spiel({ status: 'running', table: '2' }), '4')).toBeUndefined();
    expect(spielAbschliessen(spiel({ status: 'running', table: '4' }), '4', 'r1')).toMatchObject({
      status: 'completed',
      resultId: 'r1'
    });
    expect(spielAbschliessen(spiel({ status: 'completed', table: '4' }), '4', 'r1')).toBeUndefined();
  });

  // Wurde die Partie in CueDesk zurueck in den Plan gelegt, waehrend am Tisch
  // weitergespielt wurde, zaehlt das Ergebnis trotzdem - aber nur mit
  // denselben Spielern und nur, solange sie an keinem anderen Tisch laeuft.
  test('zurueckgelegtes Spiel wird mit denselben Spielern trotzdem abgeschlossen', () => {
    const zurueck = () => spiel({ status: 'pending', table: null, player1: 'Marcel B. (Bassum)', player2: 'Frank' });
    // Seiten am Board getauscht, Vereinszusatz fehlt: egal
    expect(spielAbschliessen(zurueck(), '4', 'r1', { player1: 'Frank', player2: 'Marcel B.' })).toMatchObject({
      status: 'completed',
      resultId: 'r1'
    });
    // Aufstellung inzwischen geaendert: nicht speichern
    expect(spielAbschliessen(zurueck(), '4', 'r1', { player1: 'Frank', player2: 'Thomas B.' })).toBeUndefined();
    // Ohne Angabe der Spieler am Tisch: nicht speichern
    expect(spielAbschliessen(zurueck(), '4', 'r1')).toBeUndefined();
    // Laeuft schon an einem anderen Tisch: nicht anfassen
    expect(
      spielAbschliessen(spiel({ status: 'running', table: '2', player1: 'Marcel B.', player2: 'Frank' }), '4', 'r1', {
        player1: 'Marcel B.',
        player2: 'Frank'
      })
    ).toBeUndefined();
  });

  test('Freilos wird nur einmal gewertet', () => {
    expect(freilosAbschliessen(spiel({ player1: 'FREILOS 1' }), 'r2')).toMatchObject({ status: 'completed', resultId: 'r2' });
    expect(freilosAbschliessen(spiel({ status: 'completed' }), 'r2')).toBeUndefined();
    expect(freilosWertung(spiel({ player1: 'FREILOS 1', player2: 'Bruno' }), 5)).toEqual({ spieler: 'Bruno', score1: 0, score2: 5 });
    expect(freilosWertung(spiel({ player1: 'Bruno', player2: 'FREILOS 2' }), 5)).toEqual({ spieler: 'Bruno', score1: 5, score2: 0 });
  });

  test('Tisch wird frei, wenn das Ergebnis schon in CueDesk steht', () => {
    expect(ergebnisSchonEingetragen(spieltag(), 'p4', false)).toBe(true);
    expect(ergebnisSchonEingetragen(spieltag(), 'p3', false)).toBe(false);
    expect(ergebnisSchonEingetragen(spieltag(), 'p4', true)).toBe(false); // Tisch abgegeben
    expect(ergebnisSchonEingetragen({ ...spieltag(), status: 'finished' }, 'p4', false)).toBe(false);
    expect(ergebnisSchonEingetragen(spieltag(), null, false)).toBe(false);
  });
});

describe('Ergebnisse', () => {
  test('Ausspielziel: Tisch, sonst Turnier, im freien Spiel das gesetzte Ziel', () => {
    expect(ausspielziel(true, 7, 5, 3)).toBe(7);
    expect(ausspielziel(true, null, 5, 3)).toBe(5);
    expect(ausspielziel(false, 7, 5, 3)).toBe(3);
    expect(ausspielziel(false, 7, 5, undefined)).toBe(0);
  });

  test('Ziel erreicht', () => {
    expect(zielErreicht(4, 4, 2)).toBe(true);
    expect(zielErreicht(4, 3, 3)).toBe(false);
    expect(zielErreicht(0, 9, 0)).toBe(false); // freies Spiel ohne Ziel
  });

  test('KO: Sieger und Verlierer ins Folgespiel', () => {
    const halbfinale = spiel({ phase: 'ko', winnerTo: { match: 'fin', slot: 1 }, loserTo: { match: 'bro', slot: 2 } });
    expect(koFortschreibung(halbfinale, { player1: 'Sven', player2: 'Kai', score1: 3, score2: 5 })).toEqual({
      'tournament/active/schedule/fin/player1': 'Kai',
      'tournament/active/schedule/fin/status': 'pending',
      'tournament/active/schedule/bro/player2': 'Sven',
      'tournament/active/schedule/bro/status': 'pending'
    });
    expect(koFortschreibung(spiel(), { player1: 'Sven', player2: 'Kai', score1: 5, score2: 3 })).toEqual({});
  });

  test('Text im Bestaetigungsfeld', () => {
    expect(siegerText('Sven', 'Kai', 4, 2, 'pool')).toBe('🏁 Sven gewinnt 4:2');
    expect(siegerText('Sven', 'Kai', 54, 60, '14.1')).toBe('🏁 Kai gewinnt 60:54');
    expect(siegerText('Sven', 'Kai', 40, 40, '14.1')).toBe('🏁 Unentschieden 40:40');
  });
});

describe('Direktlink', () => {
  test('spiel verschwindet, der Tisch bleibt', () => {
    expect(ohneSpielParameter('http://192.168.178.22:5173/scoreboards/14.1_Scoreboard.html?table=2&spiel=abc')).toBe(
      '/scoreboards/14.1_Scoreboard.html?table=2'
    );
    expect(ohneSpielParameter('http://x/scoreboards/Pool_Scoreboard.html?spiel=abc')).toBe('/scoreboards/Pool_Scoreboard.html');
  });
});
