import { describe, expect, test } from 'vitest';
import { modusOptionen, modusVorschlag } from '../src/modus-wahl';

const grenzen = { einzelBis: 7, zweiBis: 15 };
const spiele = (n: number, modus: string) => modusOptionen(n).find((o) => o.modus === modus)?.spiele;

describe('Modus am Turniertag', () => {
  test('Spielzahlen', () => {
    expect(spiele(8, 'einzelgruppe')).toBe(28);
    expect(spiele(8, 'zwei-gruppen')).toBe(16); // 6 + 6 + 4 Duelle
    expect(spiele(11, 'zwei-gruppen')).toBe(30); // 15 + 10 + 5 Duelle
    expect(spiele(16, 'zwei-gruppen')).toBe(64);
  });

  test('nicht passende Modi mit Grund', () => {
    const bei5 = modusOptionen(5);
    expect(bei5.find((o) => o.modus === 'gruppen-ko')).toMatchObject({ passt: false, grund: '8 bis 32 Teilnehmer' });
    expect(modusOptionen(13).find((o) => o.modus === 'einzelgruppe')?.passt).toBe(false);
    expect(modusOptionen(20).find((o) => o.modus === 'zwei-gruppen')?.passt).toBe(false);
  });

  test('Vorschlag nach den Grenzen des Vereins', () => {
    expect(modusVorschlag(7, grenzen)).toBe('einzelgruppe');
    expect(modusVorschlag(8, grenzen)).toBe('zwei-gruppen');
    expect(modusVorschlag(15, grenzen)).toBe('zwei-gruppen');
    expect(modusVorschlag(16, grenzen)).toBe('gruppen-ko');
    expect(modusVorschlag(2, grenzen)).toBeNull();
  });

  test('passt der Wunsch nicht, der naechste passende', () => {
    // KO gewuenscht, aber nur 8 Teilnehmer bei Grenze "Zwei Gruppen bis 7"
    expect(modusVorschlag(13, { einzelBis: 12, zweiBis: 12 })).not.toBeNull();
  });
});
