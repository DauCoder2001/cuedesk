import { describe, expect, test } from 'vitest';
import {
  abschnittName,
  begegnungKennung,
  dieselbenSpieler,
  ergebnisVomTablet,
  fuersTablet,
  laufendeBegegnungen,
  laufendeTische,
  listenRang,
  naechsteSpiele,
  ohneZusatz,
  planStatus,
  rundeGestartet,
  spieltagSchluessel,
  tabletSpielplan,
  tvErgebnis
} from '../scoreboards/js/turnier-plan';
import type { PlanPartie } from '../scoreboards/js/turnier-plan';

const namen: Record<string, string> = { s: 'Sven', k: 'Kai', o: 'Olli', g: 'Gerd' };
const partie = (id: string, a: string, b: string, extra: Partial<PlanPartie> = {}): PlanPartie => ({
  id,
  spieler_a: a,
  spieler_b: b,
  race_to: 5,
  vorgabe_a: 0,
  vorgabe_b: 0,
  status: 'geplant',
  tisch_id: null,
  runde: 1,
  begonnen: null,
  ...extra
});

describe('Spielplan fuer das Tablet', () => {
  test('Status: beendet, am Tisch, offen', () => {
    expect(planStatus({ status: 'beendet', tisch_id: 't1' })).toBe('completed');
    expect(planStatus({ status: 'laeuft', tisch_id: 't1' })).toBe('running');
    expect(planStatus({ status: 'laeuft', tisch_id: null })).toBe('pending');
    expect(planStatus({ status: 'geplant', tisch_id: null })).toBe('pending');
  });

  test('Eintraege mit Namen, Tischnummer, Vorgabe und Reihenfolge', () => {
    const plan = tabletSpielplan(
      [
        partie('p1', 's', 'k', { vorgabe_b: 2 }),
        partie('p2', 'o', 'g', { tisch_id: 't2', status: 'laeuft', begonnen: '2026-09-22T18:00:00Z', runde: 2 })
      ],
      (id) => namen[id],
      (id) => (id === 't2' ? '2' : null)
    );
    expect(Object.keys(plan)).toEqual(['p1', 'p2']);
    expect(plan.p1).toMatchObject({ player1: 'Sven', player2: 'Kai', status: 'pending', vorgabe1: 0, vorgabe2: 2, group: 'Runde 1' });
    expect(plan.p2).toMatchObject({ status: 'running', table: '2', startedAt: Date.parse('2026-09-22T18:00:00Z') });
  });

  test('Disziplin der Partie steht am Spiel (Liga-Spieltag)', () => {
    const plan = tabletSpielplan(
      [
        partie('p1', 's', 'k', { disziplin: '9-ball' }),
        partie('p2', 'o', 'g', { disziplin: '10-ball', race_to: 4 }),
        partie('p3', 's', 'g')
      ],
      (id) => namen[id],
      () => null
    );
    expect(plan.p1.discipline).toBe('9-Ball');
    expect(plan.p1.innings).toBeNull();
    expect(plan.p2).toMatchObject({ discipline: '10-Ball', raceTo: 4 });
    // Ohne Angabe gilt die Disziplin des Turniers
    expect(plan.p3.discipline).toBeNull();
  });

  test('14.1 bekommt Punkteziel und Aufnahmen-Limit', () => {
    const plan = tabletSpielplan(
      [partie('p1', 's', 'k', { disziplin: '14-1', race_to: 50 }), partie('p2', 'o', 'g', { disziplin: '8-ball' })],
      (id) => namen[id],
      () => null,
      20
    );
    expect(plan.p1).toMatchObject({ discipline: '14.1', raceTo: 50, innings: 20 });
    expect(plan.p2.innings).toBeNull();
  });
});

test('Beschriftung mit Gruppe und Platzierungsrunde', () => {
  expect(abschnittName({ runde: 2, gruppe: 'B', phase: 'gruppe' })).toBe('Gruppe B · Runde 2');
  expect(abschnittName({ runde: null, gruppe: null, phase: 'phase2' })).toBe('Platzierungsduelle');
  expect(abschnittName({ runde: 3 })).toBe('Runde 3');
  expect(abschnittName({ runde: 2, gruppe: 'qf3', phase: 'ko' })).toBe('Viertelfinale 3');
  expect(abschnittName({ runde: 4, gruppe: 'bro', phase: 'ko' })).toBe('Spiel um Platz 3');
  expect(abschnittName({ runde: null, gruppe: null, phase: 'phase3' })).toBe('Platzierungsspiele');
});

