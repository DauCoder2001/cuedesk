import { describe, expect, test } from 'vitest';
import { frageText, weichtAb } from '../src/ungespeichert';

describe('Ungespeicherte Eingaben', () => {
  test('ohne festgehaltenen Stand gilt nichts als geändert', () => {
    expect(weichtAb({ name: 'A' }, null)).toBe(false);
    expect(weichtAb(null, { name: 'A' })).toBe(false);
  });

  test('Abweichung wird erkannt, gleicher Inhalt nicht', () => {
    expect(weichtAb({ name: 'A', plz: '' }, { name: 'A', plz: '' })).toBe(false);
    expect(weichtAb({ name: 'AB', plz: '' }, { name: 'A', plz: '' })).toBe(true);
  });

  test('Text der Rückfrage für ein und mehrere Formulare', () => {
    expect(frageText(['„Volker Behrmann“'])).toBe('„Volker Behrmann“ ist noch nicht gespeichert.');
    expect(frageText(['Die Seite System', 'Das neue Schutzwort'])).toBe(
      'Noch nicht gespeichert:\n– Die Seite System\n– Das neue Schutzwort'
    );
  });
});
