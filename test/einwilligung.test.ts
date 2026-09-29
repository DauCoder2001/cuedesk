import { describe, expect, test } from 'vitest';
import { einwilligungStand, standText } from '../src/einwilligung';
import type { Einwilligung } from '../src/datenbank.types';

let lfd = 0;
const eintrag = (weiteres: Partial<Einwilligung>): Einwilligung => ({
  id: `e${++lfd}`,
  verein_id: 'v',
  person_id: 'p',
  art: 'name_oeffentlich',
  vorgang: 'erteilt',
  weg: 'selbst',
  fassung: null,
  am: '2026-09-01T10:00:00Z',
  erfasst_von: null,
  ...weiteres
});

describe('Einwilligung', () => {
  test('ohne Eintrag gilt nichts', () => {
    const s = einwilligungStand([], 'name_oeffentlich');
    expect(s.gilt).toBe(false);
    expect(standText(s)).toBe('keine Einwilligung');
  });

  test('der juengste Eintrag entscheidet, je Art getrennt', () => {
    const liste = [
      eintrag({ am: '2026-09-01T10:00:00Z' }),
      eintrag({ am: '2026-09-10T10:00:00Z', vorgang: 'widerrufen' }),
      eintrag({ am: '2026-09-20T10:00:00Z', art: 'konto_minderjaehrig', weg: 'erziehungsberechtigte' })
    ];
    const name = einwilligungStand(liste, 'name_oeffentlich');
    expect(name.gilt).toBe(false);
    expect(standText(name)).toBe('widerrufen am 10.09.2026 (selbst in CueDesk)');
    const konto = einwilligungStand(liste, 'konto_minderjaehrig');
    expect(konto.gilt).toBe(true);
    expect(standText(konto)).toBe('eingewilligt am 20.09.2026 (Erziehungsberechtigte, schriftlich)');
  });

  test('uebernommener Haken ohne Nachweis gilt, ist aber markiert', () => {
    const s = einwilligungStand([eintrag({ weg: 'uebernommen' })], 'name_oeffentlich');
    expect(s.gilt).toBe(true);
    expect(s.ohneNachweis).toBe(true);
    expect(standText(s)).toBe('übernommen, ohne Nachweis');
    // bestaetigt: danach schriftlich erfasst
    const bestaetigt = einwilligungStand(
      [eintrag({ weg: 'uebernommen' }), eintrag({ weg: 'schriftlich', am: '2026-09-29T10:00:00Z' })],
      'name_oeffentlich'
    );
    expect(bestaetigt.ohneNachweis).toBe(false);
  });
});
