import { describe, expect, test } from 'vitest';
import { ersetzenFehler } from '../src/seiten/SpielerErsetzen';

describe('Spieler ersetzen (importierte Spieltage)', () => {
  const dabei = new Set(['a', 'b']);
  test('erlaubt den Tausch gegen einen, der nicht dabei ist', () => {
    expect(ersetzenFehler('a', 'c', dabei)).toBeNull();
  });
  test('lehnt ab: leer, gleich, nicht dabei, schon dabei', () => {
    expect(ersetzenFehler('', 'c', dabei)).toBe('Bitte beide Spieler wählen.');
    expect(ersetzenFehler('a', 'a', dabei)).toBe('Das ist derselbe Spieler.');
    expect(ersetzenFehler('x', 'c', dabei)).toBe('Der zu ersetzende Spieler gehört nicht zu diesem Spieltag.');
    expect(ersetzenFehler('a', 'b', dabei)).toBe('Der neue Spieler ist an diesem Spieltag schon dabei.');
  });
});
