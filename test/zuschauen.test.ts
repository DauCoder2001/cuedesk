import { describe, expect, test } from 'vitest';
import { anzeigeWaehlen, chatAn, ligaStand, ortsTag, spieltagGesamt, spiellage, tabellen } from '../src/zuschauen';
import type { Partie, Turnier, TurnierTeilnehmer } from '../src/datenbank.types';

const turnier = (id: string, weiteres: Partial<Turnier> = {}): Turnier => ({
  id,
  verein_id: 'v',
  name: `Turnier ${id}`,
  datum: '2026-09-30',
  disziplin: '9-ball',
  modus: 'einzelgruppe',
  teilnehmerzahl: null,
  serie_id: null,
  status: 'laeuft',
  rating_werten: false,
  eingefroren_am: null,
  einstellungen: {},
  quelle: 'cuedesk',
  alt_id: null,
  importiert_am: null,
  erstellt_am: '2026-09-30T10:00:00Z',
  ...weiteres
});

let lfd = 0;
const partie = (a: string, b: string, ea: number | null, eb: number | null, weiteres: Partial<Partie> = {}): Partie => ({
  id: `p${++lfd}`,
  verein_id: 'v',
  turnier_id: 't',
  disziplin: '9-ball',
  datum: '2026-09-30',
  phase: null,
  gruppe: null,
  runde: 1,
  paarung: 1,
  tisch_id: null,
  spieler_a: a,
  spieler_b: b,
  race_to: 5,
  vorgabe_a: 0,
  vorgabe_b: 0,
  ergebnis_a: ea,
  ergebnis_b: eb,
  status: 'beendet',
  rating_werten: false,
  rating_grund: null,
  begonnen: null,
  beendet: '2026-09-30T12:00:00',
  eingetragen_von: null,
  erstellt_am: '2026-09-30T10:00:00Z',
  ...weiteres
});

const teilnehmer = (person: string, startnummer: number, gruppe: string | null = null): TurnierTeilnehmer => ({
  turnier_id: 't',
  person_id: person,
  verein_id: 'v',
  startnummer,
  gruppe,
  gesetzt: false,
  endplatz: null,
  rating_eingefroren: null,
  rating_quelle: null
});

describe('Welches Turnier', () => {
  test('ohne laufendes Turnier nichts, ausser es ging vor weniger als einem Tag zu Ende', () => {
    const jetzt = Date.parse('2026-09-30T20:00:00Z');
    expect(anzeigeWaehlen([turnier('a', { status: 'beendet' })], jetzt)).toBeNull();
    const alt = turnier('alt', { status: 'beendet', beendet_am: '2026-09-29T19:00:00Z' });
    const frisch = turnier('frisch', { status: 'beendet', beendet_am: '2026-09-30T19:00:00Z' });
    expect(anzeigeWaehlen([alt], jetzt)).toBeNull();
    expect(anzeigeWaehlen([alt, frisch], jetzt)?.turnier.id).toBe('frisch');
    expect(anzeigeWaehlen([frisch, turnier('laeuft')], jetzt)?.turnier.id).toBe('laeuft');
  });
  test('das juengste laufende Turnier', () => {
    const a = anzeigeWaehlen([turnier('alt', { datum: '2026-09-01' }), turnier('neu')]);
    expect(a?.turnier.id).toBe('neu');
    expect(a?.chatTurnier.id).toBe('neu');
  });
  test('Liga: beide Begegnungen, Chat an der ersten, auch wenn die zweite laeuft', () => {
    const erste = turnier('b1', { modus: 'liga', status: 'beendet', einstellungen: { liga: { begegnung: 1, partner: 'b2' } } });
    const zweite = turnier('b2', { modus: 'liga', einstellungen: { liga: { begegnung: 2, partner: 'b1' }, chat: true } });
    const a = anzeigeWaehlen([erste, zweite]);
    expect(a?.turnier.id).toBe('b2');
    expect(a?.begegnungen.map((t) => t.id)).toEqual(['b1', 'b2']);
    expect(a?.chatTurnier.id).toBe('b1');
    expect(chatAn(zweite)).toBe(true);
    expect(chatAn(erste)).toBe(false);
  });
  test('Chat nur mit Live-Übertragung; die Einstellung bleibt gespeichert', () => {
    expect(chatAn(turnier('a', { einstellungen: { chat: true } }))).toBe(true);
    expect(chatAn(turnier('b', { einstellungen: { chat: true, live: true } }))).toBe(true);
    expect(chatAn(turnier('c', { einstellungen: { chat: true, live: false } }))).toBe(false);
    expect(chatAn(turnier('d', { einstellungen: { chat: false, live: true } }))).toBe(false);
  });
});

describe('Tabellen', () => {
  test('Einzelgruppe: Siege, dann Satzdifferenz', () => {
    const t = turnier('t');
    const tn = [teilnehmer('max', 1), teilnehmer('jan', 2), teilnehmer('uwe', 3)];
    const p = [partie('max', 'jan', 5, 3), partie('jan', 'uwe', 5, 0), partie('max', 'uwe', null, null, { status: 'geplant' })];
    const [tab] = tabellen(t, tn, p);
    expect(tab.gruppe).toBeNull();
    expect(tab.zeilen.map((z) => [z.personId, z.spiele, z.siege, z.diff])).toEqual([
      ['jan', 2, 1, 3],
      ['max', 1, 1, 2],
      ['uwe', 1, 0, -5]
    ]);
  });
  test('Zwei Gruppen je eine Tabelle, Liga keine', () => {
    const t = turnier('t', { modus: 'zwei-gruppen' });
    const tn = [teilnehmer('a1', 1, 'A'), teilnehmer('a2', 2, 'A'), teilnehmer('b1', 3, 'B'), teilnehmer('b2', 4, 'B')];
    const tabs = tabellen(t, tn, [partie('a2', 'a1', 5, 1, { gruppe: 'A' })]);
    expect(tabs.map((x) => x.gruppe)).toEqual(['A', 'B']);
    expect(tabs[0].zeilen[0].personId).toBe('a2');
    expect(tabellen(turnier('l', { modus: 'liga' }), tn, [])).toEqual([]);
  });
});

