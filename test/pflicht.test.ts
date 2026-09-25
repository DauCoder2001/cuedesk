import { describe, expect, test } from 'vitest';
import { fehltText, feldName } from '../src/pflicht';

describe('Pflichtfelder', () => {
  test('Name des Feldes ohne Zusatz in Klammern', () => {
    expect(feldName('Adresse (für spätere Vereinsseiten)')).toBe('Adresse');
    expect(feldName('Name')).toBe('Name');
    expect(feldName('Race to:')).toBe('Race to');
  });

  test('Hinweis nennt jedes fehlende Feld einmal', () => {
    expect(fehltText([])).toBeNull();
    expect(fehltText(['Name', '', 'Adresse', 'Name'])).toBe('Bitte ausfüllen: Name, Adresse.');
  });
});
