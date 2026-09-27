import { describe, expect, test } from 'vitest';
import { passwortFehler } from '../src/passwort';

describe('Passwort festlegen', () => {
  test('zu kurz', () => {
    expect(passwortFehler('kurz', 'kurz', 'a@b.de')).toBe('Das Passwort braucht mindestens 10 Zeichen.');
  });
  test('Eingaben verschieden', () => {
    expect(passwortFehler('langes-passwort', 'langes-Passwort', 'a@b.de')).toBe('Die beiden Eingaben stimmen nicht überein.');
  });
  test('nicht die eigene E-Mail-Adresse', () => {
    expect(passwortFehler('Name@Verein.de', 'Name@Verein.de', 'name@verein.de')).toBe(
      'Das Passwort darf nicht die E-Mail-Adresse sein.'
    );
  });
  test('gutes Passwort', () => {
    expect(passwortFehler('Queue und Kreide 7', 'Queue und Kreide 7', 'a@b.de')).toBeNull();
  });
});
