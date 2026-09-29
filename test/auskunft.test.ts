import { describe, expect, test } from 'vitest';
import { aenderungText, aktuellesRating, auskunftDateiname, auskunftPdf } from '../src/auskunft';
import type { Auskunft } from '../src/auskunft';

const auskunft = (weiteres: Partial<Auskunft> = {}): Auskunft => ({
  erstellt_am: '2026-09-29T10:15:00Z',
  verein: 'BC Musterstadt',
  person: {
    vorname: 'Jürgen',
    nachname: 'Beispiel',
    anzeigename: null,
    kuerzel: 'JB',
    status: 'mitglied',
    name_oeffentlich: false,
    rating_ausgeblendet: false,
    erstellt_am: '2026-01-10T08:00:00Z',
    geaendert_am: '2026-09-01T08:00:00Z',
    anonymisiert_am: null
  },
  vertraulich: { eintritt: '2019-03-01', austritt: null, minderjaehrig: false, rating_startwert: 500, passnummer: 'P-1', dbu_nummer: null, notiz: null },
  konten: [
    {
      email: 'juergen@example.com',
      anzeigename: 'Jürgen',
      erstellt_am: '2026-02-01T08:00:00Z',
      angemeldet_am: '2026-09-28T19:00:00Z',
      passwort_festgelegt: true,
      rollen: ['mitglied']
    }
  ],
  turniere: [{ name: 'Herbstcup', datum: '2026-09-18', disziplin: '9-ball', modus: 'gruppen-ko', status: 'beendet', startnummer: 3, gruppe: 'A', endplatz: 1 }],
  anmeldungen: [],
  mannschaften: [],
  partien: [
    {
      datum: '2026-09-18',
      turnier: 'Herbstcup',
      disziplin: '9-ball',
      phase: 'ko',
      gruppe: 'fin',
      gegner: 'Max Muster',
      eigene: 5,
      gegner_ergebnis: 3,
      vorgabe_eigen: 0,
      vorgabe_gegner: 1,
      status: 'beendet'
    }
  ],
  aufnahmen_141: [],
  rating: [
    { stichtag: '2026-09-01', disziplin: '9-ball', wert: 500, racks: 40, quelle: 'eigene-daten' },
    { stichtag: '2026-09-28', disziplin: '9-ball', wert: 520, racks: 48, quelle: 'eigene-daten' },
    { stichtag: '2026-09-28', disziplin: '8-ball', wert: 480, racks: 30, quelle: 'eigene-daten' }
  ],
  aenderungen: [
    {
      zeitpunkt: '2026-09-01T08:00:00Z',
      tabelle: 'personen',
      aktion: 'update',
      vorher: { vorname: 'Jürgen', status: 'gast', geaendert_am: 'a' },
      nachher: { vorname: 'Jürgen', status: 'mitglied', geaendert_am: 'b' }
    }
  ],
  aenderungen_durch_konto: { turnier_anmeldungen: 2 },
  ...weiteres
});

describe('Auskunft', () => {
  test('Aenderungen lesbar, technische Felder fehlen', () => {
    const [e] = auskunft().aenderungen;
    expect(aenderungText(e)).toBe('Status: von gast auf mitglied');
    expect(aenderungText({ ...e, aktion: 'insert' })).toBe('angelegt');
    expect(aenderungText({ ...e, aktion: 'delete' })).toBe('gelöscht');
  });

  test('Rating: nur der neueste Stand je Disziplin', () => {
    expect(aktuellesRating(auskunft().rating).map((r) => `${r.disziplin}:${r.wert}`)).toEqual(['8-ball:480', '9-ball:520']);
  });

  test('Dateiname ohne Sonderzeichen', () => {
    expect(auskunftDateiname(auskunft(), 'pdf')).toBe('Auskunft_2026-09-29_Juergen_Beispiel.pdf');
    expect(auskunftDateiname(auskunft(), 'json')).toBe('Auskunft_2026-09-29_Juergen_Beispiel.json');
  });

  test('PDF enthaelt die Abschnitte und nie ein Passwort', () => {
    const lesen = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);
    const inhalt = lesen(auskunftPdf(auskunft()));
    expect(inhalt.startsWith('%PDF-1.4')).toBe(true);
    expect(inhalt).toContain('(juergen@example.com)');
    expect(inhalt).toContain('(Max Muster)');
    expect(inhalt).toContain('(festgelegt \\(nur als Hash\\))');
    expect(inhalt).toContain('(Finale)');
  });

  test('ohne Konto und vertrauliche Angaben; viele Partien gehen auf weitere Seiten', () => {
    const partien = Array.from({ length: 120 }, () => auskunft().partien[0]);
    const inhalt = new TextDecoder('latin1').decode(auskunftPdf(auskunft({ konten: [], vertraulich: null, partien })));
    expect(inhalt).toContain('kein Konto verkn');
    expect(inhalt).toMatch(/\/Count [3-9]/);
  });
});
