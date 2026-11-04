import { describe, expect, test } from 'vitest';
import {
  andereKader,
  einsaetze,
  einsatzHinweise,
  ersatzspieler,
  ersatzZeile,
  mitErsatzZeile,
  festgespielt,
  istErsatz,
  kaderGesperrt,
  kaderHinweise,
  stammWechsel,
  saisonAus,
  saisonBilanz,
  saisonListe,
  berechtigtAb,
  stammspielerHinweis,
  wochenende
} from '../src/mannschaften';
import type { KaderEintrag, MannschaftKurz } from '../src/mannschaften';

// Aufbau wie im Mannschaftspass: erste Mannschaft, zweite und dritte.
const mannschaften: MannschaftKurz[] = [
  { id: 'm1', name: 'Erste', rang: 1 },
  { id: 'm2', name: 'Zweite', rang: 2 },
  { id: 'm3', name: 'Dritte', rang: 3 }
];

const kader: KaderEintrag[] = [
  { mannschaft_id: 'm1', person_id: 'a', stammspieler: true },
  { mannschaft_id: 'm2', person_id: 'b', stammspieler: true },
  { mannschaft_id: 'm3', person_id: 'c', stammspieler: true },
  { mannschaft_id: 'm3', person_id: 'd', stammspieler: false }
];

const name = (id: string) => id.toUpperCase();

describe('Andere Kader', () => {
  const mehr: KaderEintrag[] = [
    ...kader,
    { mannschaft_id: 'm2', person_id: 'c', stammspieler: false },
    { mannschaft_id: 'm2', person_id: 'd', stammspieler: false },
    { mannschaft_id: 'm1', person_id: 'd', stammspieler: false },
    { mannschaft_id: 'm3', person_id: 'a', stammspieler: false }
  ];
  const zusatz = (person: string, m: MannschaftKurz) => andereKader({ person, mannschaft: m, kader: mehr, mannschaften });

  test('nur in einem Kader: kein Zusatz', () => {
    expect(zusatz('b', mannschaften[1])).toBeNull();
  });

  test('aushelfen nach oben: Hinweis mit Stammmannschaft', () => {
    expect(zusatz('c', mannschaften[1])).toEqual({ text: 'auch in Dritte (dort Stammspieler)', warnung: false });
    expect(zusatz('c', mannschaften[2])).toEqual({ text: 'auch in Zweite', warnung: false });
  });

  test('mehrere andere Kader, nach Rang sortiert', () => {
    expect(zusatz('d', mannschaften[2])).toEqual({ text: 'auch in Erste, Zweite', warnung: false });
  });

  test('Stammspieler oben im Kader unten: Warnung', () => {
    expect(zusatz('a', mannschaften[2])).toEqual({ text: 'Stammspieler in Erste, darf hier nicht antreten', warnung: true });
  });

  test('Auswahl: Stammspieler hoeherer Mannschaften gesperrt', () => {
    expect(kaderGesperrt('a', mannschaften[2], mehr, mannschaften)?.name).toBe('Erste');
    expect(kaderGesperrt('c', mannschaften[1], mehr, mannschaften)).toBeUndefined();
    expect(kaderGesperrt('d', mannschaften[0], mehr, mannschaften)).toBeUndefined();
  });

  test('Stammspieler nach oben: unterer Kader faellt weg', () => {
    const w = stammWechsel({ person: 'c', mannschaft: mannschaften[1], kader: mehr, mannschaften });
    expect(w.bisher?.name).toBe('Dritte');
    expect(w.entfernen.map((x) => x.mannschaft.name)).toEqual(['Dritte']);
  });

  test('Stammspieler nach unten: oben bleibt er im Kader', () => {
    const w = stammWechsel({ person: 'a', mannschaft: mannschaften[2], kader: mehr, mannschaften });
    expect(w.bisher?.name).toBe('Erste');
    expect(w.entfernen).toEqual([]);
  });

  test('ohne Stammmannschaft: nur untere Kader fallen weg', () => {
    const w = stammWechsel({ person: 'd', mannschaft: mannschaften[0], kader: mehr, mannschaften });
    expect(w.bisher).toBeUndefined();
    expect(w.entfernen.map((x) => x.mannschaft.name)).toEqual(['Zweite', 'Dritte']);
  });

  test('Kader anderer Saisons zaehlen nicht', () => {
    expect(andereKader({ person: 'd', mannschaft: mannschaften[2], kader: mehr, mannschaften: [mannschaften[2]] })).toBeNull();
  });
});

describe('Saison', () => {
  test('beginnt im Juli', () => {
    expect(saisonAus('2026-09-12')).toBe('2026/27');
    expect(saisonAus('2026-07-01')).toBe('2026/27');
    expect(saisonAus('2026-06-30')).toBe('2025/26');
    expect(saisonAus('2027-02-14')).toBe('2026/27');
  });

  test('Jahrhundertwechsel bleibt zweistellig', () => {
    expect(saisonAus('2099-08-01')).toBe('2099/00');
  });

  test('Auswahlliste enthält die laufende Saison', () => {
    const liste = saisonListe('2026-09-12');
    expect(liste).toEqual(['2024/25', '2025/26', '2026/27', '2027/28']);
  });
});

