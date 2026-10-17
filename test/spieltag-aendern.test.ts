import { describe, expect, test } from 'vitest';
import { LIGEN } from '../src/liga';
import { ligaAenderbar, spieltagAenderung, spieltagEingabe } from '../src/spieltag-aendern';

const ziele = LIGEN.kreisklasse.ziele;
const liga = (x: Record<string, unknown>) => ({
  liga: { liga: 'kreisklasse', spieltag: 1, heim: false, gegner: 'BC Musterstadt 7', eigene: 'Testverein 1', mannschaft_id: 'm1', ziele, ...x }
});
const erste = { id: 't1', name: 'Spieltag 01 Kreisklasse', datum: '2026-10-17', einstellungen: liga({ begegnung: 1, partner: 't2' }) };
const zweite = { id: 't2', name: 'Spieltag 01 Kreisklasse · 2. Begegnung', datum: '2026-10-17', einstellungen: liga({ begegnung: 2, partner: 't1', heim: true }) };

describe('Spieltag ändern', () => {
  test('Grundwerte aus der 1. Begegnung, Name ohne Zusatz', () => {
    expect(spieltagEingabe(zweite).name).toBe('Spieltag 01 Kreisklasse');
    expect(spieltagEingabe(erste)).toMatchObject({ heim: false, eigene: 'Testverein 1', mannschaft_id: 'm1', spieltag: 1 });
  });

  test('beide Begegnungen: neue Mannschaft, Namen mit Zusatz, 2. Begegnung mit getauschtem Heimrecht', () => {
    const eingabe = { ...spieltagEingabe(erste), name: 'Spieltag 01 Kreisklasse OH', eigene: 'Testverein 3', mannschaft_id: 'm3', heim: true };
    const [a, b] = spieltagAenderung([erste, zweite], eingabe);
    expect(a.name).toBe('Spieltag 01 Kreisklasse OH');
    expect(b.name).toBe('Spieltag 01 Kreisklasse OH · 2. Begegnung');
    expect(a.einstellungen.liga).toMatchObject({ eigene: 'Testverein 3', mannschaft_id: 'm3', heim: true, partner: 't2', begegnung: 1 });
    expect(b.einstellungen.liga).toMatchObject({ eigene: 'Testverein 3', mannschaft_id: 'm3', heim: false, partner: 't1', begegnung: 2 });
  });

  test('neue Liga bringt ihre Ausspielziele mit, sonst bleiben sie', () => {
    const gleich = spieltagAenderung([erste], spieltagEingabe(erste))[0];
    expect(gleich.einstellungen.liga?.ziele).toBe(ziele);
    const anders = spieltagAenderung([erste], { ...spieltagEingabe(erste), liga: 'bezirksliga' })[0];
    expect(anders.einstellungen.liga?.ziele).toEqual(LIGEN.bezirksliga.ziele);
  });

  test('Liga nur ohne Aufstellung, Partien und Spass-Liga', () => {
    expect(ligaAenderbar([erste, zweite], 0)).toBe(true);
    expect(ligaAenderbar([erste, zweite], 1)).toBe(false);
    const mitAufstellung = { ...erste, einstellungen: liga({ aufstellung: { '1': { heim: 'p1' } } }) };
    expect(ligaAenderbar([mitAufstellung, zweite], 0)).toBe(false);
    const spass = { ...erste, einstellungen: liga({ liga: 'spass' }) };
    expect(ligaAenderbar([spass], 0)).toBe(false);
  });
});
