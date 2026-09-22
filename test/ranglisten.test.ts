import { describe, expect, test } from 'vitest';
import { bestenliste141, serienUebersicht, siegquoten, titel } from '../src/ranglisten';
import type { PoolPartie } from '../src/statistik-pool';
import type { StatAufnahme, StatPartie } from '../src/statistik-141';

const mitglieder = new Set(['a', 'b', 'c']);

const partie = (a: string, b: string, ea: number, eb: number, extra: Partial<PoolPartie> = {}): PoolPartie => ({
  id: `${a}${b}${ea}${eb}${Math.random()}`,
  datum: '2026-05-01',
  disziplin: '9-ball',
  status: 'beendet',
  turnier_id: 't1',
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  vorgabe_a: 0,
  vorgabe_b: 0,
  beendet: null,
  ...extra
});

describe('Siegquote', () => {
  const partien = [
    partie('a', 'b', 5, 2),
    partie('a', 'b', 5, 3),
    partie('b', 'a', 5, 1),
    partie('a', 'c', 5, 0),
    partie('b', 'c', 5, 4),
    partie('c', 'a', 2, 5)
  ];

  test('Reihenfolge nach Siegquote, Mindestzahl greift', () => {
    const liste = siegquoten(partien, mitglieder, 3);
    expect(liste.map((z) => z.person)).toEqual(['a', 'b', 'c']);
    expect(liste[0]).toMatchObject({ partien: 5, siege: 4, niederlagen: 1 });
    expect(liste[0].siegquote).toBeCloseTo(0.8);
    // c hat nur 3 Partien, bei Mindestzahl 4 faellt c heraus
    expect(siegquoten(partien, mitglieder, 4).map((z) => z.person)).toEqual(['a', 'b']);
  });

  test('Gaeste, Unentschieden und Abbrueche zaehlen nicht', () => {
    const mit = [
      ...partien,
      partie('a', 'gast', 5, 0),
      partie('a', 'b', 3, 3),
      partie('a', 'b', 5, 1, { status: 'abgebrochen' })
    ];
    const liste = siegquoten(mit, mitglieder, 3);
    expect(liste.find((z) => z.person === 'a')?.partien).toBe(5);
    expect(liste.some((z) => z.person === 'gast')).toBe(false);
  });
});

describe('Titel', () => {
  test('Siege, Podest und Teilnahmen, nur beendete Turniere', () => {
    const liste = titel(
      [
        { turnier_id: 't1', person_id: 'a', endplatz: 1 },
        { turnier_id: 't2', person_id: 'a', endplatz: 3 },
        { turnier_id: 't1', person_id: 'b', endplatz: 2 },
        { turnier_id: 't2', person_id: 'b', endplatz: 1 },
        { turnier_id: 't3', person_id: 'b', endplatz: 1 }, // laeuft noch
        { turnier_id: 't1', person_id: 'gast', endplatz: 4 },
        { turnier_id: 't2', person_id: 'c', endplatz: null }
      ],
      new Set(['t1', 't2']),
      mitglieder
    );
    expect(liste.map((z) => [z.person, z.siege, z.podest, z.teilnahmen])).toEqual([
      ['a', 1, 2, 2],
      ['b', 1, 2, 2]
    ]);
  });
});

describe('Serien-Übersicht', () => {
  test('Platz und Punkte je Serie, beste Platzierung sortiert', () => {
    const turnier = (id: string, datum: string, plaetze: string[]) => ({
      id,
      name: id,
      datum,
      teilnehmer: plaetze.length,
      platzierungen: plaetze.map((spieler, i) => ({ spieler, platz: i + 1 }))
    });
    const uebersicht = serienUebersicht(
      [
        { id: 's1', name: 'Freitag', saison: '26/27', streicher: 0, bonus: 1 },
        { id: 's2', name: 'Montag', saison: '26/27', streicher: 0, bonus: 0 },
        { id: 's3', name: 'Leer', saison: null, streicher: 0, bonus: 0 }
      ],
      {
        s1: [turnier('t1', '2026-01-10', ['a', 'b', 'c']), turnier('t2', '2026-02-10', ['b', 'a', 'c'])],
        s2: [turnier('t3', '2026-03-10', ['c', 'a', 'b'])]
      },
      mitglieder
    );
    // Serien ohne Turniere tauchen nicht auf
    expect(uebersicht.serien.map((s) => s.id)).toEqual(['s1', 's2']);
    // a und b haben in s1 je 6 Punkte (4+2 bzw. 2+4), c ist Erster in s2
    expect(uebersicht.zeilen.find((z) => z.person === 'a')?.plaetze.s1).toMatchObject({ platz: 1, punkte: 6, turniere: 2 });
    expect(uebersicht.zeilen.find((z) => z.person === 'c')?.plaetze.s2).toMatchObject({ platz: 1, punkte: 3 });
    expect(uebersicht.zeilen[0].besterPlatz).toBe(1);
  });
});

describe('Bestenliste 14.1', () => {
  const partie141 = (id: string, a: string, b: string, ea: number, eb: number): StatPartie => ({
    id,
    datum: '2026-05-01',
    status: 'beendet',
    spieler_a: a,
    spieler_b: b,
    ergebnis_a: ea,
    ergebnis_b: eb,
    begonnen: null,
    beendet: null
  });
  const aufnahme = (partie_id: string, lfd_nr: number, spieler: string, baelle: number): StatAufnahme => ({
    partie_id,
    lfd_nr,
    spieler,
    baelle,
    punkte: baelle,
    art: 'serie',
    markierung: '',
    rack_segmente: [baelle],
    zeitpunkt: null
  });

  test('sortiert nach GD, Mindestzahl an Aufnahmen greift', () => {
    const partien = [partie141('p1', 'a', 'b', 60, 30)];
    const aufnahmen = [
      ...Array.from({ length: 6 }, (_, i) => aufnahme('p1', i * 2 + 1, 'a', 10)),
      ...Array.from({ length: 6 }, (_, i) => aufnahme('p1', i * 2 + 2, 'b', 5))
    ];
    const liste = bestenliste141(['a', 'b'], partien, aufnahmen, 6);
    expect(liste.map((z) => z.person)).toEqual(['a', 'b']);
    expect(liste[0]).toMatchObject({ aufnahmen: 6, hs: 10 });
    expect(liste[0].gd).toBeCloseTo(10);
    // mit hoeherer Mindestzahl bleibt niemand uebrig
    expect(bestenliste141(['a', 'b'], partien, aufnahmen, 20)).toEqual([]);
  });
});
