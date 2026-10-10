import { describe, expect, test } from 'vitest';
import { waehrendSpeichern } from '../scoreboards/js/knopf-warten.js';

// Knopf und Hinweis brauchen nur disabled und textContent
const knopf = () => ({ disabled: false, textContent: '✅ Ergebnis bestätigen' }) as unknown as HTMLButtonElement;
const hinweis = () => ({ textContent: 'Falsch gezählt? Mit ↩️ Undo korrigieren.' }) as unknown as HTMLElement;

describe('Ergebnis bestätigen: Rückmeldung am Knopf', () => {
  test('sofort gesperrt mit "Speichert …", danach wie vorher', async () => {
    const k = knopf();
    const h = hinweis();
    let fertig: () => void = () => {};
    const arbeit = () => new Promise<void>((r) => (fertig = r));
    const lauf = waehrendSpeichern(k, arbeit, h);
    expect(k.disabled).toBe(true);
    expect(k.textContent).toBe('Speichert …');
    expect(h.textContent).toBe('Ergebnis wird an CueDesk übertragen.');
    fertig();
    await lauf;
    expect(k.disabled).toBe(false);
    expect(k.textContent).toBe('✅ Ergebnis bestätigen');
    expect(h.textContent).toBe('Falsch gezählt? Mit ↩️ Undo korrigieren.');
  });

  test('zweites Tippen während des Speicherns tut nichts', async () => {
    const k = knopf();
    let aufrufe = 0;
    let fertig: () => void = () => {};
    const arbeit = () => {
      aufrufe += 1;
      return new Promise<void>((r) => (fertig = r));
    };
    const erster = waehrendSpeichern(k, arbeit);
    await waehrendSpeichern(k, arbeit);
    expect(aufrufe).toBe(1);
    fertig();
    await erster;
  });

  test('nach einem Fehler wieder frei', async () => {
    const k = knopf();
    await expect(waehrendSpeichern(k, () => Promise.reject(new Error('weg')))).rejects.toThrow('weg');
    expect(k.disabled).toBe(false);
    expect(k.textContent).toBe('✅ Ergebnis bestätigen');
  });
});
