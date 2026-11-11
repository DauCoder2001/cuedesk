import { describe, expect, test } from 'vitest';
import { gastAnzeigename, gegnerName, passendeMannschaften } from '../src/gegner-pass';
import type { Mannschaftspass } from '../src/mannschaftspass';

// Erfundener Pass, Aufbau wie Club-Cloud (Liga und Staffel je Mannschaft)
const pass: Mannschaftspass = {
  verein: 'BC Beispiel',
  saison: '2026/27',
  mannschaften: [
    { nummer: 1, ligaText: 'Verbandsliga West', liga: null, staffel: 'Verbandsliga West', spieler: [] },
    { nummer: 3, ligaText: 'Bezirksliga Osnabrück / Huntegau', liga: 'bezirksliga', staffel: 'Osnabrück / Huntegau', spieler: [] },
    { nummer: 4, ligaText: 'Bezirksliga Osnabrück / Huntegau', liga: 'bezirksliga', staffel: 'Osnabrück / Huntegau', spieler: [] },
    { nummer: 5, ligaText: 'Kreisklasse OH / B', liga: 'kreisklasse', staffel: 'OH / B', spieler: [] },
    { nummer: 6, ligaText: 'Kreisklasse OH / A', liga: 'kreisklasse', staffel: 'OH / A', spieler: [] }
  ]
};

describe('Gegner aus dem Mannschaftspass', () => {
  test('Anzeigename: Vorname und erster Buchstabe des Nachnamens', () => {
    expect(gastAnzeigename('Max', 'Mustermann')).toBe('Max M.');
    expect(gastAnzeigename(' Anna-Lena ', 'von Beispiel')).toBe('Anna-Lena V.');
    expect(gastAnzeigename('Olli', '')).toBe('Olli');
    expect(gastAnzeigename('', 'Meier')).toBe('Meier');
  });

  test('Liga und Staffel der eigenen Mannschaft waehlen genau eine Mannschaft', () => {
    expect(passendeMannschaften(pass, 'kreisklasse', 'OH / B').map((m) => m.nummer)).toEqual([5]);
    expect(passendeMannschaften(pass, 'kreisklasse', 'oh /  b').map((m) => m.nummer)).toEqual([5]);
  });

  test('mehrere in derselben Staffel, nur die Liga oder gar keine', () => {
    expect(passendeMannschaften(pass, 'bezirksliga', 'Osnabrück / Huntegau').map((m) => m.nummer)).toEqual([3, 4]);
    expect(passendeMannschaften(pass, 'kreisklasse', 'OH / C').map((m) => m.nummer)).toEqual([5, 6]);
    expect(passendeMannschaften(pass, 'landesliga', null)).toEqual([]);
  });

  test('Gegnername aus Verein und Nummer im Pass', () => {
    expect(gegnerName(pass, pass.mannschaften[3])).toBe('BC Beispiel 5');
  });
});
