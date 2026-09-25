import { describe, expect, test } from 'vitest';
import { adresseAusName } from '../src/mandanten';

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
