import { describe, expect, test } from 'vitest';
import { deflateSync } from 'node:zlib';
import { inhaltTexte, ligaTeilen, mannschaftspassLesen, pdfTexte, spielerAbgleichen } from '../src/mannschaftspass';
import type { PassSpieler } from '../src/mannschaftspass';

// Nachbau eines Club-Cloud-Mannschaftspasses (FPDF) mit erfundenen Namen
const zelle = (x: number, y: number, b: number, text: string | null) =>
  text === null
    ? `${x} ${y} ${b} -22.68 re B \n`
    : `${x} ${y} ${b} -22.68 re B q 0 g BT ${x + 3} ${y - 14} Td (${text}) Tj ET Q\n`;
const kopf = (y: number) =>
  zelle(28.35, y, 45.35, 'Team') +
  zelle(73.7, y, 266.46, 'Name, Vorname') +
  zelle(340.16, y, 56.69, 'Pass-Nr.') +
  zelle(396.85, y, 56.69, 'DBU-Nr.') +
  zelle(453.55, y, 62.36, 'Berechtigt') +
  zelle(515.91, y, 51.02, 'Kapit\\344n');
const spieler = (y: number, team: string, name: string, pass: string, dbu: string, kapitaen: string | null = null) =>
  zelle(28.35, y, 45.35, team) +
  zelle(73.7, y, 266.46, name) +
  zelle(340.16, y, 56.69, pass) +
  zelle(396.85, y, 56.69, dbu) +
  zelle(453.55, y, 62.36, '07.09.2026') +
  zelle(515.91, y, 51.02, kapitaen);

const INHALT =
  'BT 102.05 805.91 Td (Billard Landesverband Musterland e.V.) Tj ET\n' +
  'BT 102.05 772.79 Td (Mannschaftspass BC Musterstadt \\(2026/2027\\) -  Pool: Mannschaft) Tj ET\n' +
  zelle(28.35, 737.01, 538.58, 'Landesliga Nord / S\\374d \\(Vereinsheim, Am Markt 1, 12345 Musterstadt\\)') +
  kopf(714.33) +
  spieler(691.65, '1', 'Muster, Max', '101', '9001', 'X') +
  spieler(668.98, '1', 'Beispiel, Erika', '102', '9002') +
  zelle(28.35, 578.27, 538.58, 'Kreisklasse OH / A \\(Vereinsheim\\)') +
  kopf(555.59) +
  spieler(532.91, '2', 'M\\374ller-L\\374denscheidt, Hans Peter', '', '9003') +
  zelle(28.35, 400, 538.58, 'Oberliga West') +
  kopf(380) +
  spieler(360, '3', 'van Test, Jan', '104', '9004');

describe('Mannschaftspass lesen', () => {
  const pass = mannschaftspassLesen(inhaltTexte(INHALT, 1));

  test('Verein und Saison aus dem Titel', () => {
    expect(pass?.verein).toBe('BC Musterstadt');
    expect(pass?.saison).toBe('2026/27');
  });

  test('Mannschaften mit Liga und Staffel, Spiellokal weggelassen', () => {
    expect(pass?.mannschaften.map((m) => [m.nummer, m.liga, m.staffel])).toEqual([
      [1, 'landesliga', 'Nord / Süd'],
      [2, 'kreisklasse', 'OH / A'],
      [3, null, 'Oberliga West']
    ]);
  });

  test('Spieler mit Nummern, Datum und Kapitän', () => {
    expect(pass?.mannschaften[0].spieler).toEqual([
      {
        vorname: 'Max',
        nachname: 'Muster',
        passnummer: '101',
        dbu_nummer: '9001',
        berechtigt_ab: '2026-09-07',
        kapitaen: true,
        position: 1
      },
      {
        vorname: 'Erika',
        nachname: 'Beispiel',
        passnummer: '102',
        dbu_nummer: '9002',
        berechtigt_ab: '2026-09-07',
        kapitaen: false,
        position: 2
      }
    ]);
  });

  test('Umlaute, Doppelnamen und fehlende Pass-Nr.', () => {
    const s = pass?.mannschaften[1].spieler[0];
    expect([s?.vorname, s?.nachname, s?.passnummer]).toEqual(['Hans Peter', 'Müller-Lüdenscheidt', null]);
  });

  test('anderes Dokument: kein Pass', () => {
    expect(mannschaftspassLesen(inhaltTexte('BT 10 10 Td (Rechnung Nr. 5) Tj ET', 1))).toBeNull();
  });
});

describe('PDF-Datei', () => {
  test('gepackter Seiteninhalt wird gelesen', async () => {
    const gepackt = deflateSync(Buffer.from(INHALT, 'latin1'));
    const kopfteil = `%PDF-1.3\n3 0 obj\n<</Filter /FlateDecode /Length ${gepackt.length}>>\nstream\n`;
    const bytes = Buffer.concat([
      Buffer.from(kopfteil, 'latin1'),
      gepackt,
      Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1')
    ]);
    const pass = mannschaftspassLesen(await pdfTexte(new Uint8Array(bytes)));
    expect(pass?.mannschaften.flatMap((m) => m.spieler).length).toBe(4);
  });
});

describe('Liga und Staffel', () => {
  test('bekannte Liga', () => {
    expect(ligaTeilen('Kreisliga OH')).toEqual({ liga: 'kreisliga', staffel: 'OH' });
    expect(ligaTeilen('Bezirksliga')).toEqual({ liga: 'bezirksliga', staffel: null });
  });
  test('unbekannte Liga bleibt als Staffeltext', () => {
    expect(ligaTeilen('Verbandsliga Nord')).toEqual({ liga: null, staffel: 'Verbandsliga Nord' });
  });
});

describe('Abgleich mit den Spielern des Vereins', () => {
  const s = (vorname: string, nachname: string, passnummer: string | null, dbu_nummer: string | null): PassSpieler => ({
    vorname,
    nachname,
    passnummer,
    dbu_nummer,
    berechtigt_ab: null,
    kapitaen: false,
    position: 1
  });
  const personen = [
    { id: 'a', vorname: 'Max', nachname: 'Muster', passnummer: null, dbu_nummer: '9001' },
    { id: 'b', vorname: 'Erika', nachname: 'B.', passnummer: '102', dbu_nummer: null },
    { id: 'c', vorname: 'Jan', nachname: 'van Test', passnummer: null, dbu_nummer: null },
    { id: 'd', vorname: 'Otto', nachname: 'O.', passnummer: null, dbu_nummer: null },
    { id: 'e', vorname: 'Uwe', nachname: 'Anders', passnummer: null, dbu_nummer: '7777' }
  ];

  test('DBU-Nr. vor Pass-Nr. vor Name', () => {
    expect(spielerAbgleichen(s('Maximilian', 'Muster', '999', '9001'), personen)).toEqual({ art: 'dbu', person_id: 'a' });
    expect(spielerAbgleichen(s('Erika', 'Beispiel', '102', '9002'), personen)).toEqual({ art: 'pass', person_id: 'b' });
    expect(spielerAbgleichen(s('jan', 'Van Test', '104', '9004'), personen)).toEqual({ art: 'name', person_id: 'c' });
  });

  test('abgekürzter Nachname ist ähnlich', () => {
    expect(spielerAbgleichen(s('Otto', 'Olsen', '105', '9005'), personen)).toEqual({ art: 'aehnlich', person_id: 'd' });
  });

  test('gleicher Name, aber andere DBU-Nr.: neu', () => {
    expect(spielerAbgleichen(s('Uwe', 'Anders', '106', '9006'), personen)).toEqual({ art: 'neu' });
  });
});
