import { describe, expect, test } from 'vitest';
import { istCuedeskExport, stammdatenAuswerten, zuordnungVorschlagen } from '../src/export-lesen';

// Nachgebauter CueDesk-Export (verein_export, Version 1). Bewusst ohne echte
// Namen, damit im oeffentlichen Repository keine Mitgliederdaten liegen.
const exportDatei = {
  format: 'cuedesk-export',
  version: 1,
  erstellt: '2026-10-13T08:00:00Z',
  verein: { id: 'v1', name: 'Testverein' },
  daten: {
    personen: [
      { id: 'p1', vorname: 'Anna', nachname: 'Beispiel', anzeigename: null, kuerzel: 'AB', status: 'mitglied', rating_ausgeblendet: false, anonymisiert_am: null, name_oeffentlich: true },
      { id: 'p2', vorname: 'Bert', nachname: 'Muster', anzeigename: 'Bert M.', kuerzel: null, status: 'ausgetreten', rating_ausgeblendet: true, anonymisiert_am: null },
      { id: 'p3', vorname: 'Gast', nachname: 'Gegner', anzeigename: 'Gast Gegner (FC)', kuerzel: null, status: 'gast', rating_ausgeblendet: false, anonymisiert_am: null },
      { id: 'p4', vorname: 'Spieler', nachname: '4711', anzeigename: null, kuerzel: null, status: 'ausgetreten', rating_ausgeblendet: false, anonymisiert_am: '2026-10-01T00:00:00Z' }
    ],
    personen_intern: [
      { person_id: 'p1', verein_id: 'v1', eintritt: '2020-01-01', austritt: null, minderjaehrig: false, rating_startwert: 550, notiz: '', passnummer: 'P-1', dbu_nummer: null },
      { person_id: 'p2', verein_id: 'v1', eintritt: null, austritt: '2025-12-31', minderjaehrig: true, rating_startwert: 5000, notiz: 'Hinweis', passnummer: null, dbu_nummer: 'D-2' }
    ],
    mannschaften: [{ id: 'm1', name: 'Erste', saison: '2026/27', liga: 'pool', staffel: 'Nord', rang: 1, aktiv: true, notiz: null }],
    mannschaft_spieler: [
      { id: 'k1', mannschaft_id: 'm1', person_id: 'p1', stammspieler: true, kapitaen: true, berechtigt_ab: null, position: 1 },
      { id: 'k2', mannschaft_id: 'm1', person_id: 'p4', stammspieler: false, kapitaen: false, berechtigt_ab: null, position: 2 }
    ],
    tische: [
      { id: 't2', nummer: 2, bezeichnung: null, aktiv: true },
      { id: 't1', nummer: 1, bezeichnung: 'Fenster', aktiv: false }
    ],
    turniere: [{ id: 'x' }, { id: 'y' }],
    partien: [{ id: 'a' }],
    partien_141: [{ id: 'b' }],
    rating_stand: [{}, {}, {}],
    einwilligungen: [
      { person_id: 'p1', art: 'name_oeffentlich', vorgang: 'erteilt', weg: 'uebernommen', am: '2026-09-29T10:00:00Z' },
      { person_id: 'p1', art: 'name_oeffentlich', vorgang: 'erteilt', weg: 'schriftlich', am: '2026-10-08T10:00:00Z' },
      { person_id: 'p2', art: 'name_oeffentlich', vorgang: 'erteilt', weg: 'uebernommen', am: '2026-09-29T10:00:00Z' },
      { person_id: 'p3', art: 'name_oeffentlich', vorgang: 'erteilt', weg: 'selbst', am: '2026-10-01T10:00:00Z' },
      { person_id: 'p3', art: 'name_oeffentlich', vorgang: 'widerrufen', weg: 'selbst', am: '2026-10-02T10:00:00Z' },
      { person_id: 'p4', art: 'name_oeffentlich', vorgang: 'erteilt', weg: 'schriftlich', am: '2026-10-08T10:00:00Z' }
    ],
    konten: [{ email: 'konto@example.org' }],
    geraete: [{ id: 'g' }]
  }
};

