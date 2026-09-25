import { describe, expect, test } from 'vitest';
import { AUFRAEUMEN_ARTEN, datumText, exportDateiname, loeschStand } from '../src/datenpflege';

describe('Weg zum Loeschen', () => {
  const gesperrt = '2026-09-25T10:00:00Z';
  test('aktiver Verein', () => {
    expect(loeschStand({ aktiv: true, gesperrt_am: null, export_am: null, loeschen_ab: null })).toBe('aktiv');
  });
  test('gesperrt ohne Export oder mit Export von vor der Sperre', () => {
    expect(loeschStand({ aktiv: false, gesperrt_am: gesperrt, export_am: null, loeschen_ab: null })).toBe('export_fehlt');
    expect(loeschStand({ aktiv: false, gesperrt_am: gesperrt, export_am: '2026-09-20T10:00:00Z', loeschen_ab: null })).toBe('export_fehlt');
  });
  test('Export nach der Sperre', () => {
    expect(loeschStand({ aktiv: false, gesperrt_am: gesperrt, export_am: '2026-09-25T10:05:00Z', loeschen_ab: null })).toBe('bereit');
  });
  test('vorgemerkt', () => {
    expect(loeschStand({ aktiv: false, gesperrt_am: gesperrt, export_am: '2026-09-25T10:05:00Z', loeschen_ab: '2026-10-25' })).toBe('vorgemerkt');
  });
});

describe('Export und Anzeige', () => {
  test('Dateiname mit Adresse und Tag', () => {
    expect(exportDateiname('b-w-verden', new Date(2026, 8, 5, 23, 30))).toBe('cuedesk-b-w-verden-2026-09-05.json');
  });
  test('Datum ohne Uhrzeit bleibt derselbe Tag', () => {
    expect(datumText('2026-10-25')).toBe('25.10.2026');
  });
  test('jede Art zum Aufraeumen nur einmal', () => {
    const arten = AUFRAEUMEN_ARTEN.map((a) => a.art);
    expect(new Set(arten).size).toBe(arten.length);
  });
});
