import { describe, expect, test } from 'vitest';
import { abschnittName, ergebnisVomTablet, fuersTablet, planStatus, tabletSpielplan, tvErgebnis } from '../scoreboards/js/turnier-plan';
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
    expect(plan.p2).toMatchObject({ discipline: '10-Ball', raceTo: 4 });
    // Ohne Angabe gilt die Disziplin des Turniers
    expect(plan.p3.discipline).toBeNull();
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

describe('Welche Partien am Tablet erscheinen', () => {
  const liste = [
    { id: 'a', disziplin: '14-1', runde: 1 },
    { id: 'b', disziplin: '8-ball', runde: 1 },
    { id: 'c', disziplin: '9-ball', runde: 2 }
  ];

  test('14.1 laeuft nicht ueber das Pool-Board', () => {
    expect(fuersTablet(liste).map((p) => p.id)).toEqual(['b', 'c']);
  });

  test('verdeckte Aufstellung bleibt auch am Tisch verdeckt', () => {
    expect(fuersTablet(liste, { hin: { heim: true } }).map((p) => p.id)).toEqual(['c']);
    expect(fuersTablet(liste, { rueck: { gast: true } }).map((p) => p.id)).toEqual(['b']);
    expect(fuersTablet(liste, { hin: { heim: false, gast: false } }).map((p) => p.id)).toEqual(['b', 'c']);
  });

  test('ohne Liga bleibt alles ausser 14.1', () => {
    expect(fuersTablet([{ disziplin: '9-ball', runde: 1 }])).toHaveLength(1);
  });
});

describe('Ergebnis vom Tablet', () => {
  const eintrag = { player1: 'Sven', player2: 'Kai' };

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