describe('CueDesk-Export lesen', () => {
  test('erkennt das Format', () => {
    expect(istCuedeskExport(exportDatei)).toBe(true);
    expect(istCuedeskExport({ version: 4, serien: [] })).toBe(false);
    expect(istCuedeskExport(null)).toBe(false);
  });

  test('lehnt fremde Versionen ab', () => {
    expect(() => stammdatenAuswerten({ ...exportDatei, version: 2 })).toThrow(/Version/);
    expect(() => stammdatenAuswerten({ serien: [] })).toThrow(/kein CueDesk-Export/);
  });

  test('Spieler ohne anonymisierte, mit vertraulichen Angaben', () => {
    const s = stammdatenAuswerten(exportDatei);
    expect(s.vereinName).toBe('Testverein');
    expect(s.anonymisiert).toBe(1);
    expect(s.personen.map((p) => p.altId)).toEqual(['p1', 'p2', 'p3']);
    const anna = s.personen[0];
    expect(anna.intern).toMatchObject({ eintritt: '2020-01-01', rating_startwert: 550, notiz: null, passnummer: 'P-1' });
    const bert = s.personen[1];
    expect(bert.status).toBe('ausgetreten');
    expect(bert.rating_ausgeblendet).toBe(true);
    // Startwert ausserhalb 100..1000 faellt weg statt am Datenbank-Check zu scheitern
    expect(bert.intern).toMatchObject({ minderjaehrig: true, rating_startwert: null, dbu_nummer: 'D-2' });
    expect(s.personen[2].intern).toBeNull();
    // "Name oeffentlich" wird nie mitgenommen
    expect(JSON.stringify(s)).not.toContain('name_oeffentlich');
  });

  test('Mannschaft mit Kader nur aus angebotenen Spielern, Tische sortiert', () => {
    const s = stammdatenAuswerten(exportDatei);
    expect(s.mannschaften).toHaveLength(1);
    expect(s.mannschaften[0]).toMatchObject({ name: 'Erste', saison: '2026/27', liga: 'pool', staffel: 'Nord' });
    expect(s.mannschaften[0].kader).toEqual([
      { personAltId: 'p1', stammspieler: true, kapitaen: true, berechtigt_ab: null, position: 1 }
    ]);
    expect(s.tische).toEqual([
      { nummer: 1, bezeichnung: 'Fenster', aktiv: false },
      { nummer: 2, bezeichnung: null, aktiv: true }
    ]);
  });

  test('zaehlt, was draussen bleibt', () => {
    expect(stammdatenAuswerten(exportDatei).ausgelassen).toEqual({
      turniere: 2,
      partien: 2,
      ratingStand: 3,
      konten: 1,
      geraete: 1
    });
  });

  test('Einwilligungen: letzter Eintrag je Spieler, ohne anonymisierte', () => {
    // p1 zuletzt schriftlich, p2 nur uebernommen, p3 widerrufen, p4 anonymisiert
    expect(stammdatenAuswerten(exportDatei).einwilligungen).toEqual({ mitNachweis: 1, ohneNachweis: 1 });
    const alt = { ...exportDatei, daten: { ...exportDatei.daten, einwilligungen: undefined } };
    expect(stammdatenAuswerten(alt).einwilligungen).toEqual({ mitNachweis: 0, ohneNachweis: 0 });
  });

  test('Zuordnung: vorhandener Name, Gast weglassen, sonst neu', () => {
    const s = stammdatenAuswerten(exportDatei);
    const vorschlag = zuordnungVorschlagen(s.personen, [{ id: 'neu-1', vorname: 'bert', nachname: 'MUSTER' }]);
    expect(vorschlag).toEqual({ p1: 'neu', p2: 'neu-1', p3: 'weglassen' });
  });
});
