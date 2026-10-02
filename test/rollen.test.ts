import { describe, expect, test } from 'vitest';
import { hoechsteRolle, rollenName, rollenText } from '../src/rollen';

describe('Rollen', () => {
  test('mitglied heisst Lesezugang', () => {
    expect(rollenName('mitglied')).toBe('Lesezugang');
    expect(hoechsteRolle(['mitglied'])).toBe('Lesezugang');
  });

  test('Text in fester Reihenfolge, hoechste Rolle zuerst', () => {
    expect(rollenText(['mitglied', 'turnierleiter'])).toBe('Turnierleiter, Lesezugang');
    expect(rollenText([])).toBe('keine Rolle');
    expect(hoechsteRolle(['mitglied', 'sportwart'])).toBe('Sportwart');
    expect(hoechsteRolle([])).toBe('');
  });
});