describe('Hinweise zur Aufstellung', () => {
  test('wer im Kader steht, wird nicht gemeldet', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[2],
      aufgestellt: ['c', 'd'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual([]);
  });

  test('Aushilfe nach oben ist stumm', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[0],
      aufgestellt: ['a', 'c', 'd'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual([]);
  });

  test('Stammspieler von oben darf nicht nach unten', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[2],
      aufgestellt: ['a', 'c'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual(['A ist Stammspieler in Erste und darf hier nicht antreten.']);
  });

  test('wer in keinem Kader steht, wird gemeldet', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[1],
      aufgestellt: ['x'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toEqual(['X steht in keinem Kader dieser Saison.']);
  });

  test('jeder Spieler wird nur einmal gemeldet', () => {
    const hinweise = kaderHinweise({
      mannschaft: mannschaften[2],
      aufgestellt: ['x', 'x', 'x'],
      kader,
      mannschaften,
      name
    });
    expect(hinweise).toHaveLength(1);
  });
});

describe('Einsätze', () => {
  test('zwei Partien in einer Begegnung sind ein Einsatz', () => {
    const zeilen = einsaetze([{ id: 't1', mannschaft_id: 'm3', spieler: ['c', 'c', 'd'] }]);
    expect(zeilen).toEqual([
      { person_id: 'c', mannschaft_id: 'm3', begegnungen: 1, partien: 2 },
      { person_id: 'd', mannschaft_id: 'm3', begegnungen: 1, partien: 1 }
    ]);
  });

  test('je Mannschaft getrennt gezählt', () => {
    const zeilen = einsaetze([
      { id: 't1', mannschaft_id: 'm3', spieler: ['d', 'd'] },
      { id: 't2', mannschaft_id: 'm1', spieler: ['d'] },
      { id: 't3', mannschaft_id: 'm1', spieler: ['d'] }
    ]);
    expect(zeilen).toHaveLength(2);
    expect(zeilen.find((z) => z.mannschaft_id === 'm1')).toMatchObject({ begegnungen: 2, partien: 2 });
    expect(zeilen.find((z) => z.mannschaft_id === 'm3')).toMatchObject({ begegnungen: 1, partien: 2 });
  });

  test('Spieltag ohne Mannschaft bleibt ohne Zuordnung', () => {
    const zeilen = einsaetze([{ id: 't1', mannschaft_id: null, spieler: ['a'] }]);
    expect(zeilen[0].mannschaft_id).toBeNull();
  });
});

describe('Saisonbilanz', () => {
  test('Siege, Unentschieden und Punkte', () => {
    const bilanz = saisonBilanz([
      { partiepunkte: [5, 3], matchpunkte: [3, 0], entschieden: true },
      { partiepunkte: [4, 4], matchpunkte: [1, 1], entschieden: true },
      { partiepunkte: [2, 6], matchpunkte: [0, 3], entschieden: true },
      { partiepunkte: [1, 0], matchpunkte: [3, 0], entschieden: false }
    ]);
    expect(bilanz).toEqual({
      begegnungen: 4,
      gewertet: 3,
      siege: 1,
      unentschieden: 1,
      niederlagen: 1,
      matchpunkte: [4, 4],
      partiepunkte: [12, 13]
    });
  });

  test('ohne Begegnungen bleibt alles auf null', () => {
    expect(saisonBilanz([])).toMatchObject({ begegnungen: 0, matchpunkte: [0, 0] });
  });
});

describe('Stammspieler', () => {
  test('vier genügen, darunter kommt ein Hinweis', () => {
    expect(stammspielerHinweis(4)).toBeNull();
    expect(stammspielerHinweis(2)).toBe('Erst 2 von 4 Stammspielern gemeldet.');
    expect(stammspielerHinweis(0)).toBe('Noch kein Stammspieler gemeldet (4 sind üblich).');
  });
});

