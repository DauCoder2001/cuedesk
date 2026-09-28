import { describe, expect, test } from 'vitest';
import {
  alsEingabe,
  anmeldeLink,
  anmeldestand,
  anmeldungOffen,
  ausEingabe,
  aushangDateiname,
  aushangPdf,
  ausschreibungText,
  meldeschlussText,
  meldeschlussVorschlag,
  umbrechen
} from '../src/ausschreibung';
import type { AusschreibungDaten } from '../src/ausschreibung';

const daten = (a: AusschreibungDaten['ausschreibung'] = {}): AusschreibungDaten => ({
  verein: 'BC Musterstadt',
  name: '9-Ball Vereinsmeisterschaft',
  datum: '2026-10-09',
  art: 'Vereinsmeisterschaft',
  spielweise: '9-Ball · Gruppen mit KO · Race to 5 · mit Vorgabe',
  ausschreibung: a
});

describe('Meldeschluss', () => {
  test('Vorschlag: eine Stunde vor Beginn', () => {
    const iso = meldeschlussVorschlag('2026-10-09', '19:00') as string;
    expect(alsEingabe(iso)).toBe('2026-10-09T18:00');
  });
  test('kurz nach Mitternacht rutscht auf den Vortag', () => {
    expect(alsEingabe(meldeschlussVorschlag('2026-10-09', '0:30') as string)).toBe('2026-10-08T23:30');
  });
  test('ungültige Uhrzeit: kein Vorschlag', () => {
    expect(meldeschlussVorschlag('2026-10-09', '25:00')).toBeNull();
  });
  test('Eingabefeld hin und zurück', () => {
    expect(alsEingabe(ausEingabe('2026-10-08T20:15'))).toBe('2026-10-08T20:15');
    expect(ausEingabe('')).toBeUndefined();
  });
  test('am Turniertag nur die Uhrzeit, sonst mit Tag', () => {
    expect(meldeschlussText(ausEingabe('2026-10-09T18:00') as string, '2026-10-09')).toBe('18:00 Uhr');
    expect(meldeschlussText(ausEingabe('2026-10-08T20:00') as string, '2026-10-09')).toBe('Do., 08.10. 20:00 Uhr');
  });
});

describe('Text zum Teilen', () => {
  test('alle Angaben', () => {
    const text = ausschreibungText(
      daten({
        uhrzeit: '19:00',
        meldeschluss: ausEingabe('2026-10-09T18:00'),
        startgeld: '5 €',
        hoechstens: 16,
        hinweis: 'Bitte 15 Minuten vorher da sein.'
      })
    );
    expect(text).toBe(
      [
        '*9-Ball Vereinsmeisterschaft*',
        'Fr., 09.10.2026, Beginn 19:00 Uhr',
        '9-Ball · Gruppen mit KO · Race to 5 · mit Vorgabe',
        'Meldeschluss: 18:00 Uhr',
        'Startgeld: 5 €',
        'Höchstens 16 Teilnehmer',
        '',
        'Bitte 15 Minuten vorher da sein.',
        '',
        'Wer ist dabei? Bitte bis zum Meldeschluss melden.',
        'Gut Stoß!'
      ].join('\n')
    );
  });

  test('ohne Angaben; Turnierart, die nicht im Namen steht', () => {
    const text = ausschreibungText({ ...daten(), name: 'Herbstturnier', link: 'https://x.de/?anmeldung=1' });
    expect(text.split('\n')).toEqual([
      '*Herbstturnier*',
      'Vereinsmeisterschaft',
      'Fr., 09.10.2026',
      '9-Ball · Gruppen mit KO · Race to 5 · mit Vorgabe',
      '',
      'Anmelden: https://x.de/?anmeldung=1',
      'Gut Stoß!'
    ]);
  });
});

describe('Anmeldung', () => {
  const jetzt = new Date('2026-10-09T12:00:00Z');
  test('offen nur mit Schalter, in Vorbereitung und vor dem Meldeschluss', () => {
    expect(anmeldungOffen({ offen: true }, 'geplant', jetzt)).toBe(true);
    expect(anmeldungOffen({ offen: false }, 'geplant', jetzt)).toBe(false);
    expect(anmeldungOffen({ offen: true }, 'laeuft', jetzt)).toBe(false);
    expect(anmeldungOffen({ offen: true, meldeschluss: '2026-10-09T13:00:00Z' }, 'geplant', jetzt)).toBe(true);
    expect(anmeldungOffen({ offen: true, meldeschluss: '2026-10-09T11:00:00Z' }, 'geplant', jetzt)).toBe(false);
    expect(anmeldungOffen(undefined, 'geplant', jetzt)).toBe(false);
  });
  test('Link ersetzt vorhandene Parameter', () => {
    expect(anmeldeLink('https://x.github.io/cuedesk/?geraet=1#oben', 'abc')).toBe('https://x.github.io/cuedesk/?anmeldung=abc');
  });
  test('Reihenfolge, Nachrücker ab der Höchstzahl, Abgemeldete am Ende', () => {
    const stand = anmeldestand(
      [
        { person_id: 'c', angemeldet_am: '2026-10-03T10:00:00Z', abgemeldet_am: null },
        { person_id: 'a', angemeldet_am: '2026-10-01T10:00:00Z', abgemeldet_am: null },
        { person_id: 'x', angemeldet_am: '2026-10-01T09:00:00Z', abgemeldet_am: '2026-10-02T09:00:00Z' },
        { person_id: 'b', angemeldet_am: '2026-10-02T10:00:00Z', abgemeldet_am: null }
      ],
      2
    );
    expect(stand.map((s) => `${s.person_id}:${s.art}`)).toEqual(['a:dabei', 'b:dabei', 'c:nachruecker', 'x:abgemeldet']);
  });
});

describe('Aushang', () => {
  test('Umbruch langer Zeilen', () => {
    const zeilen = umbrechen('eins zwei drei vier fünf sechs sieben acht', 60, 12, false);
    expect(zeilen.length).toBeGreaterThan(1);
    expect(zeilen.join(' ')).toBe('eins zwei drei vier fünf sechs sieben acht');
  });
  test('Eingetragene stehen im Aushang; viele gehen auf eine zweite Seite', () => {
    const lesen = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);
    const kurz = lesen(aushangPdf({ ...daten({ hoechstens: 8 }), eingetragen: ['Erika Beispiel', 'Max Muster'] }));
    expect(kurz).toContain('(Erika Beispiel)');
    expect(kurz).toContain('/Count 1');
    const viele = Array.from({ length: 30 }, (_, i) => `Spieler ${i + 1}`);
    const lang = lesen(aushangPdf({ ...daten(), eingetragen: viele }));
    expect(lang).toContain('(Spieler 30)');
    expect(lang).toContain('/Count 2');
  });
  test('PDF entsteht; Dateiname ohne Sonderzeichen', () => {
    const pdf = aushangPdf(daten({ uhrzeit: '19:00', hoechstens: 8 }));
    expect(new TextDecoder('latin1').decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    expect(aushangDateiname('Größtes Turnier 2026!', '2026-10-09')).toBe('Ausschreibung_2026-10-09_Groesstes_Turnier_2026.pdf');
  });
});
