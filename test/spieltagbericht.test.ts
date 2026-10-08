import { describe, expect, test } from 'vitest';
import { spieltagBerichtDaten, spieltagBerichtDateiname, spieltagBerichtPdf } from '../src/spieltagbericht';
import type { Partie, Turnier } from '../src/datenbank.types';

const ziele = { punkte141: 60, aufnahmen141: 25, '8-ball': 4, '9-ball': 5, '10-ball': 4 };
const turnier = (id: string, liga: Record<string, unknown>): Turnier => ({
  id,
  verein_id: 'v',
  name: id === 'b1' ? 'Spaß-Liga · 1. Spieltag' : `Teil ${id}`,
  datum: '2026-10-08',
  disziplin: '8-ball',
  modus: 'liga',
  teilnehmerzahl: null,
  serie_id: null,
  status: 'beendet',
  rating_werten: false,
  eingefroren_am: null,
  einstellungen: { liga: { eigene: 'B&W Verden 1', gegner: 'Schießbude Bassum', ...liga } },
  quelle: 'cuedesk',
  alt_id: null,
  importiert_am: null,
  erstellt_am: '2026-10-08T10:00:00Z'
});

let lfd = 0;
const partie = (tid: string, runde: number, paarung: number, a: string, b: string, ea: number, eb: number, weiteres: Partial<Partie> = {}): Partie => ({
  id: `p${++lfd}`,
  verein_id: 'v',
  turnier_id: tid,
  disziplin: '8-ball',
  datum: '2026-10-08',
  phase: null,
  gruppe: null,
  runde,
  paarung,
  tisch_id: null,
  spieler_a: a,
  spieler_b: b,
  race_to: null,
  vorgabe_a: 0,
  vorgabe_b: 0,
  ergebnis_a: ea,
  ergebnis_b: eb,
  status: 'beendet',
  rating_werten: false,
  rating_grund: null,
  begonnen: null,
  beendet: '2026-10-08T12:00:00Z',
  eingetragen_von: null,
  erstellt_am: '2026-10-08T10:00:00Z',
  partner_a: null,
  partner_b: null,
  doppel: false,
  ...weiteres
});

const namen: Record<string, string> = { frank: 'Frank F.', kura: 'Kura (Bassum)', zeki: 'Zeki', olli: 'Olli G.' };
const name = (id: string) => namen[id] ?? id;

describe('Spielbericht des Spieltags', () => {
  const b1 = turnier('b1', { heim: true, ziele });
  const d = turnier('d', { heim: true, art: 'doppel', doppelPlan: [{ disziplin: '8-ball', ziel: 3 }, { disziplin: '10-ball', ziel: 3 }] });
  const b3 = turnier('b3', { heim: false, ziele });
  const p = [
    partie('b1', 1, 1, 'frank', 'kura', 40, 60),
    partie('b1', 1, 2, 'olli', 'kura', 4, 1),
    partie('d', 1, 1, 'frank', 'kura', 1, 3, { doppel: true, partner_a: 'zeki', partner_b: 'olli' }),
    partie('d', 1, 2, 'olli', 'kura', 2, 3, { doppel: true }), // beide Seiten mit Geist
    partie('b3', 1, 1, 'kura', 'zeki', 60, 48)
  ];

  test('Daten: Uebersicht, Runden, Doppel mit Partner und Geist', () => {
    const b = spieltagBerichtDaten([b1, d, b3], p, 'Verein', name, 'Do., 08.10.2026')!;
    expect(b.titel).toBe('Spaß-Liga · 1. Spieltag');
    expect(b.uebersicht.map((u) => u.titel)).toEqual(['1. Begegnung', '2. Begegnung · Doppel', '3. Begegnung']);
    expect(b.begegnungen[0].runden.map((r) => [r.name, r.partien.length])).toEqual([['Hinrunde', 4], ['Rückrunde', 4]]);
    expect(b.begegnungen[0].runden[0].partien[0]).toEqual({
      nr: 1,
      disziplin: '14.1-endlos 60 Pkt. / 25 Aufn.',
      heim: 'Frank F.',
      gast: 'Kura (Bassum)',
      ergebnis: '40 : 60'
    });
    expect(b.begegnungen[0].runden[0].partien[2]).toMatchObject({ heim: '', gast: '', ergebnis: '' }); // noch nicht angelegt
    expect(b.begegnungen[1].runden).toHaveLength(1);
    expect(b.begegnungen[1].runden[0].partien.map((x) => [x.disziplin, x.heim, x.gast])).toEqual([
      ['8-Ball Race to 3', 'Frank F. / Zeki', 'Kura (Bassum) / Olli G.'],
      ['10-Ball Race to 3', 'Olli G. / Geist', 'Kura (Bassum) / Geist']
    ]);
    // 3. Begegnung: Bassum ist Heim
    expect(b.begegnungen[2]).toMatchObject({ heim: 'Schießbude Bassum', gast: 'B&W Verden 1', partiepunkte: [1, 0] });
  });

  test('PDF wird gebaut, Dateiname ohne Sonderzeichen', () => {
    const b = spieltagBerichtDaten([b1, d, b3], p, 'Verein', name, 'Do., 08.10.2026')!;
    const bytes = spieltagBerichtPdf(b);
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(spieltagBerichtDateiname(b.titel, '2026-10-08')).toBe('Spielbericht_Spass-Liga_1_Spieltag_2026-10-08.pdf');
  });

  test('nur eine Begegnung: kein Spieltagsbericht', () => {
    expect(spieltagBerichtDaten([b1], p, 'Verein', name, '')).toBeNull();
  });
});
