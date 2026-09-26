import { describe, expect, test } from 'vitest';
import { adresseAusName, aenderungText, groesseText, ratingWarnung, sicherungsWarnung } from '../src/mandanten';

describe('Protokoll: Verein geändert', () => {
  test('nennt nur geänderte Felder', () => {
    const details = {
      name: 'PBC Bassum',
      vorher: { name: 'PBC Bassum', kurzname: 'Bassum', slug: 'bassum', test: false },
      nachher: { name: 'PBC Bassum', kurzname: 'PBC', slug: 'bassum', test: true }
    };
    expect(aenderungText(details)).toBe('Kurzname: Bassum → PBC · Test-Verein: nein → ja');
  });
  test('ohne Änderung leer', () => {
    const gleich = { name: 'A', kurzname: 'A', slug: 'a', test: false };
    expect(aenderungText({ vorher: gleich, nachher: gleich })).toBe('');
  });
});

describe('Adresse aus dem Vereinsnamen', () => {
  test('Umlaute, Leer- und Sonderzeichen', () => {
    expect(adresseAusName('B&W Verden')).toBe('b-w-verden');
    expect(adresseAusName('BC Grün-Weiß Süd 1911 e.V.')).toBe('bc-gruen-weiss-sued-1911-e-v');
  });

  test('passt zur Regel der Datenbank (2 bis 30 Zeichen)', () => {
    const lang = adresseAusName('Billardverein Musterstadt von 1927 und Umgebung');
    expect(lang.length).toBeLessThanOrEqual(30);
    expect(lang).toMatch(/^[a-z0-9-]{2,30}$/);
    expect(lang.endsWith('-')).toBe(false);
  });
});


describe('Konsole: Warnungen', () => {
  const jetzt = new Date('2026-09-25T10:00:00Z');

  test('Sicherung', () => {
    expect(sicherungsWarnung(null, jetzt)).toContain('noch keine Meldung');
    expect(sicherungsWarnung({ zeit: '2026-09-21T03:30:00Z', erfolg: false }, jetzt)).toContain('fehlgeschlagen');
    expect(sicherungsWarnung({ zeit: '2026-09-21T03:30:00Z', erfolg: true }, jetzt)).toBeNull();
    expect(sicherungsWarnung({ zeit: '2026-09-14T03:30:00Z', erfolg: true }, jetzt)).toBe('Die letzte Sicherung ist 11 Tage alt.');
  });

  test('Rating: der juengste Lauf zaehlt', () => {
    const laeufe = [
      { status: 'failed', start: '2026-09-21T02:30:00Z' },
      { status: 'succeeded', start: '2026-09-25T02:30:00Z' }
    ];
    expect(ratingWarnung(laeufe, jetzt)).toBeNull();
    expect(ratingWarnung([{ status: 'failed', start: '2026-09-25T02:30:00Z' }], jetzt)).toContain('fehlgeschlagen');
    expect(ratingWarnung([{ status: 'succeeded', start: '2026-09-21T02:30:00Z' }], jetzt)).toContain('mehr als zwei Tagen');
    expect(ratingWarnung([], jetzt)).toContain('noch nie');
  });

  test('Groesse lesbar', () => {
    expect(groesseText(17058963)).toBe('16,3 MB');
    expect(groesseText(512)).toBe('512 B');
    expect(groesseText(null)).toBe('–');
  });
});
