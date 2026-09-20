import { describe, expect, test } from 'vitest';
import { berechnen, GESAMT, minusMonate } from '../src/rating';
import { vorgabe } from '../src/vorgabe';
import type { RatingPartie } from '../src/rating';

// Die Erwartungswerte stammen aus "Das Vereins-Rating erklaert" (v02) und
// damit aus der Serienwertung v15. Weichen die Zahlen ab, stimmt die
// Uebertragung nicht.

const STICHTAG = '2026-06-30';

function serie(anzahl: number, gewonnenA: number, disziplin = '8-ball'): RatingPartie[] {
  // Eine Partie je Rack-Paket, alle am selben Tag.
  return [{ datum: '2026-06-01', disziplin, a: 'A', b: 'B', wa: gewonnenA, wb: anzahl - gewonnenA }];
}

function werte(partien: RatingPartie[]) {
  const ergebnis = berechnen({
    partien,
    startwerte: {},
    stichtag: STICHTAG,
    disziplinen: ['8-ball', '9-ball'],
    einstellungen: { mindestRacks: 100 }
  });
  return ergebnis.ansichten[GESAMT].werte;
}

describe('Rating, Beispiele aus der Dokumentation', () => {
  test('zwei Spieler, zwei Drittel der Racks', () => {
    expect(werte(serie(30, 20)).A.rating).toBe(532);
    expect(werte(serie(30, 20)).B.rating).toBe(468);

    expect(werte(serie(60, 40)).A.rating).toBe(539);
    expect(werte(serie(60, 40)).B.rating).toBe(461);

    expect(werte(serie(120, 80)).A.rating).toBe(544);
    expect(werte(serie(120, 80)).B.rating).toBe(456);

    expect(werte(serie(300, 200)).A.rating).toBe(547);
    expect(werte(serie(300, 200)).B.rating).toBe(453);
  });

  test('alle Racks gewonnen: der Wert steigt mit der Zahl der Belege', () => {
    expect(werte(serie(10, 10)).A.rating).toBe(559);
    expect(werte(serie(20, 20)).A.rating).toBe(589);
    expect(werte(serie(40, 40)).A.rating).toBe(624);
    expect(werte(serie(100, 100)).A.rating).toBe(675);
  });

  test('gleich viele Racks bedeuten Vereinsschnitt', () => {
    const w = werte(serie(40, 20));
    expect(w.A.rating).toBe(500);
    expect(w.B.rating).toBe(500);
  });
});

describe('Kennzeichnung', () => {
  test('unter den Mindest-Racks gilt der Wert als vorlaeufig', () => {
    expect(werte(serie(30, 20)).A.status).toBe('vorlaeufig');
    expect(werte(serie(120, 80)).A.status).toBe('eigene-daten');
  });

  test('ohne eigene Partien gilt der gesetzte Startwert', () => {
    const ergebnis = berechnen({
      partien: [],
      startwerte: { C: 350 },
      stichtag: STICHTAG,
      disziplinen: ['8-ball']
    });
    expect(ergebnis.ansichten[GESAMT].werte.C.rating).toBe(350);
    expect(ergebnis.ansichten[GESAMT].werte.C.status).toBe('startwert');
  });

  test('in einer Disziplin ohne Partien gilt der Wert aus der anderen', () => {
    const ergebnis = berechnen({
      partien: serie(120, 80, '8-ball'),
      startwerte: {},
      stichtag: STICHTAG,
      disziplinen: ['8-ball', '9-ball']
    });
    const neunBall = ergebnis.ansichten['9-ball'].werte.A;
    expect(neunBall.status).toBe('andere-disziplin');
    expect(neunBall.startAus).toEqual(['8-ball']);
    expect(neunBall.rating).toBe(544);
  });

  test('ausgeblendete Spieler fehlen in der Liste, ihre Partien zaehlen weiter', () => {
    const ergebnis = berechnen({
      partien: serie(120, 80),
      startwerte: {},
      stichtag: STICHTAG,
      disziplinen: ['8-ball'],
      ausgeblendet: ['B']
    });
    const werteGesamt = ergebnis.ansichten[GESAMT].werte;
    expect(Object.keys(werteGesamt)).toEqual(['A']);
    expect(werteGesamt.A.rating).toBe(544);
  });
});

describe('Zeitfenster', () => {
  test('Partien aelter als der Zeitraum zaehlen nur beim Rueckgriff', () => {
    const alt: RatingPartie[] = [
      { datum: '2025-01-15', disziplin: '8-ball', a: 'A', b: 'B', wa: 80, wb: 40 }
    ];
    // Zeitraum 12 Monate: die Partie liegt davor, aber im Rueckgriff (36 Monate),
    // und beide Spieler haben sonst nichts. Also wird das Fenster erweitert.
    const mitRueckgriff = berechnen({
      partien: alt,
      startwerte: {},
      stichtag: STICHTAG,
      disziplinen: ['8-ball']
    });
    expect(mitRueckgriff.ansichten[GESAMT].werte.A.rating).toBe(544);

    // Ohne Rueckgriff (Rueckgriff = Zeitraum) faellt sie heraus.
    const ohne = berechnen({
      partien: alt,
      startwerte: {},
      stichtag: STICHTAG,
      disziplinen: ['8-ball'],
      einstellungen: { rueckgriff: 12 }
    });
    expect(ohne.ansichten[GESAMT].werte).toEqual({});
  });

  test('Monatsrechnung begrenzt auf das Monatsende', () => {
    expect(minusMonate('2026-03-31', 1)).toBe('2026-02-28');
    expect(minusMonate('2026-01-15', 13)).toBe('2024-12-15');
  });
});

describe('Vorgabe', () => {
  // Tabelle aus der Dokumentation, Standardeinstellung 75 Prozent.
  const tabelle: [number, number, number][] = [
    [25, 5, 1],
    [50, 5, 1],
    [100, 5, 2],
    [150, 5, 3],
    [200, 5, 3],
    [300, 5, 4],
    [100, 3, 1],
    [100, 7, 3],
    [200, 8, 5],
    [300, 8, 6]
  ];

  test.each(tabelle)('%i Punkte Unterschied, Race to %i ergibt %i Saetze', (diff, race, erwartet) => {
    expect(vorgabe(500 + diff, 500, race)).toBe(erwartet);
  });

  test('gleiche Staerke bedeutet keine Vorgabe', () => {
    expect(vorgabe(500, 500, 5)).toBe(0);
  });
});
