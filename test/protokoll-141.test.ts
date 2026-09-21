import { describe, expect, test } from 'vitest';
import { aufnahmenAusProtokoll, protokollAusAufnahmen } from '../scoreboards/js/protokoll-141';
import type { LogEintrag } from '../scoreboards/js/protokoll-141';

// Protokoll, wie es das 14.1-Scoreboard in state.log schreibt.
const log: LogEintrag[] = [
  { t: 'inn', p: 1, balls: 0, pkt: -2, total: -2, mark: '-2', kind: 'break', segs: [0], z: 1000 },
  { t: 'inn', p: 2, balls: 14, pkt: 14, total: 14, mark: '', kind: 'safety', segs: [14, 0], z: 2000 },
  { t: 'rack', rackNo: 2, p: 2 },
  { t: 'inn', p: 1, balls: 6, pkt: 6, total: 4, mark: '', kind: 'run', segs: [6] },
  { t: 'inn', p: 2, balls: 3, pkt: 2, total: 16, mark: '/', kind: 'foul', segs: [3] },
  { t: 'inn', p: 1, balls: 1, pkt: -15, total: -11, mark: '3F', kind: 'foul3', segs: [1] },
  { t: 'inn', p: 2, balls: 44, pkt: 44, total: 60, mark: '', kind: 'end', segs: [14, 14, 14, 2] }
];

describe('Protokoll in Aufnahmen umrechnen', () => {
  const zeilen = aufnahmenAusProtokoll(log, 'rot', 'blau');

  test('jede Aufnahme wird eine Zeile, Rack-Trennzeilen nicht', () => {
    expect(zeilen).toHaveLength(6);
    expect(zeilen.map((z) => z.lfd_nr)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('Seite wird zur Person', () => {
    expect(zeilen.map((z) => z.spieler)).toEqual(['rot', 'blau', 'rot', 'blau', 'rot', 'blau']);
  });

  test('Arten werden uebersetzt', () => {
    expect(zeilen.map((z) => z.art)).toEqual([
      'eroeffnungsfoul',
      'sicherheit',
      'serie',
      'foul',
      'foul3',
      'ende'
    ]);
    expect(zeilen.map((z) => z.markierung)).toEqual(['-2', '', '', '/', '3F', '']);
  });

  test('die Rack-Nummer folgt den Trennzeilen', () => {
    expect(zeilen.map((z) => z.rack_nr)).toEqual([1, 1, 2, 2, 2, 2]);
  });

  test('Punkte, Baelle, Stand und Segmente bleiben erhalten', () => {
    expect(zeilen[5]).toMatchObject({ baelle: 44, punkte: 44, gesamt: 60, rack_segmente: [14, 14, 14, 2] });
    expect(zeilen[4]).toMatchObject({ punkte: -15, gesamt: -11 });
  });

  test('Zeitpunkt nur, wenn das Scoreboard ihn erfasst hat', () => {
    expect(zeilen[0].zeitpunkt).toBe(new Date(1000).toISOString());
    expect(zeilen[2].zeitpunkt).toBeNull();
  });

  test('leeres oder fehlendes Protokoll ergibt keine Zeilen', () => {
    expect(aufnahmenAusProtokoll([], 'a', 'b')).toEqual([]);
    expect(aufnahmenAusProtokoll(undefined as unknown as LogEintrag[], 'a', 'b')).toEqual([]);
  });
});

describe('Aufnahmen zurueck ins Protokoll (Ansicht gespeicherter Partien)', () => {
  test('Hin- und Rueckweg ergeben dasselbe Protokoll', () => {
    const zeilen = aufnahmenAusProtokoll(log, 'rot', 'blau');
    const zurueck = protokollAusAufnahmen([...zeilen].reverse(), 'rot');
    // Rack-Trennzeilen tragen im Original den Spieler, die Ansicht braucht ihn nicht.
    // Fehlende Segmente werden beim Speichern zu [balls].
    const erwartet = log.map((e) =>
      e.t === 'rack' ? { t: 'rack', rackNo: e.rackNo } : { ...e, segs: e.segs ?? [e.balls] }
    );
    expect(zurueck).toEqual(erwartet);
  });
});