describe('Einsatzregeln (BLVN-STO Pool 2.2)', () => {
  const tag = (datum: string, mannschaft_id: string, person_id: string) => ({ datum, mannschaft_id, person_id });

  test('Ersatzspieler kommen aus unteren Mannschaften', () => {
    expect(istErsatz('c', mannschaften[0], kader, mannschaften)).toBe(true);
    expect(istErsatz('a', mannschaften[0], kader, mannschaften)).toBe(false);
    expect(istErsatz('a', mannschaften[1], kader, mannschaften)).toBe(false); // von oben: kein Ersatz
    expect(istErsatz('x', mannschaften[0], kader, mannschaften)).toBe(false); // in keinem Kader
  });

  test('festgespielt mit dem 3. Spieltag als Ersatz, wo zuletzt eingesetzt', () => {
    const tage = [
      tag('2026-09-05', 'm1', 'c'),
      tag('2026-09-05', 'm1', 'c'), // gleicher Spieltag: ein Einsatz
      tag('2026-09-19', 'm2', 'c'),
      tag('2026-10-03', 'm3', 'c'), // eigene Mannschaft: kein Ersatz
      tag('2026-10-10', 'm2', 'c')
    ];
    expect(festgespielt(tage.slice(0, 4), kader, mannschaften).has('c')).toBe(false);
    expect(festgespielt(tage, kader, mannschaften).get('c')).toBe('m2');
  });

  test('Wochenende', () => {
    expect(wochenende('2026-11-07')).toEqual(['2026-11-07', '2026-11-08']); // Sa.
    expect(wochenende('2026-11-08')).toEqual(['2026-11-07', '2026-11-08']); // So.
    expect(wochenende('2026-11-05')).toEqual(['2026-11-05']); // Do.
  });

  test('Hinweise: 3. Einsatz, festgespielt und Wochenende', () => {
    const grund = { kader, mannschaften, name };
    // C hilft zum 3. Mal in der Ersten aus
    expect(
      einsatzHinweise({ ...grund, mannschaft: mannschaften[0], datum: '2026-10-10', aufgestellt: ['c'], andere: [tag('2026-09-05', 'm1', 'c'), tag('2026-09-19', 'm2', 'c')] })
    ).toEqual(['C hilft hier zum 3. Mal aus und ist danach in Erste festgespielt.']);
    // in der Zweiten festgespielt, soll in der Ersten ran
    expect(
      einsatzHinweise({
        ...grund,
        mannschaft: mannschaften[0],
        datum: '2026-10-21',
        aufgestellt: ['c'],
        andere: [tag('2026-09-05', 'm2', 'c'), tag('2026-09-19', 'm2', 'c'), tag('2026-10-03', 'm2', 'c')]
      })
    ).toEqual(['C ist in Zweite festgespielt (3 Einsätze als Ersatzspieler) und darf hier nicht mehr antreten.']);
    // Sa. Dritte, So. Erste
    expect(
      einsatzHinweise({ ...grund, mannschaft: mannschaften[0], datum: '2026-11-08', aufgestellt: ['c'], andere: [tag('2026-11-07', 'm3', 'c')] })
    ).toEqual(['C hat am Sa., 07.11. schon für Dritte gespielt (am selben Wochenende nur eine Mannschaft, STO 2.2.5).']);
    expect(
      einsatzHinweise({ ...grund, mannschaft: mannschaften[2], datum: '2026-11-07', aufgestellt: ['c'], andere: [tag('2026-11-08', 'm1', 'c')] })
    ).toEqual(['C steht am So., 08.11. auch für Erste im Plan (am selben Wochenende nur eine Mannschaft, STO 2.2.5).']);
  });
});

describe('Spielberechtigung nach Nachmeldung (BLVN-STO Pool 2.1.4)', () => {
  const mitDatum: KaderEintrag[] = [
    ...kader,
    { mannschaft_id: 'm2', person_id: 'n', stammspieler: true, berechtigt_ab: '2026-11-20' }
  ];
  const grund = { kader: mitDatum, mannschaften, name, andere: [] };

  test('Datum aus dem Kader, auch fuer Aushilfen', () => {
    expect(berechtigtAb('n', mannschaften[1], mitDatum)).toBe('2026-11-20');
    expect(berechtigtAb('n', mannschaften[0], mitDatum)).toBe('2026-11-20');
    expect(berechtigtAb('a', mannschaften[0], mitDatum)).toBeNull();
  });

  test('Hinweis nur vor dem Datum', () => {
    expect(einsatzHinweise({ ...grund, mannschaft: mannschaften[1], datum: '2026-11-14', aufgestellt: ['n'] })).toEqual([
      'N ist erst ab 20.11.2026 spielberechtigt (Nachmeldung, STO 2.1.4).'
    ]);
    expect(einsatzHinweise({ ...grund, mannschaft: mannschaften[1], datum: '2026-11-21', aufgestellt: ['n'] })).toEqual([]);
  });
});

describe('Ersatzspieler in den Bemerkungen (BLVN-STO Pool 2.2.3)', () => {
  test('aus unteren Mannschaften, mit Herkunft und festgespielt', () => {
    const liste = ersatzspieler({
      mannschaft: mannschaften[0],
      aufgestellt: ['a', 'b', 'c', 'x', 'b'],
      kader,
      mannschaften,
      fest: new Map([['c', 'm1']])
    });
    expect(liste).toEqual([
      { person: 'b', aus: 'Zweite', festgespielt: false },
      { person: 'c', aus: 'Dritte', festgespielt: true }
    ]);
    const zeile = ersatzZeile(liste, name);
    expect(zeile).toBe('Ersatzspieler: B (Zweite), C (Dritte, festgespielt).');
    expect(mitErsatzZeile('Gast 15 Min. verspätet', zeile)).toBe(`${zeile}\nGast 15 Min. verspätet`);
    expect(mitErsatzZeile('Ersatzspieler: alt.\nProtest folgt', 'Ersatzspieler: neu.')).toBe('Ersatzspieler: neu.\nProtest folgt');
    expect(mitErsatzZeile('', zeile)).toBe(zeile);
  });
});
