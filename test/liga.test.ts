import { describe, expect, test } from 'vitest';
import { LIGEN, aufstellungPruefen, entfaelltBeiDritt, gesperrteSpieler, spielplan, wertung } from '../src/liga';

describe('Spielplan einer Begegnung', () => {
  test('acht Partien, Reihenfolge und Ausspielziele der Bezirksliga', () => {
    const spiele = spielplan(LIGEN.bezirksliga.ziele);
    expect(spiele).toHaveLength(8);
    // In der Rueckrunde dreht sich die Reihenfolge nach dem 14.1 um
    expect(spiele.map((s) => s.disziplin)).toEqual([
      '14-1', '8-ball', '9-ball', '10-ball',
      '14-1', '10-ball', '9-ball', '8-ball'
    ]);
    expect(spiele.map((s) => s.runde)).toEqual(['hin', 'hin', 'hin', 'hin', 'rueck', 'rueck', 'rueck', 'rueck']);
    // aus der Ausschreibung: 75 Punkte/25 Aufnahmen, 8-Ball 4, 9-Ball 6, 10-Ball 5
    expect(spiele[0]).toMatchObject({ nr: 1, ziel: 75, aufnahmen: 25 });
    expect(spiele.slice(1, 4).map((s) => s.ziel)).toEqual([4, 6, 5]);
    expect(spiele[5].ziel).toBe(5); // Rueckrunde Partie 6 ist 10-Ball
    expect(spiele[7].ziel).toBe(4); // Partie 8 ist 8-Ball
  });

  test('jede Liga hat ihre eigenen Ziele', () => {
    expect(spielplan(LIGEN.kreisklasse.ziele).slice(0, 4).map((s) => s.ziel)).toEqual([40, 4, 4, 4]);
    expect(spielplan(LIGEN.kreisliga.ziele).slice(0, 4).map((s) => s.ziel)).toEqual([50, 4, 5, 4]);
    expect(spielplan(LIGEN.landesliga.ziele).slice(0, 4).map((s) => s.ziel)).toEqual([85, 5, 6, 5]);
  });

  test('zu dritt entfallen Partie 4 und 5', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter(entfaelltBeiDritt)).toEqual([4, 5]);
  });
});

describe('Wertung', () => {
  // Spielbericht GVO Oldenburg 4 gegen GVO Oldenburg 5 vom 20.09.2026
  const echt = [
    { nr: 1, heim: 38, gast: 27 }, // 14.1, Punkte
    { nr: 2, heim: 4, gast: 1 },
    { nr: 3, heim: 6, gast: 3 },
    { nr: 4, heim: 1, gast: 5 },
    { nr: 5, heim: 47, gast: 75 },
    { nr: 6, heim: 4, gast: 2 },
    { nr: 7, heim: 1, gast: 6 },
    { nr: 8, heim: 5, gast: 2 }
  ];

  test('Partie- und Matchpunkte wie im echten Spielbericht (5:3, Heimsieg)', () => {
    const w = wertung(echt);
    expect(w.partiepunkte).toEqual([5, 3]);
    expect(w.matchpunkte).toEqual([3, 0]);
    expect(w.entschieden).toBe(true);
  });

  test('4:4 gibt je einen Matchpunkt', () => {
    // aus dem echten 5:3 wird ein 4:4, wenn Partie 1 an den Gast geht
    const halb = echt.map((e) => (e.nr === 1 ? { ...e, heim: e.gast, gast: e.heim } : e));
    expect(wertung(halb).partiepunkte).toEqual([4, 4]);
    expect(wertung(halb).matchpunkte).toEqual([1, 1]);
  });

  test('offene und gestrichene Partien', () => {
    const offen = [...echt.slice(0, 6), { nr: 7, heim: null, gast: null }, { nr: 8, heim: null, gast: null }];
    expect(wertung(offen)).toMatchObject({ partiepunkte: [4, 2], offen: 2, entschieden: false });
    const gestrichen = echt.map((e) => (e.nr === 4 ? { ...e, gewertet: false } : e));
    expect(wertung(gestrichen).partiepunkte).toEqual([5, 2]);
  });
});

describe('Aufstellung', () => {
  const spiele = spielplan(LIGEN.kreisliga.ziele);
  const name = (id: string) => id;

  test('gültige Aufstellung mit vier Spielern', () => {
    const plan = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'b', 6: 'a', 7: 'd', 8: 'c' };
    expect(aufstellungPruefen(spiele, plan, name)).toEqual([]);
  });

  test('doppelter Einsatz in einer Runde wird gemeldet', () => {
    const plan = { 1: 'a', 2: 'a', 3: 'c', 4: 'd', 5: 'b', 6: 'c', 7: 'd', 8: 'a' };
    expect(aufstellungPruefen(spiele, plan, name)[0]).toContain('Hinrunde 2 mal');
  });

  test('zweimal dieselbe Disziplin wird gemeldet', () => {
    const plan = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'a', 6: 'b', 7: 'd', 8: 'c' };
    const fehler = aufstellungPruefen(spiele, plan, name);
    expect(fehler.some((f) => f.includes('dieselbe Disziplin'))).toBe(true);
  });

  test('Auswahl sperrt Spieler derselben Runde und derselben Disziplin', () => {
    // Hinrunde: 1 14.1 a, 2 8-Ball b, 3 9-Ball c; Rueckrunde: 6 10-Ball d
    const plan = { 1: 'a', 2: 'b', 3: 'c', 4: null, 5: null, 6: 'd', 7: null, 8: null };
    // Spiel 4 (10-Ball, Hinrunde): a, b, c schon in der Runde, d hat 10-Ball schon
    expect([...gesperrteSpieler(spiele, plan, 4)].sort()).toEqual(['a', 'b', 'c', 'd']);
    // Spiel 8 (8-Ball, Rueckrunde): d in der Runde, b hat 8-Ball schon
    expect([...gesperrteSpieler(spiele, plan, 8)].sort()).toEqual(['b', 'd']);
    // Der eigene Eintrag sperrt sich nicht selbst
    expect(gesperrteSpieler(spiele, plan, 1).has('a')).toBe(false);
  });

  test('zu zweit ist zu wenig', () => {
    const plan = { 1: 'a', 2: 'b', 3: 'a', 4: 'b', 5: 'a', 6: 'b', 7: 'a', 8: 'b' };
    expect(aufstellungPruefen(spiele, plan, name).some((f) => f.includes('mindestens drei'))).toBe(true);
  });
});