describe('Liga-Stand', () => {
  const b = turnier('t', { modus: 'liga', einstellungen: { liga: { heim: false, eigene: 'B&W 1', gegner: 'PBC' } } });
  test('Heim zuerst, nur beendete Partien, Matchpunkte erst am Ende', () => {
    const p = [partie('x', 'y', 5, 2), partie('x', 'y', 1, 5, { paarung: 2 }), partie('x', 'y', 3, 1, { paarung: 3, status: 'laeuft' })];
    const s = ligaStand(b, p, 'Verein');
    expect(s).toMatchObject({ heim: 'PBC', gast: 'B&W 1', partiepunkte: [1, 1], matchpunkte: null });
  });
  test('alle Partien entschieden', () => {
    const p = [partie('x', 'y', 5, 2), partie('x', 'y', 5, 1, { paarung: 2 })];
    expect(ligaStand(b, p, 'Verein').matchpunkte).toEqual([3, 0]);
  });
});

describe('Ergebnis des Spieltags', () => {
  // Wie TEST01: 1. Begegnung 2:6, Doppel 2:2, 3. Begegnung (Bassum Heim) 4:4
  const liga = (weiteres: Record<string, unknown>) => ({ liga: { eigene: 'B&W Verden 1', gegner: 'Schießbude Bassum', ...weiteres } });
  const b1 = turnier('b1', { modus: 'liga', einstellungen: liga({ heim: true }) });
  const d = turnier('d', { modus: 'liga', einstellungen: liga({ heim: true, art: 'doppel' }) });
  const b3 = turnier('b3', { modus: 'liga', einstellungen: liga({ heim: false }) });
  const reihe = (tid: string, siegeA: number, siegeB: number) => [
    ...Array.from({ length: siegeA }, (_, i) => partie('x', 'y', 4, 1, { turnier_id: tid, paarung: i + 1 })),
    ...Array.from({ length: siegeB }, (_, i) => partie('x', 'y', 1, 4, { turnier_id: tid, paarung: siegeA + i + 1 }))
  ];

  test('Summe der Begegnungen aus Sicht der Heimmannschaft der 1. Begegnung', () => {
    // 3. Begegnung: Bassum Heim gewinnt 4 Partien (Seite A), B&W 4 (Seite B)
    const p = [...reihe('b1', 2, 6), ...reihe('d', 2, 2), ...reihe('b3', 4, 4)];
    const g = spieltagGesamt([b1, d, b3], p, 'Verein');
    expect(g).toMatchObject({ links: 'B&W Verden 1', rechts: 'Schießbude Bassum', partiepunkte: [8, 12], matchpunkte: [2, 5], fertig: true });
    expect(g?.teile.map((t) => [t.titel, t.partiepunkte, t.matchpunkte])).toEqual([
      ['1. Begegnung', [2, 6], [0, 3]],
      ['2. Begegnung · Doppel', [2, 2], [1, 1]],
      ['3. Begegnung', [4, 4], [1, 1]]
    ]);
  });

  test('Rueckbegegnung wird umgedreht, offene Begegnung zaehlt noch keine Matchpunkte', () => {
    // 3. Begegnung: Bassum (Heim, Seite A) gewinnt 3, B&W 1, eine Partie offen
    const p = [...reihe('b1', 5, 3), ...reihe('b3', 3, 1), partie('x', 'y', null, null, { turnier_id: 'b3', paarung: 9, status: 'geplant' })];
    const g = spieltagGesamt([b1, b3], p, 'Verein');
    expect(g?.teile[1]).toMatchObject({ partiepunkte: [1, 3], matchpunkte: null });
    expect(g).toMatchObject({ partiepunkte: [6, 6], matchpunkte: [3, 0], fertig: false });
  });

  test('eine Begegnung allein: keine Gesamtuebersicht', () => {
    expect(spieltagGesamt([b1], [], 'Verein')).toBeNull();
  });
});

describe('Spiele', () => {
  test('laufend, naechste in Planreihenfolge, heute beendet neueste zuerst', () => {
    const p = [
      partie('a', 'b', 2, 1, { status: 'laeuft' }),
      partie('c', 'd', null, null, { status: 'geplant', runde: 2 }),
      partie('e', 'f', null, null, { status: 'geplant', runde: 1, paarung: 2 }),
      partie('g', 'h', 5, 3, { beendet: '2026-09-30T19:42:00' }),
      partie('i', 'j', 2, 5, { beendet: '2026-09-30T19:10:00' }),
      partie('k', 'l', 5, 0, { beendet: '2026-09-29T19:10:00' })
    ];
    const s = spiellage(p, '2026-09-30');
    expect(s.laufend.map((x) => x.spieler_a)).toEqual(['a']);
    expect(s.naechste.map((x) => x.spieler_a)).toEqual(['e', 'c']);
    expect(s.heute.map((x) => x.spieler_a)).toEqual(['g', 'i']);
    expect(ortsTag('2026-09-30T12:00:00')).toBe('2026-09-30');
  });
});
