import { describe, expect, test } from 'vitest';
import { gemesseneMinutenJePartie, kommendePartien, prognose, prognoseText, prognoseZusatz, wirksameTische } from '../src/zeitprognose';

const verein = { minutenJePartie: 35, tische: 3 };
const start = Date.parse('2026-11-09T14:00:00');
const minute = 60000;
const fertig = { standA: 3, standB: 0, vorgabeA: 0, vorgabeB: 0, raceTo: 3 };

describe('Zeitschaetzung mit Vereinswert', () => {
  test('vor dem Start: Partien mal Minuten geteilt durch Tische', () => {
    const p = prognose(kommendePartien(Array(36).fill(3)), null, null, verein);
    expect(p.art).toBe('vor-start');
    expect(prognoseText(p)).toBe('Geschätzte Dauer: ca. 7:00 h');
    expect(prognoseZusatz(p)).toBe('36 Partien, 3 Tische, 35 Min. je Partie bei Race to 3');
  });

  test('anderes Race wird umgerechnet', () => {
    const p = prognose(kommendePartien(Array(3).fill(5)), null, null, { minutenJePartie: 35, tische: 1 });
    expect(p.art === 'vor-start' && Math.round(p.dauer / minute)).toBe(175);
  });

  test('ohne Vereinswert bleibt es bei der alten Regel', () => {
    expect(prognose(kommendePartien([3]), null, null, null).art).toBe('keine');
    expect(prognose([fertig, ...kommendePartien([3])], start, null, null, start + 5 * minute).art).toBe('zu-frueh');
  });

  test('schnell nachgetragene Ergebnisse reissen die Schaetzung nicht aus', () => {
    const partien = [...Array(7).fill(fertig), ...kommendePartien(Array(35).fill(3))];
    const jetzt = start + 3 * minute;
    const p = prognose(partien, start, null, verein, jetzt);
    expect(p.art).toBe('schaetzung');
    if (p.art !== 'schaetzung') return;
    expect(p.nachVerein).toBe(true);
    expect((p.ende - jetzt) / minute).toBeGreaterThan(180);
  });

  test('nach 24 Saetzen und 60 Minuten zaehlt nur das gemessene Tempo', () => {
    const partien = [...Array(8).fill(fertig), ...kommendePartien(Array(4).fill(3))];
    const jetzt = start + 120 * minute;
    const p = prognose(partien, start, null, verein, jetzt);
    expect(p.art).toBe('schaetzung');
    if (p.art !== 'schaetzung') return;
    expect(p.nachVerein).toBe(false);
    expect(prognoseZusatz(p)).toBe('Aus dem bisherigen Tempo');
    // 24 Saetze in 120 Minuten, 4 x 4,8 Saetze offen: 96 Minuten
    expect(Math.round((p.ende - jetzt) / minute)).toBe(96);
  });

  test('mehr Tische als Paare helfen nicht', () => {
    expect(wirksameTische(6, 8)).toBe(4);
    expect(wirksameTische(3, 12)).toBe(3);
    expect(wirksameTische(0, 12)).toBe(0);
  });
});

describe('gemessener Vereinswert', () => {
  const partie = (min: number, a = 3, b = 2) => ({
    begonnen: '2026-11-01T14:00:00Z',
    beendet: new Date(Date.parse('2026-11-01T14:00:00Z') + min * minute).toISOString(),
    ergebnis_a: a,
    ergebnis_b: b,
    vorgabe_a: 0,
    vorgabe_b: 0
  });

  test('zu wenige Partien: kein Vorschlag', () => {
    expect(gemesseneMinutenJePartie(Array(9).fill(partie(30)))).toBeNull();
  });

  test('Minuten je Satz, umgerechnet auf Race to 3', () => {
    // 5 Saetze in 30 Minuten = 6 Min. je Satz, mal 4,8 Saetze
    expect(gemesseneMinutenJePartie(Array(10).fill(partie(30)))).toBe(29);
  });

  test('vergessene Tablets zaehlen nicht', () => {
    expect(gemesseneMinutenJePartie([...Array(10).fill(partie(30)), partie(500)])).toBe(29);
  });
});
