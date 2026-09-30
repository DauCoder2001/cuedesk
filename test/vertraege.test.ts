import { describe, expect, test } from 'vitest';
import { VERTRAEGE, VERTRAG_FASSUNG, fassungText } from '../src/vertraege';

describe('Vertragsfassung', () => {
  test('Kennung passt zu den Fassungen der Texte', () => {
    const [nb, avv] = VERTRAEGE.map((v) => v.fassung);
    expect(VERTRAG_FASSUNG).toBe(`NB${nb}-AVV${avv}`);
  });
  test('lesbarer Text', () => {
    expect(fassungText('NB1-AVV1')).toBe('Nutzungsbedingungen 1, Auftragsverarbeitung 1');
    expect(fassungText('NB2-AVV1')).toBe('Nutzungsbedingungen 2, Auftragsverarbeitung 1');
    expect(fassungText('alt')).toBe('alt');
  });
});
