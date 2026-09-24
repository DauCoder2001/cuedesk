import { describe, expect, test } from 'vitest';
import { spielberichtLesen } from '../src/spielbericht';

// Aufbau wie in den veroeffentlichten Berichten des BLVN
// (https://billard-niedersachsen.de/sb_spielbericht.php?p=...). Die Namen sind
// erfunden, die Struktur ist aus zwei echten Berichten uebernommen.
const bericht = [
  'Partie-Nr.\tHeim-Mannschaft\t\tGast-Mannschaft\tDatum',
  '7001\t',
  'BC Beispiel 6\t',
  '\t:\t',
  '\tSV Muster 7',
  '\t25.10.2025',
  '\tRunde 1\tHeim-Spieler\tErg.\tGast-Spieler\tPunkte',
  '1\t14/1e\tHeimspieler Eins\t0:1\tGastspieler Eins\t0:1',
  '\t\tPunkte: 52:58  Aufn.: 25  HS: 6/11  GD: 2.08/2.32',
  '2\t8-Ball\tHeimspieler Zwei\t4:3\tGastspieler Zwei\t1:0',
  '3\t9-Ball\tHeimspieler Drei\t5:6\tGastspieler Drei\t0:1',
  '4\t10-Ball\tHeimspieler Vier\t3:5\tGastspieler Vier\t0:1',
  '\tRunde 2\tHeim-Spieler\tErg.\tGast-Spieler\tPunkte',
  '5\t14/1e\tHeimspieler Drei\t1:0\tGastspieler Fuenf\t1:0',
  '\t\tPunkte: 58:52  Aufn.: 20  HS: 11/10  GD: 2.90/2.60',
  '6\t10-Ball\tHeimspieler Zwei\t2:5\tGastspieler Drei\t0:1',
  '7\t9-Ball\tHeimspieler Vier\t3:6\tGastspieler Vier\t0:1',
  '8\t8-Ball\tHeimspieler Eins\t4:2\tGastspieler Eins\t1:0',
  'Endstand:\t3:5'
].join('\n');

describe('Spielbericht des Verbands', () => {
  const gelesen = spielberichtLesen(bericht);

  test('Mannschaften, Datum und Nummer', () => {
    expect(gelesen).toMatchObject({
      heimMannschaft: 'BC Beispiel 6',
      gastMannschaft: 'SV Muster 7',
      datum: '2025-10-25',
      nummer: '7001',
      endstand: [3, 5]
    });
  });

  test('acht Partien in der Reihenfolge des Berichts', () => {
    expect(gelesen?.partien.map((p) => [p.nr, p.disziplin])).toEqual([
      [1, '14-1'],
      [2, '8-ball'],
      [3, '9-ball'],
      [4, '10-ball'],
      [5, '14-1'],
      [6, '10-ball'],
      [7, '9-ball'],
      [8, '8-ball']
    ]);
    // Rueckrunde: Nummer 6 ist Paarung 2
    expect(gelesen?.partien[5]).toMatchObject({ runde: 'rueck', paarung: 2 });
  });

  test('Saetze und Namen je Partie', () => {
    expect(gelesen?.partien[1]).toMatchObject({
      heim: 'Heimspieler Zwei',
      gast: 'Gastspieler Zwei',
      ergebnis: [4, 3]
    });
  });

  test('bei 14.1 zaehlen die Punkte, dazu Aufnahmen und Hoechstserien', () => {
    expect(gelesen?.partien[0]).toMatchObject({
      heim: 'Heimspieler Eins',
      ergebnis: [52, 58],
      punkte: [52, 58],
      aufnahmen: 25,
      hoechstserien: [6, 11]
    });
    expect(gelesen?.partien[4]).toMatchObject({ ergebnis: [58, 52], aufnahmen: 20 });
  });

  test('ein noch nicht gespielter Bericht liefert leere Ergebnisse', () => {
    const leer = [
      'Partie-Nr.\tHeim-Mannschaft\t\tGast-Mannschaft\tDatum',
      '7010\t',
      'BC Beispiel 6\t',
      '\t:\t',
      '\tSV Muster 7',
      '\t17.10.2026',
      '\tRunde 1\tHeim-Spieler\tErg.\tGast-Spieler\tPunkte',
      '1\t14/1e\t\t0:0\t\t0:0',
      '2\t8-Ball\t\t0:0\t\t0:0',
      'Endstand:\t0:0'
    ].join('\n');
    const x = spielberichtLesen(leer);
    expect(x?.partien.every((p) => p.ergebnis === null)).toBe(true);
    expect(x?.datum).toBe('2026-10-17');
  });

  test('Kopfzeile wie auf der echten Seite: Mannschaften stehen doppelt', () => {
    const echteForm = [
      'Partie-Nr.\tHeim-Mannschaft\t\tGast-Mannschaft\tDatum',
      '7001\tBC Beispiel 6\tBC Beispiel 6\t\t:\tSV Muster 7\t\tSV Muster 7\t25.10.2025',
      'BC Beispiel 6\t',
      '\tSV Muster 7',
      '\tRunde 1\tHeim-Spieler\tErg.\tGast-Spieler\tPunkte',
      '1\t14/1e\tHeimspieler Eins\t0:1\tGastspieler Eins\t0:1',
      '\t\tPunkte: 52:58 Aufn.: 25 HS: 6/11 GD: 2.08/2.32',
      '2\t8-Ball\tHeimspieler Zwei\t4:3\tGastspieler Zwei\t1:0',
      'Endstand:\t1:1'
    ].join('\n');
    expect(spielberichtLesen(echteForm)).toMatchObject({
      heimMannschaft: 'BC Beispiel 6',
      gastMannschaft: 'SV Muster 7',
      datum: '2025-10-25',
      nummer: '7001'
    });
  });

  test('Text ohne Bericht ergibt nichts', () => {
    expect(spielberichtLesen('Keine Rangliste vorhanden')).toBeNull();
  });
});
