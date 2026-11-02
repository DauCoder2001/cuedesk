import { describe, expect, test } from 'vitest';
import {
  LIGEN,
  aufstellungPruefen,
  drittLage,
  drittWertung,
  entfaelltBeiDritt,
  gesperrteSpieler,
  partnerVon,
  spielplan,
  spieltagStand,
  wertung,
  zeile141,
  zweiteBegegnungIds
} from '../src/liga';
import type { SpieltagTeil } from '../src/liga';

describe('Spielplan einer Begegnung', () => {
  test('acht Partien, Reihenfolge und Ausspielziele der Bezirksliga', () => {
    const spiele = spielplan(LIGEN.bezirksliga.ziele);
    expect(spiele).toHaveLength(8);
    // Hin- und Rueckrunde in derselben Reihenfolge
    expect(spiele.map((s) => s.disziplin)).toEqual([
      '14-1', '8-ball', '9-ball', '10-ball',
      '14-1', '8-ball', '9-ball', '10-ball'
    ]);
    expect(spiele.map((s) => s.runde)).toEqual(['hin', 'hin', 'hin', 'hin', 'rueck', 'rueck', 'rueck', 'rueck']);
    // aus der Ausschreibung: 75 Punkte/25 Aufnahmen, 8-Ball 4, 9-Ball 6, 10-Ball 5
    expect(spiele[0]).toMatchObject({ nr: 1, ziel: 75, aufnahmen: 25 });
    expect(spiele.slice(1, 4).map((s) => s.ziel)).toEqual([4, 6, 5]);
    expect(spiele[5].ziel).toBe(4); // Rueckrunde Partie 6 ist 8-Ball
    expect(spiele[7].ziel).toBe(5); // Partie 8 ist 10-Ball
  });

  test('alte Spieltage behalten die gedrehte Rueckrunde', () => {
    const spiele = spielplan(LIGEN.bezirksliga.ziele, true);
    expect(spiele.map((s) => s.disziplin)).toEqual([
      '14-1', '8-ball', '9-ball', '10-ball',
      '14-1', '10-ball', '9-ball', '8-ball'
    ]);
    expect(spiele[5].ziel).toBe(5);
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

describe('Zu dritt (STO 2.5.5)', () => {
  const ziele = LIGEN.kreisklasse.ziele; // 14.1 auf 40, 10-Ball auf 4
  const sieben = [1, 2, 3, 5, 6, 7, 8].map((nr) => ({ nr, heim: 4, gast: 1 }));

  test('Lage je Runde', () => {
    expect(drittLage(undefined, 'hin')).toBe('keine');
    expect(drittLage({ hin: { gast: true } }, 'hin')).toBe('gast');
    expect(drittLage({ hin: { gast: true } }, 'rueck')).toBe('keine');
    expect(drittLage({ rueck: { heim: true, gast: true } }, 'rueck')).toBe('beide');
  });

  test('nur eine Mannschaft zu dritt: die andere gewinnt kampflos mit Ausspielziel : 0', () => {
    // wie im Spielbericht PBC Bassum 3 gegen BC Dissen 7: Gast zu dritt
    const e = drittWertung(sieben, { hin: { gast: true }, rueck: { gast: true } }, ziele);
    expect(e.find((x) => x.nr === 4)).toEqual({ nr: 4, heim: 4, gast: 0, kampflos: true });
    expect(e.find((x) => x.nr === 5)).toEqual({ nr: 5, heim: 40, gast: 0, kampflos: true });
    expect(wertung(e).partiepunkte).toEqual([8, 0]);
    expect(wertung(e).entschieden).toBe(true);
  });

  test('Heim zu dritt: Punkt fuer den Gast', () => {
    const e = drittWertung([], { hin: { heim: true } }, ziele);
    expect(e).toEqual([{ nr: 4, heim: 0, gast: 4, kampflos: true }]);
  });

  test('beide zu dritt: Partie entfaellt ohne Wertung, auch eine angelegte', () => {
    const e = drittWertung([...sieben, { nr: 4, heim: null, gast: null }], { hin: { heim: true, gast: true } }, ziele);
    const w = wertung(e);
    expect(w.partiepunkte).toEqual([7, 0]); // sieben gewertete Partien, Nr. 4 entfaellt
    expect(w.offen).toBe(0);
    expect(w.entschieden).toBe(true);
  });

  test('ohne Haken bleibt alles, wie es ist', () => {
    expect(drittWertung(sieben, undefined, ziele)).toBe(sieben);
  });
});

describe('14.1-Zeile', () => {
  test('Aufnahmen des Gewinners, GD beider Spieler daraus', () => {
    // Spielbericht: 14 : 34, Aufn. 20, HS 4/9, GD 0,70/1,70
    const z = zeile141(14, 34, { aufnahmen_a: 20, aufnahmen_b: 20, hoechstserie_a: 4, hoechstserie_b: 9 });
    expect(z).toEqual({ aufnahmen: 20, hsHeim: 4, hsGast: 9, gdHeim: '0,70', gdGast: '1,70' });
  });

  test('verschiedene Aufnahmen: die des Gewinners zaehlt', () => {
    expect(zeile141(40, 33, { aufnahmen_a: 18, aufnahmen_b: 17, hoechstserie_a: 12, hoechstserie_b: 9 }).aufnahmen).toBe(18);
    expect(zeile141(30, 40, { aufnahmen_a: 18, aufnahmen_b: 17, hoechstserie_a: 12, hoechstserie_b: 9 }).aufnahmen).toBe(17);
  });

  test('ohne Aufnahmen kein GD', () => {
    expect(zeile141(10, 5, { aufnahmen_a: 0, aufnahmen_b: 0, hoechstserie_a: 0, hoechstserie_b: 0 }).gdHeim).toBe('–');
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
    // Hinrunde: 1 14.1 a, 2 8-Ball b, 3 9-Ball c; Rueckrunde: 8 10-Ball d
    const plan = { 1: 'a', 2: 'b', 3: 'c', 4: null, 5: null, 6: null, 7: null, 8: 'd' };
    // Spiel 4 (10-Ball, Hinrunde): a, b, c schon in der Runde, d hat 10-Ball schon
    expect([...gesperrteSpieler(spiele, plan, 4)].sort()).toEqual(['a', 'b', 'c', 'd']);
    // Spiel 6 (8-Ball, Rueckrunde): d in der Runde, b hat 8-Ball schon
    expect([...gesperrteSpieler(spiele, plan, 6)].sort()).toEqual(['b', 'd']);
    // Der eigene Eintrag sperrt sich nicht selbst
    expect(gesperrteSpieler(spiele, plan, 1).has('a')).toBe(false);
  });

  test('zu zweit ist zu wenig', () => {
    const plan = { 1: 'a', 2: 'b', 3: 'a', 4: 'b', 5: 'a', 6: 'b', 7: 'a', 8: 'b' };
    expect(aufstellungPruefen(spiele, plan, name).some((f) => f.includes('mindestens drei'))).toBe(true);
  });
});

describe('Spieltag aus zwei Begegnungen', () => {
  const teil = (id: string, begegnung: 1 | 2, partner: string | null, status: SpieltagTeil['status'] = 'geplant'): SpieltagTeil => ({
    id,
    status,
    einstellungen: { liga: { begegnung, ...(partner ? { partner } : {}) } }
  });
  const erste = teil('a1', 1, 'a2');
  const zweite = teil('a2', 2, 'a1');
  const turnier: SpieltagTeil = { id: 'vm', status: 'beendet', einstellungen: {} };

  test('die zweite Begegnung bekommt keine eigene Zeile', () => {
    expect([...zweiteBegegnungIds([turnier, erste, zweite])]).toEqual(['a2']);
    expect(partnerVon(erste, [erste, zweite])).toBe(zweite);
    expect(partnerVon(turnier, [turnier, erste])).toBeNull();
  });
  test('ohne erste Begegnung oder mit einseitigem Verweis bleibt die zweite sichtbar', () => {
    expect(zweiteBegegnungIds([zweite]).size).toBe(0);
    expect(zweiteBegegnungIds([teil('a1', 1, null), zweite]).size).toBe(0);
  });
  test('Stand des ganzen Spieltags', () => {
    expect(spieltagStand('geplant', null)).toEqual({ status: 'geplant', teilBeendet: null });
    expect(spieltagStand('geplant', 'geplant')).toEqual({ status: 'geplant', teilBeendet: null });
    expect(spieltagStand('beendet', 'laeuft')).toEqual({ status: 'laeuft', teilBeendet: null });
    expect(spieltagStand('beendet', 'geplant')).toEqual({ status: 'geplant', teilBeendet: 1 });
    expect(spieltagStand('geplant', 'beendet')).toEqual({ status: 'geplant', teilBeendet: 2 });
    expect(spieltagStand('beendet', 'beendet')).toEqual({ status: 'beendet', teilBeendet: null });
    expect(spieltagStand('abgebrochen', 'abgebrochen')).toEqual({ status: 'abgebrochen', teilBeendet: null });
  });
});
