import { describe, expect, test } from 'vitest';
import { rackChance, ratingVerlauf, statistikPool } from '../src/statistik-pool';
import type { PoolPartie } from '../src/statistik-pool';

const namen: Record<string, string> = { ich: 'Ich', a: 'Anna', b: 'Bert' };
const name = (id: string) => namen[id] ?? id;

const partie = (id: string, datum: string, gegner: string, eigene: number, fremde: number, extra: Partial<PoolPartie> = {}): PoolPartie => ({
  id,
  datum,
  disziplin: '9-ball',
  status: 'beendet',
  turnier_id: 't1',
  spieler_a: 'ich',
  spieler_b: gegner,
  ergebnis_a: eigene,
  ergebnis_b: fremde,
  vorgabe_a: 0,
  vorgabe_b: 0,
  beendet: `${datum}T20:00:00Z`,
  ...extra
});

describe('Pool-Statistik', () => {
  const partien = [
    partie('p1', '2026-01-10', 'a', 5, 3),
    partie('p2', '2026-02-10', 'a', 2, 5),
    partie('p3', '2026-03-10', 'b', 5, 1, { disziplin: '8-ball' }),
    // Seiten vertauscht: die Person steht als Spieler B
    partie('p4', '2026-04-10', 'b', 0, 0, { spieler_a: 'b', spieler_b: 'ich', ergebnis_a: 4, ergebnis_b: 5 })
  ];

  test('Bilanz, Reihenfolge und Seitenwechsel', () => {
    const s = statistikPool('ich', partien, name);
    expect(s.gesamt).toMatchObject({ partien: 4, siege: 3, niederlagen: 1, eigene: 17, fremde: 13 });
    expect(s.gesamt.siegquote).toBeCloseTo(0.75);
    expect(s.gesamt.rackquote).toBeCloseTo(17 / 30);
    // neueste zuerst
    expect(s.zeilen.map((z) => z.partie.id)).toEqual(['p4', 'p3', 'p2', 'p1']);
    // in p4 steht die Person auf der zweiten Seite
    expect(s.zeilen[0]).toMatchObject({ gegner: 'b', eigene: 5, fremde: 4, ausgang: 'sieg' });
  });

  test('je Disziplin und je Gegner', () => {
    const s = statistikPool('ich', partien, name);
    expect(s.jeDisziplin.map((d) => [d.disziplin, d.partien])).toEqual([
      ['9-ball', 3],
      ['8-ball', 1]
    ]);
    const gegenA = s.gegner.find((g) => g.gegner === 'a');
    expect(gegenA).toMatchObject({ name: 'Anna', partien: 2, siege: 1, niederlagen: 1, eigene: 7, fremde: 8 });
  });

  test('Vorgabe zaehlt nicht als eigene Leistung, Abbruch zaehlt nicht als Sieg', () => {
    const mitVorgabe = [
      partie('v1', '2026-05-10', 'a', 5, 3, { vorgabe_a: 2 }),
      partie('v2', '2026-05-11', 'a', 3, 3, { status: 'abgebrochen' })
    ];
    const s = statistikPool('ich', mitVorgabe, name);
    expect(s.zeilen[1]).toMatchObject({ eigene: 5, eigeneOhneVorgabe: 3 });
    expect(s.gesamt).toMatchObject({ partien: 2, siege: 1, niederlagen: 0 });
    expect(s.zeilen[0].ausgang).toBe('abgebrochen');
  });

  test('gegen Erwartung: gleich starke Spieler erwarten die Haelfte der Racks', () => {
    expect(rackChance(500, 500)).toBeCloseTo(0.5);
    expect(rackChance(600, 500)).toBeCloseTo(2 / 3);
    const s = statistikPool('ich', [partie('e1', '2026-06-10', 'a', 5, 3)], name, () => 500);
    // 8 Racks gespielt, erwartet 4, geholt 5
    expect(s.gesamt.erwartet).toBeCloseTo(4);
    expect(s.gesamt.gegenErwartung).toBeCloseTo(1);
  });

  test('ohne Ratings bleibt die Erwartung offen', () => {
    const s = statistikPool('ich', partien, name);
    expect(s.gesamt.erwartet).toBeNull();
    expect(s.gesamt.gegenErwartung).toBeNull();
  });
});

describe('Rating-Verlauf', () => {
  test('ein Punkt je Stichtag, spaetere Siege heben den Wert', () => {
    const rp = (datum: string, a: string, b: string, wa: number, wb: number) => ({ datum, disziplin: '9-ball', a, b, wa, wb });
    const partien = [
      rp('2026-01-10', 'ich', 'a', 20, 10),
      rp('2026-02-10', 'ich', 'a', 30, 5),
      rp('2026-03-10', 'ich', 'a', 30, 5)
    ];
    const verlauf = ratingVerlauf('ich', partien, ['2026-03-10', '2026-01-10', '2026-02-10'], '9-ball');
    expect(verlauf.map((v) => v.datum)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(verlauf[0].wert).not.toBeNull();
    expect(verlauf[2].wert as number).toBeGreaterThan(verlauf[0].wert as number);
    expect(verlauf[2].racks).toBe(100);
  });
});
