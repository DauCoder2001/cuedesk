import { describe, expect, test } from 'vitest';
import { versionText, versionTipp } from '../src/version';

describe('Versionsangabe', () => {
  test('Nummer vierstellig mit Datum', () => {
    expect(versionText('235', '13-10-2026')).toBe('v0235_13-10-2026');
    expect(versionText('12345', '01-01-2027')).toBe('v12345_01-01-2027');
  });

  test('ohne Angaben: lokal', () => {
    expect(versionText(undefined, undefined)).toBe('v0000_lokal');
    expect(versionText('', '13-10-2026')).toBe('v0000_lokal');
    expect(versionText('235', undefined)).toBe('v0000_lokal');
  });

  test('Tooltip mit Umgebung und kurzer Commit-Kennung', () => {
    expect(versionTipp('52ef2bd0123456789', true)).toBe('Testfassung · Commit 52ef2bd');
    expect(versionTipp('52ef2bd0123456789', false)).toBe('Produktion · Commit 52ef2bd');
    expect(versionTipp(undefined, false)).toBe('lokale Vorschau');
  });
});
