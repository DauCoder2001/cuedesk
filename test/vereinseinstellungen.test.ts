import { describe, expect, test } from 'vitest';
import { STANDARD_EINSTELLUNGEN, vereinsEinstellungen, vereinsKuerzel } from '../src/vereinseinstellungen';
import { saisonAus, saisonListe } from '../src/mannschaften';

describe('Vereinseinstellungen', () => {
  test('ohne Einstellungen gilt der bisherige Stand', () => {
    expect(vereinsEinstellungen({})).toEqual(STANDARD_EINSTELLUNGEN);
    expect(vereinsEinstellungen(null)).toEqual(STANDARD_EINSTELLUNGEN);
  });

  test('gespeicherte Werte werden uebernommen', () => {
    const e = vereinsEinstellungen({
      turnier: { raceTo: 7, disziplin: '8-ball', modus: 'gruppen-ko', vorgabe: false, staerke: 60, obergrenze: 3, ratingWerten: false },
      liga: { liga: 'bezirksliga', mannschaftRang: 2 },
      saisonbeginn: 8
    });
    expect(e.turnier).toEqual({
      raceTo: 7,
      disziplin: '8-ball',
      modus: 'gruppen-ko',
      vorgabe: false,
      staerke: 60,
      obergrenze: 3,
      ratingWerten: false
    });
    expect(e.liga).toEqual({ liga: 'bezirksliga', mannschaftRang: 2 });
    expect(e.saisonbeginn).toBe(8);
  });

  test('unbrauchbare Werte fallen auf den Standard zurueck', () => {
    const e = vereinsEinstellungen({
      turnier: { raceTo: 0, disziplin: 'snooker', modus: 'einzelspiel', staerke: 150, obergrenze: -1 },
      liga: { liga: 'weltliga', mannschaftRang: 1.5 },
      saisonbeginn: 13
    });
    expect(e).toEqual(STANDARD_EINSTELLUNGEN);
  });

  test('Kuerzel aus Kurzname, sonst aus dem Namen', () => {
    expect(vereinsKuerzel('bw', 'B&W Verden')).toBe('BW');
    expect(vereinsKuerzel('', 'Verden')).toBe('VE');
    expect(vereinsKuerzel(null, null)).toBe('CU');
  });
});

describe('Saisonbeginn', () => {
  test('Standard Juli', () => {
    expect(saisonAus('2026-06-30')).toBe('2025/26');
    expect(saisonAus('2026-07-01')).toBe('2026/27');
  });

  test('anderer Beginn, zum Beispiel August', () => {
    expect(saisonAus('2026-07-15', 8)).toBe('2025/26');
    expect(saisonAus('2026-08-01', 8)).toBe('2026/27');
    expect(saisonListe('2026-07-15', 8)).toEqual(['2023/24', '2024/25', '2025/26', '2026/27']);
  });

  test('Saison im Kalenderjahr (Beginn Januar)', () => {
    expect(saisonAus('2026-01-01', 1)).toBe('2026/27');
    expect(saisonAus('2026-12-31', 1)).toBe('2026/27');
  });
});
