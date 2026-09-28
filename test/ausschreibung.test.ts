import { describe, expect, test } from 'vitest';
import {
  alsEingabe,
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

describe('Aushang', () => {
  test('Umbruch langer Zeilen', () => {
    const zeilen = umbrechen('eins zwei drei vier fünf sechs sieben acht', 60, 12, false);
    expect(zeilen.length).toBeGreaterThan(1);
    expect(zeilen.join(' ')).toBe('eins zwei drei vier fünf sechs sieben acht');
  });
  test('PDF entsteht; Dateiname ohne Sonderzeichen', () => {
    const pdf = aushangPdf(daten({ uhrzeit: '19:00', hoechstens: 8 }));
    expect(new TextDecoder('latin1').decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    expect(aushangDateiname('Größtes Turnier 2026!', '2026-10-09')).toBe('Ausschreibung_2026-10-09_Groesstes_Turnier_2026.pdf');
  });
});
