import { afterEach, describe, expect, test, vi } from 'vitest';
import { neueKennung } from '../scoreboards/js/kennung';

// Die Tablets laufen ohne HTTPS; dort fehlt crypto.randomUUID. Die Kennung
// muss trotzdem entstehen, sonst laesst sich kein Turnierspiel abschliessen.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('Kennung', () => {
  test('nutzt randomUUID, wenn es sie gibt', () => {
    expect(neueKennung()).toMatch(UUID);
  });

  test('kommt ohne randomUUID aus', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(7) });
    expect(neueKennung()).toMatch(UUID);
  });

  test('kommt ganz ohne crypto aus', () => {
    vi.stubGlobal('crypto', undefined);
    const erste = neueKennung();
    expect(erste).toMatch(UUID);
    expect(neueKennung()).not.toBe(erste);
  });
});
