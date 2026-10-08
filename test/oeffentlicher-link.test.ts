import { describe, expect, test } from 'vitest';
import { istAbgelaufen, linkAdresse, neuerSchluessel, standardGueltigBis, tagVon, tagesende } from '../src/oeffentlicher-link';

describe('Oeffentlicher Live-Link', () => {
  test('Schluessel: 32 Zeichen, nur URL-sichere Zeichen', () => {
    const s = neuerSchluessel();
    expect(s).toHaveLength(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(neuerSchluessel()).not.toBe(s);
    // feste Bytes: + und / werden zu - und _
    expect(neuerSchluessel((b) => b.fill(0xfb))).toMatch(/^[-_A-Za-z0-9]{32}$/);
    expect(neuerSchluessel((b) => b.fill(0xfb))).toContain('-');
  });

  test('Adresse mit und ohne Schraegstrich am Ende', () => {
    expect(linkAdresse('https://x.github.io/cuedesk/', 'abc')).toBe('https://x.github.io/cuedesk/live.html?k=abc');
    expect(linkAdresse('http://localhost:5173', 'abc')).toBe('http://localhost:5173/live.html?k=abc');
  });

  test('Vorschlag gueltig bis: Turniertag, in der Vergangenheit heute', () => {
    const jetzt = new Date(2026, 9, 8, 12, 0);
    expect(standardGueltigBis('2026-11-15', jetzt)).toBe('2026-11-15');
    expect(standardGueltigBis('2026-10-08', jetzt)).toBe('2026-10-08');
    expect(standardGueltigBis('2026-09-01', jetzt)).toBe('2026-10-08');
  });

  test('Tagesende und zurueck', () => {
    const ende = tagesende('2026-11-15');
    expect(new Date(ende).getHours()).toBe(23);
    expect(tagVon(ende)).toBe('2026-11-15');
    expect(istAbgelaufen(ende, Date.parse(ende) - 1000)).toBe(false);
    expect(istAbgelaufen(ende, Date.parse(ende) + 1000)).toBe(true);
  });
});