describe('Namen am Tisch', () => {
  test('Vereinszusatz in Klammern faellt weg', () => {
    expect(ohneZusatz('Matthias H. (Bassum)')).toBe('Matthias H.');
    expect(ohneZusatz('Kai')).toBe('Kai');
    expect(ohneZusatz('(Bassum)')).toBe('(Bassum)'); // ein leerer Name waere schlechter
  });

  test('der Zusatz bleibt, wenn beide sonst gleich heissen', () => {
    const plan = tabletSpielplan(
      [partie('p1', 'x', 'y'), partie('p2', 'x', 'z')],
      (id) => ({ x: 'Matthias H.', y: 'Matthias H. (Bassum)', z: 'Kai (Bassum)' })[id],
      () => null
    );
    expect(plan.p1).toMatchObject({ player1: 'Matthias H.', player2: 'Matthias H. (Bassum)' });
    expect(plan.p2).toMatchObject({ player1: 'Matthias H.', player2: 'Kai' });
  });
});

describe('Welche Partien am Tablet erscheinen', () => {
  const liste = [
    { id: 'a', disziplin: '14-1', runde: 1 },
    { id: 'b', disziplin: '8-ball', runde: 1 },
    { id: 'c', disziplin: '9-ball', runde: 2 }
  ];

  test('ohne verdeckte Aufstellung bleibt alles stehen', () => {
    expect(fuersTablet(liste).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('verdeckte Aufstellung bleibt auch am Tisch verdeckt', () => {
    expect(fuersTablet(liste, { hin: { heim: true } }).map((p) => p.id)).toEqual(['c']);
    expect(fuersTablet(liste, { rueck: { gast: true } }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(fuersTablet(liste, { hin: { heim: false, gast: false } }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('nur gestartete Runden; alte Spieltage ohne Eintrag zeigen alles', () => {
    expect(fuersTablet(liste, undefined, { hin: true }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(fuersTablet(liste, undefined, { hin: true, rueck: true }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(fuersTablet(liste, undefined, {}).map((p) => p.id)).toEqual([]);
    expect(fuersTablet(liste, { hin: { heim: true } }, { hin: true }).map((p) => p.id)).toEqual([]);
    expect(rundeGestartet(undefined, 2)).toBe(true);
    expect(rundeGestartet({ hin: true }, 2)).toBe(false);
  });
});

describe('Ergebnis vom Tablet', () => {
  const eintrag = { player1: 'Sven', player2: 'Kai' };

  test('Seitenwechsel auch bei altem Namen mit Vereinszusatz erkannt', () => {
    expect(
      ergebnisVomTablet(
        { player1: 'Bruno', player2: 'Matthias H.' },
        { player1: 'Matthias H. (Bassum)', player2: 'Bruno', score1: 60, score2: 41 }
      )
    ).toEqual({ ergebnis_a: 41, ergebnis_b: 60 });
  });

  test('gleiche Seiten', () => {
    expect(ergebnisVomTablet(eintrag, { player1: 'Sven', player2: 'Kai', score1: 5, score2: 3 })).toEqual({
      ergebnis_a: 5,
      ergebnis_b: 3
    });
  });

  test('nach Seitenwechsel wird zurueckgetauscht', () => {
    expect(ergebnisVomTablet(eintrag, { player1: 'Kai', player2: 'Sven', score1: 3, score2: 5 })).toEqual({
      ergebnis_a: 5,
      ergebnis_b: 3
    });
  });
});

describe('Ergebnis fuer den Fernseher', () => {
  test('Rangliste nach v57-Regeln mit Siegen, Niederlagen und Saetzen', () => {
    const partie = (a: string, b: string, ea: number, eb: number) => ({
      spieler_a: a, spieler_b: b, vorgabe_a: 0, vorgabe_b: 0, ergebnis_a: ea, ergebnis_b: eb
    });
    const e = tvErgebnis(
      { name: 'Test', disziplin: '9-Ball', raceTo: 3, datum: '2026-10-10' },
      ['s', 'k', 'o'].map((id) => ({ id, gruppe: null, endplatz: null })),
      [partie('s', 'k', 3, 1), partie('k', 'o', 3, 2), partie('s', 'o', 1, 3)],
      {},
      (id) => namen[id]
    );
    // alle je 1 Sieg; Satzdifferenz: Sven +2-2=0, Kai -2+1=-1, Olli -1+2=+1
    expect(e.groups[1].map((z) => z.name)).toEqual(['Olli', 'Sven', 'Kai']);
    expect(e.groups[1][0]).toMatchObject({ games: 2, wins: 1, losses: 1, plus: 5, minus: 4 });
    expect(e.finalPlacement).toBeUndefined();
  });

  test('Gruppen: je Gruppe eine Tabelle nur aus Gruppenspielen, nach dem Abschluss die Endplaetze', () => {
    const partie = (a: string, b: string, ea: number, eb: number, phase = 'gruppe') => ({
      spieler_a: a, spieler_b: b, vorgabe_a: 0, vorgabe_b: 0, ergebnis_a: ea, ergebnis_b: eb, phase
    });
    const teilnehmer = [
      { id: 's', gruppe: 'A', endplatz: 2 },
      { id: 'k', gruppe: 'A', endplatz: 3 },
      { id: 'o', gruppe: 'B', endplatz: 1 },
      { id: 'g', gruppe: 'B', endplatz: 4 }
    ];
    const partien = [partie('s', 'k', 3, 1), partie('o', 'g', 0, 3), partie('s', 'o', 1, 3, 'phase2')];
    const laufend = tvErgebnis({ name: 'T', disziplin: '9-Ball', raceTo: 3, datum: '2026-10-10' }, teilnehmer, partien, {}, (id) => namen[id]);
    expect(Object.keys(laufend.groups)).toEqual(['A', 'B']);
    expect(laufend.groups.A.map((z) => z.name)).toEqual(['Sven', 'Kai']);
    expect(laufend.groups.B.map((z) => z.name)).toEqual(['Gerd', 'Olli']);
    expect(laufend.groups.A[0].games).toBe(1); // die Duelle zaehlen nicht mit
    expect(laufend.finalPlacement).toBeUndefined();
    const fertig = tvErgebnis({ name: 'T', disziplin: '9-Ball', raceTo: 3, datum: '2026-10-10', beendet: true }, teilnehmer, partien, {}, (id) => namen[id]);
    expect(fertig.finalPlacement?.map((x) => x.name)).toEqual(['Olli', 'Sven', 'Kai', 'Gerd']);
  });
});

describe('Dieselben Spieler', () => {
  test('Seiten und Vereinszusatz sind egal', () => {
    expect(dieselbenSpieler({ player1: 'Marcel B. (Bassum)', player2: 'Frank' }, { player1: 'Frank', player2: 'Marcel B.' })).toBe(true);
  });
  test('anderer Spieler oder fehlender Name', () => {
    expect(dieselbenSpieler({ player1: 'Marcel B.', player2: 'Frank' }, { player1: 'Frank', player2: 'Thomas B.' })).toBe(false);
    expect(dieselbenSpieler({ player1: 'Marcel B.', player2: null }, { player1: 'Marcel B.', player2: '' })).toBe(false);
  });
});

describe('mehrere Liga-Begegnungen zugleich an den Tablets', () => {
  const liga = (id: string, status: string, l: Record<string, unknown>) => ({
    id,
    status,
    modus: 'liga',
    einstellungen: { liga: l }
  });
  const erste = liga('t1', 'laeuft', { begegnung: 1, partner: 't2', doppel: 'td' });
  const doppel = liga('td', 'laeuft', { art: 'doppel', haupt: 't1' });
  const zweite = liga('t2', 'laeuft', { begegnung: 2, partner: 't1' });
  const fremd = liga('x1', 'laeuft', { begegnung: 1, partner: 'x2' });
  const serie = { id: 's1', status: 'laeuft', modus: 'serie', einstellungen: {} };

  test('alle gestarteten Begegnungen desselben Spieltags, in der Reihenfolge 1., Doppel, 2.', () => {
    expect(laufendeBegegnungen([zweite, fremd, doppel, erste, serie], zweite).map((t) => t.id)).toEqual(['t1', 'td', 't2']);
  });

  test('nicht gestartete und beendete Begegnungen bleiben draussen', () => {
    const geplant = { ...zweite, status: 'geplant' };
    const beendet = { ...doppel, status: 'beendet' };
    expect(laufendeBegegnungen([erste, geplant, beendet], erste).map((t) => t.id)).toEqual(['t1']);
  });

  test('kein Liga-Spieltag: nur das Turnier selbst', () => {
    expect(laufendeBegegnungen([serie, erste], serie).map((t) => t.id)).toEqual(['s1']);
  });

  test('Name und Reihenfolge der Begegnung', () => {
    expect(begegnungKennung(erste)).toEqual({ name: '1. Begegnung', nr: 1 });
    expect(begegnungKennung(doppel)).toEqual({ name: 'Doppel', nr: 2 });
    expect(begegnungKennung(zweite)).toEqual({ name: '2. Begegnung', nr: 3 });
    expect(spieltagSchluessel(zweite)).toBe('t1');
    expect(spieltagSchluessel(serie)).toBeNull();
  });
});

describe('Naechste Spiele am Fernseher', () => {
  const partie = (id: string, a: string, b: string, runde: number, gruppe: string, status: PlanPartie['status'] = 'geplant', tisch: string | null = null): PlanPartie => ({
    id, spieler_a: a, spieler_b: b, race_to: 3, vorgabe_a: 0, vorgabe_b: 0, status, tisch_id: tisch, runde, begonnen: null, gruppe, phase: 'gruppe', disziplin: '9-ball'
  });
  const namen: Record<string, string> = { a: 'Anna', b: 'Bert', c: 'Carl', d: 'Dora', e: 'Emil', f: 'Fritz', g: 'Gina', h: 'Hugo' };
  const plan = tabletSpielplan(
    [
      partie('a1', 'a', 'b', 1, 'A', 'beendet'),
      partie('a2', 'c', 'd', 1, 'A'),
      partie('b1', 'e', 'f', 1, 'B', 'laeuft', 't1'),
      partie('b2', 'g', 'h', 1, 'B'),
      partie('a3', 'a', 'c', 2, 'A'),
      partie('a4', 'b', 'd', 2, 'A'),
      partie('b3', 'e', 'g', 2, 'B'),
      partie('b4', 'f', 'h', 2, 'B')
    ],
    (id) => namen[id],
    (id) => (id === 't1' ? '1' : null)
  );

  test('offene Spiele in der Reihenfolge der Spielplan-Liste, hoechstens die gewuenschte Zahl', () => {
    expect(naechsteSpiele(plan, 6).map((s) => s.id)).toEqual(['a2', 'b2', 'a3', 'a4', 'b3', 'b4']);
    expect(naechsteSpiele(plan, 2).map((s) => s.id)).toEqual(['a2', 'b2']);
  });

  test('wer gerade an einem anderen Tisch spielt, wird je Seite genannt', () => {
    const b3 = naechsteSpiele(plan, 6).find((s) => s.id === 'b3');
    expect(b3?.belegt).toEqual([{ name: 'Emil', tisch: '1' }]);
    const b4 = naechsteSpiele(plan, 6).find((s) => s.id === 'b4');
    expect(b4?.belegt).toEqual([{ name: 'Fritz', tisch: '1' }]);
    expect(naechsteSpiele(plan, 6).find((s) => s.id === 'a2')?.belegt).toEqual([]);
  });

  test('laufende Tische und Rang der Phasen', () => {
    expect(laufendeTische(plan).map((e) => e.player1)).toEqual(['Emil']);
    expect(listenRang({ runde: 2, gruppe: 'B', phase: 'gruppe' }) < listenRang({ runde: 3, gruppe: 'A', phase: 'gruppe' })).toBe(true);
    expect(listenRang({ runde: 7, gruppe: 'A', phase: 'gruppe' }) < listenRang({ runde: 1, gruppe: null, phase: 'phase2' })).toBe(true);
    expect(naechsteSpiele(null, 6)).toEqual([]);
  });
});
