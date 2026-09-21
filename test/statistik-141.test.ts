import { describe, expect, test } from 'vitest';
import { gleitend, serienKlasse, statistik141 } from '../src/statistik-141';
import type { StatAufnahme, StatPartie } from '../src/statistik-141';

const namen = (id: string) => ({ ich: 'Ich', kai: 'Kai', sven: 'Sven' })[id] ?? '?';

const partie = (id: string, beendet: string, gegner: string, a: number, b: number, status: StatPartie['status'] = 'beendet'): StatPartie => ({
  id,
  datum: beendet.slice(0, 10),
  status,
  spieler_a: 'ich',
  spieler_b: gegner,
  ergebnis_a: a,
  ergebnis_b: b,
  begonnen: `${beendet.slice(0, 10)}T18:00:00Z`,
  beendet
});

const z = (partie_id: string, lfd_nr: number, spieler: string, baelle: number, punkte: number, art: StatAufnahme['art'], extra: Partial<StatAufnahme> = {}): StatAufnahme => ({
  partie_id,
  lfd_nr,
  spieler,
  baelle,
  punkte,
  art,
  markierung: '',
  rack_segmente: [baelle],
  zeitpunkt: null,
  ...extra
});

// Partie 1 (Sieg gegen Kai, 20:10) und Partie 2 (Niederlage gegen Sven, 5:30)
const partien = [partie('p2', '2026-09-14T20:00:00Z', 'sven', 5, 30), partie('p1', '2026-09-07T20:00:00Z', 'kai', 20, 10)];
const aufnahmen: StatAufnahme[] = [
  z('p1', 1, 'ich', 0, -2, 'eroeffnungsfoul', { markierung: '-2', zeitpunkt: '2026-09-07T18:01:00Z' }),
  z('p1', 2, 'kai', 10, 10, 'serie', { zeitpunkt: '2026-09-07T18:03:00Z' }),
  z('p1', 3, 'ich', 16, 16, 'sicherheit', { rack_segmente: [14, 2], zeitpunkt: '2026-09-07T18:06:00Z' }),
  z('p1', 4, 'kai', 0, 0, 'sicherheit'),
  z('p1', 5, 'ich', 6, 6, 'ende'),
  z('p2', 1, 'ich', 3, 2, 'foul', { markierung: '/' }),
  z('p2', 2, 'sven', 30, 30, 'ende'),
  z('p2', 3, 'ich', 0, -1, 'foul', { markierung: '//' }),
  z('p2', 4, 'ich', 5, 5, 'serie'),
  z('p2', 5, 'ich', 1, -15, 'foul3', { markierung: '3F' })
];

describe('14.1-Statistik', () => {
  const s = statistik141('ich', partien, aufnahmen, namen);

  test('Aufnahmen, Punkte und GD nur aus eigenen Zeilen', () => {
    expect(s.aufnahmen).toBe(7);
    expect(s.punkte).toBe(-2 + 16 + 6 + 2 - 1 + 5 - 15);
    expect(s.gd).toBeCloseTo(11 / 7);
  });

  test('Hoechstserie mit Partie und Gegner', () => {
    expect(s.hs.wert).toBe(16);
    expect(s.hs.gegner).toBe('Kai');
    expect(s.hs.partie?.id).toBe('p1');
  });

  test('Serienverteilung und Durchschnitt nach Baellen', () => {
    expect(s.verteilung).toEqual([2, 2, 2, 0, 1, 0]);
    expect(s.durchschnittSerie).toBeCloseTo((16 + 6 + 3 + 5 + 1) / 5);
    expect(s.nullQuote).toBeCloseTo(2 / 7);
  });

  test('Quoten und Fouls', () => {
    expect(s.sicherheitQuote).toBeCloseTo(1 / 7);
    expect(s.verschossenQuote).toBeCloseTo(1 / 7);
    expect(s.foulsJe10).toBeCloseTo(40 / 7);
    expect(s.zweiteFouls).toBe(1);
    expect(s.dreiFouls).toBe(1);
    expect(s.eroeffnungsfouls).toBe(1);
    expect(s.rackUebergaenge).toBe(1);
  });

  test('Tempo: Abstand zum vorherigen Eintrag, erste Aufnahme ab Spielbeginn', () => {
    // 18:00 -> 18:01 (60 s) und 18:03 -> 18:06 (180 s)
    expect(s.sekundenJeAufnahme).toBe(120);
  });

  test('Bilanz und Reihenfolge je Partie', () => {
    expect(s.bilanz).toEqual({ siege: 1, niederlagen: 1, unentschieden: 0 });
    expect(s.jePartie.map((p) => p.partie.id)).toEqual(['p1', 'p2']);
    expect(s.jePartie[0].gd).toBeCloseTo(20 / 3);
    expect(s.jePartie[1].foulquote).toBeCloseTo(30 / 4);
  });

  test('abgebrochene Partie zaehlt nicht in der Bilanz', () => {
    const t = statistik141('ich', [partie('p9', '2026-09-20T20:00:00Z', 'kai', 3, 1, 'abgebrochen')], [], namen);
    expect(t.bilanz).toEqual({ siege: 0, niederlagen: 0, unentschieden: 0 });
    expect(t.jePartie[0].ausgang).toBe('abgebrochen');
    expect(t.gd).toBeNull();
  });

  test('Unentschieden beim Aufnahmen-Limit', () => {
    const t = statistik141('ich', [partie('p8', '2026-09-20T20:00:00Z', 'kai', 12, 12)], [], namen);
    expect(t.bilanz.unentschieden).toBe(1);
  });
});

describe('Hilfen', () => {
  test('Serienklassen', () => {
    expect([0, 1, 4, 5, 9, 10, 14, 15, 29, 30, 99].map(serienKlasse)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  test('gleitender Durchschnitt ueberspringt Luecken', () => {
    expect(gleitend([2, 4, null, 6], 2)).toEqual([2, 3, 4, 6]);
  });
});
