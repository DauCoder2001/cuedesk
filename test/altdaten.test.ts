import { describe, expect, test } from 'vitest';
import { auswerten } from '../src/altdaten-lesen';

// Nachgebauter Datenbestand im Format der Serienwertung v15. Bewusst ohne
// echte Namen, damit im oeffentlichen Repository keine Mitgliederdaten liegen.
const datei = {
  version: 4,
  aliase: { 'b. spieler': 'B Spieler' },
  serien: [
    {
      id: 's1',
      name: 'Liga',
      disziplin: '9-Ball',
      saison: '26/27',
      streicher: 2,
      bonus: 1,
      turniere: [
        {
          id: 't-alt',
          datum: '2026-05-01',
          name: 'Maiturnier',
          disziplin: '8-Ball',
          modus: 'zwei-gruppen',
          teilnehmer: 3,
          ranking: [
            { platz: 1, name: 'A Spieler' },
            { platz: 2, name: 'b. Spieler' },
            { platz: 3, name: 'C Spieler' }
          ]
        },
        {
          id: 't-ohne-partien',
          datum: '2026-06-01',
          name: 'Juniturnier',
          disziplin: '10-Ball',
          modus: 'gruppen-ko',
          teilnehmer: 2,
          ranking: [
            { platz: 1, name: 'C Spieler' },
            { platz: 2, name: 'A Spieler' }
          ]
        }
      ]
    },
    { id: 's-test', name: 'Test', disziplin: '8-Ball', saison: '26/27', turniere: [] }
  ],
  partienArchiv: [
    {
      id: 't-archiv',
      datum: '2026-05-01',
      name: 'Maiturnier',
      disziplin: '8-Ball',
      modus: 'zwei-gruppen',
      serieId: 's1',
      werten: true,
      teilnehmer: ['A Spieler', 'b. Spieler', 'C Spieler'],
      partien: [
        {
          a: 'A Spieler',
          b: 'b. Spieler',
          satzA: 5,
          satzB: 3,
          vorgabeA: 0,
          vorgabeB: 2,
          raceTo: 5,
          phase: 'Gruppe A',
          werten: true,
          grund: ''
        },
        {
          a: 'C Spieler',
          b: 'A Spieler',
          satzA: 2,
          satzB: 5,
          raceTo: 5,
          phase: 'Platzierung',
          werten: false,
          grund: 'Abbruch'
        }
      ]
    }
  ],
  ratingEinstellungen: { zeitraum: 12, mindestRacks: 100, rueckgriff: 36, gewicht: 30 },
  ratingStartwerte: [{ name: 'b. Spieler', wert: 100 }],
  ratingAusgeblendet: ['C Spieler']
};

describe('Altdaten auswerten', () => {
  const ergebnis = auswerten(datei);

  test('die Serie "Test" wird uebersprungen', () => {
    expect(ergebnis.serien.map((s) => s.name)).toEqual(['Liga']);
    expect(ergebnis.serien[0].streicher).toBe(2);
    expect(ergebnis.serien[0].disziplin).toBe('9-ball');
  });

  test('Turnier aus Serie und Archiv wird zusammengefuehrt', () => {
    expect(ergebnis.turniere).toHaveLength(2);
    const mai = ergebnis.turniere.find((t) => t.name === 'Maiturnier')!;
    expect(mai.partien).toHaveLength(2);
    expect(mai.ranking).toHaveLength(3);
    expect(mai.modus).toBe('zwei-gruppen');
    expect(mai.serieAltId).toBe('s1');
  });

  test('Turniere ohne Partien bleiben erhalten', () => {
    const juni = ergebnis.turniere.find((t) => t.name === 'Juniturnier')!;
    expect(juni.partien).toHaveLength(0);
    expect(juni.ranking).toHaveLength(2);
    expect(juni.disziplin).toBe('10-ball');
  });

  test('Aliase werden aufgeloest, auch in Rankings und Startwerten', () => {
    const namen = ergebnis.namen.map((n) => n.name);
    expect(namen).toEqual(['A Spieler', 'B Spieler', 'C Spieler']);
    expect(ergebnis.startwerte[0].name).toBe('B Spieler');
  });

  test('Partien je Spieler werden gezaehlt', () => {
    const a = ergebnis.namen.find((n) => n.name === 'A Spieler')!;
    expect(a.partien).toBe(2);
    expect(a.platzierungen).toBe(2);
  });

  test('Vorgabe, Wertungsschalter und Grund bleiben erhalten', () => {
    const mai = ergebnis.turniere.find((t) => t.name === 'Maiturnier')!;
    expect(mai.partien[0].vorgabeB).toBe(2);
    expect(mai.partien[1].werten).toBe(false);
    expect(mai.partien[1].grund).toBe('Abbruch');
  });

  test('Ausgeblendete Spieler und Einstellungen kommen mit', () => {
    expect(ergebnis.ausgeblendet).toEqual(['C Spieler']);
    expect(ergebnis.einstellungen.mindestRacks).toBe(100);
  });
});
