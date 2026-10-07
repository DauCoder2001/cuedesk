import { describe, expect, test } from 'vitest';
import {
  doppelBegegnungIds,
  doppelPlanAendern,
  doppelPlanAusEingabe,
  doppelSeitePruefen,
  doppelSpielplan,
  doppelVon,
  istDoppelBegegnung,
  spieltagStand,
  zweiteBegegnungIds
} from '../src/liga';
import { archivFiltern, direktvergleich, platzText, spieltageZusammenfassen } from '../src/archiv';
import { saisonUeberblick } from '../src/saison-ueberblick';
import { anzeigeWaehlen, paarungText } from '../src/zuschauen';
import { kachel } from '../src/live';
import { tabletSpielplan } from '../scoreboards/js/turnier-plan';
import type { ArchivPartie, ArchivTurnier } from '../src/archiv';
import type { Turnier } from '../src/datenbank.types';

// Spieltag: 1. Begegnung b1, Doppel d, gespeicherte 2. Begegnung b2
const teil = (id: string, liga: Record<string, unknown>, status = 'geplant') => ({
  id,
  status: status as Turnier['status'],
  einstellungen: { liga }
});
const b1 = teil('b1', { begegnung: 1, partner: 'b2', doppel: 'd' });
const b2 = teil('b2', { begegnung: 2, partner: 'b1' });
const d = teil('d', { begegnung: 1, art: 'doppel', haupt: 'b1' });

describe('Doppel-Begegnung: Plan und Pruefung', () => {
  test('Spielplan aus der Partienliste, eine Runde', () => {
    expect(doppelSpielplan([{ disziplin: '8-ball', ziel: 4 }, { disziplin: '10-ball', ziel: 3 }])).toEqual([
      { nr: 1, runde: 'hin', paarung: 1, disziplin: '8-ball', ziel: 4, aufnahmen: null },
      { nr: 2, runde: 'hin', paarung: 2, disziplin: '10-ball', ziel: 3, aufnahmen: null }
    ]);
  });

  test('Eingabe: mindestens eine Partie, Race to 1 bis 25', () => {
    expect(doppelPlanAusEingabe([]).fehler).toMatch(/mindestens eine/);
    expect(doppelPlanAusEingabe([{ disziplin: '9-ball', ziel: '0' }]).fehler).toMatch(/zwischen 1 und 25/);
    expect(doppelPlanAusEingabe([{ disziplin: '9-ball', ziel: 'x' }]).fehler).toMatch(/zwischen 1 und 25/);
    expect(doppelPlanAusEingabe([{ disziplin: '9-ball', ziel: '5' }]).plan).toEqual([{ disziplin: '9-ball', ziel: 5 }]);
  });

  test('derselbe Spieler zweimal auf einer Seite', () => {
    expect(doppelSeitePruefen(2, 'f', 'f', () => 'Frank F.')).toBe('Doppel 2: Frank F. steht zweimal auf derselben Seite.');
    expect(doppelSeitePruefen(2, 'f', 'v', () => '')).toBeNull();
    expect(doppelSeitePruefen(2, 'f', null, () => '')).toBeNull();
  });
});

describe('Doppel-Partien nachtraeglich aendern', () => {
  const alt = [
    { disziplin: '8-ball' as const, ziel: 4 },
    { disziplin: '10-ball' as const, ziel: 4 },
    { disziplin: '9-ball' as const, ziel: 3 }
  ];
  const offen = (paarung: number) => ({ paarung, gespielt: false, amTisch: false });

  test('Reihenfolge tauschen, eine entfernen, eine neu: Partien folgen ihrer Zeile', () => {
    const r = doppelPlanAendern(
      [
        { disziplin: '10-ball', ziel: 4, herkunft: 2 },
        { disziplin: '8-ball', ziel: 5, herkunft: 1 },
        { disziplin: '9-ball', ziel: 4 }
      ],
      alt,
      [offen(1), offen(2), offen(3)]
    );
    expect(r.fehler).toBeNull();
    expect(r.aenderung?.folgen).toEqual([
      { von: 2, nach: 1, disziplin: '10-ball', ziel: 4 },
      { von: 1, nach: 2, disziplin: '8-ball', ziel: 5 }
    ]);
    expect(r.aenderung?.entfallen).toEqual([3]);
    expect(r.aenderung?.plan).toHaveLength(3);
  });

  test('mit Ergebnis: verschieben ja, aendern und entfernen nein', () => {
    const gespielt = { paarung: 1, gespielt: true, amTisch: false };
    expect(doppelPlanAendern([alt[1], { ...alt[0], herkunft: 1 }].map((z, i) => ({ ...z, herkunft: i === 0 ? 2 : 1 })), alt.slice(0, 2), [gespielt]).fehler).toBeNull();
    expect(doppelPlanAendern([{ disziplin: '8-ball', ziel: 5, herkunft: 1 }], alt.slice(0, 1), [gespielt]).fehler).toMatch(/schon ein Ergebnis/);
    expect(doppelPlanAendern([{ disziplin: '10-ball', ziel: 4, herkunft: 2 }], alt.slice(0, 2), [gespielt]).fehler).toMatch(/nicht entfernen/);
  });

  test('am Tisch: nichts aendern', () => {
    const tisch = { paarung: 2, gespielt: false, amTisch: true };
    expect(doppelPlanAendern([{ disziplin: '8-ball', ziel: 4, herkunft: 1 }], alt.slice(0, 2), [tisch]).fehler).toMatch(/am Tisch/);
    expect(doppelPlanAendern([{ disziplin: '10-ball', ziel: 4, herkunft: 2 }, { disziplin: '8-ball', ziel: 4, herkunft: 1 }], alt.slice(0, 2), [tisch]).fehler).toMatch(/am Tisch/);
  });
});

describe('Doppel-Begegnung im Spieltag', () => {
  test('gefunden ueber die 1. und die 2. Begegnung, nur mit Rueckverweis', () => {
    expect(doppelVon(b1, [b1, b2, d])?.id).toBe('d');
    expect(doppelVon(b2, [b1, b2, d])?.id).toBe('d');
    expect(doppelVon(b1, [b1, b2, teil('d', { art: 'doppel', haupt: 'anders' })])).toBeNull();
    expect(istDoppelBegegnung(d)).toBe(true);
    expect(istDoppelBegegnung(b1)).toBe(false);
  });

  test('in Listen keine eigene Zeile', () => {
    expect([...doppelBegegnungIds([b1, b2, d])]).toEqual(['d']);
    expect([...zweiteBegegnungIds([b1, b2, d])]).toEqual(['b2']);
    // Fehlt die 1. Begegnung, bleibt das Doppel sichtbar
    expect([...doppelBegegnungIds([d])]).toEqual([]);
  });

  test('Stand des Spieltags zaehlt das Doppel mit', () => {
    expect(spieltagStand('beendet', 'beendet', 'geplant')).toEqual({ status: 'geplant', teilBeendet: null });
    expect(spieltagStand('beendet', 'geplant', 'laeuft')).toEqual({ status: 'laeuft', teilBeendet: null });
    expect(spieltagStand('beendet', 'beendet', 'beendet')).toEqual({ status: 'beendet', teilBeendet: null });
    // gespeicherte 2. Begegnung fertig, 1. offen: mit Doppel heisst sie "3."
    expect(spieltagStand('geplant', 'beendet', 'beendet')).toEqual({ status: 'geplant', teilBeendet: 3 });
    expect(spieltagStand('beendet', 'geplant', 'beendet')).toEqual({ status: 'geplant', teilBeendet: 1 });
  });
});

describe('Doppel am Tablet', () => {
  test('je Seite "A / B", Vereinszusatz faellt weg', () => {
    const namen: Record<string, string> = { f: 'Frank F.', v: 'Volker B.', m: 'Meier (Bassum)', k: 'Kurz (Bassum)' };
    const plan = tabletSpielplan(
      [
        {
          id: 'p1',
          spieler_a: 'f',
          spieler_b: 'm',
          partner_a: 'v',
          partner_b: 'k',
          race_to: 4,
          vorgabe_a: 0,
          vorgabe_b: 0,
          status: 'geplant',
          tisch_id: null,
          runde: 1,
          begonnen: null,
          disziplin: '8-ball'
        }
      ],
      (id) => namen[id],
      () => null
    );
    expect(plan.p1.player1).toBe('Frank F. / Volker B.');
    expect(plan.p1.player2).toBe('Meier / Kurz');
  });

  test('Geist: nur der eine Name', () => {
    const namen: Record<string, string> = { z: 'Zeki', k: 'Kura (Bassum)', m: 'Marcel B. (Bassum)' };
    const plan = tabletSpielplan(
      [
        {
          id: 'p4',
          spieler_a: 'z',
          spieler_b: 'k',
          partner_a: null,
          partner_b: 'm',
          race_to: 3,
          vorgabe_a: 0,
          vorgabe_b: 0,
          status: 'geplant',
          tisch_id: null,
          runde: 1,
          begonnen: null,
          disziplin: '10-ball'
        }
      ],
      (id) => namen[id],
      () => null
    );
    expect(plan.p4.player1).toBe('Zeki');
    expect(plan.p4.player2).toBe('Kura / Marcel B.');
  });
});

describe('Doppel im Archiv und in Auswertungen', () => {
  const at = (id: string, weiteres: Partial<ArchivTurnier>): ArchivTurnier => ({
    id,
    name: id,
    datum: '2026-10-11',
    disziplin: 'multi-ball',
    modus: 'liga',
    status: 'beendet',
    teilnehmerzahl: null,
    art: null,
    ...weiteres
  });
  const zeilen = spieltageZusammenfassen([
    at('b1', { begegnung: 1, partner: 'b2', doppel: 'd' }),
    at('b2', { begegnung: 2, partner: 'b1' }),
    at('d', { begegnung: 1, doppelArt: true, haupt: 'b1', status: 'geplant' })
  ]);
  const ap = (id: string, tid: string, a: string, b: string, ea: number, eb: number, w: Partial<ArchivPartie> = {}): ArchivPartie => ({
    id,
    turnier_id: tid,
    disziplin: '8-ball',
    datum: '2026-10-11',
    phase: 'hin',
    gruppe: null,
    spieler_a: a,
    spieler_b: b,
    ergebnis_a: ea,
    ergebnis_b: eb,
    vorgabe_a: 0,
    vorgabe_b: 0,
    beendet: '2026-10-11T18:00:00Z',
    ...w
  });
  const partien = [
    ap('e1', 'b1', 'frank', 'gast1', 4, 2),
    ap('d1', 'd', 'frank', 'gast1', 1, 4, { doppel: true, partner_a: 'volker', partner_b: 'gast2' }),
    // Geist auf beiden Seiten: wirkt wie ein Einzel, bleibt aber ein Doppel
    ap('d2', 'd', 'frank', 'gast1', 3, 0, { doppel: true, partner_a: null, partner_b: null })
  ];

  test('eine Zeile fuer alle drei Begegnungen, archiviert erst, wenn alle fertig sind', () => {
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ id: 'b1', status: 'geplant', teile: ['b1', 'b2', 'd'] });
  });

  test('Partner findet das Doppel, Bilanz und Vergleich zaehlen es nicht', () => {
    const fertig = zeilen.map((t) => ({ ...t, status: 'beendet' as const }));
    const filter = { saison: 'alle', disziplin: 'alle' as const, art: '', spieler: 'volker', gegen: '' };
    expect(archivFiltern(fertig, partien, [], filter).partien.map((p) => p.id)).toEqual(['d1']);
    expect(platzText(fertig[0], 'frank', [], partien)).toBe('1:0');
    expect(direktvergleich('frank', 'gast1', partien).gesamt.partien).toBe(1);
  });

  test('Saison-Ueberblick: Doppel bei den Spielen ja, beim Spieler nein', () => {
    const u = saisonUeberblick(partien, () => true);
    expect(u.spiele).toBe(3);
    expect(u.aktivster).toEqual({ id: 'frank', spiele: 1, siege: 1 });
  });
});

describe('Anzeige auf Live und Zuschauen', () => {
  const namen: Record<string, string> = {
    v: 'Volker B.',
    m: 'Matthias N.',
    mb: 'Marcel B. (Bassum)',
    mm: 'Maxim M. (Bassum)',
    z: 'Zeki (Bassum)',
    z2: 'Zeki (Achim)'
  };
  const n = (id: string) => namen[id];

  test('Paarung ohne Vereinszusatz, Doppel mit Schraegstrich, Geist ohne Partner', () => {
    expect(paarungText({ spieler_a: 'v', partner_a: 'm', spieler_b: 'mb', partner_b: 'mm' }, n)).toBe(
      'Volker B. / Matthias N. – Marcel B. / Maxim M.'
    );
    expect(paarungText({ spieler_a: 'v', partner_a: null, spieler_b: 'mb', partner_b: 'mm' }, n)).toBe(
      'Volker B. – Marcel B. / Maxim M.'
    );
    // waeren beide Seiten gleich, bleibt der Zusatz
    expect(paarungText({ spieler_a: 'z', partner_a: null, spieler_b: 'z2', partner_b: null }, n)).toBe(
      'Zeki (Bassum) – Zeki (Achim)'
    );
  });

  test('Kachel kennt die Disziplin der Liga-Partie, sonst keine', () => {
    const frisch = new Date().toISOString();
    const liga = kachel({ gameType: 'pool', score1: 1, score2: 0, player1: 'A', discipline: '8-Ball', tournamentMatchId: 'x' }, frisch);
    expect(liga.art === 'pool' && liga.disziplin).toBe('8-Ball');
    const frei = kachel({ gameType: 'pool', score1: 1, score2: 0, player1: 'A', disziplin: '9-ball' }, frisch);
    expect(frei.art === 'pool' && frei.disziplin).toBeNull();
  });
});

describe('Zuschauen: laufende Doppel-Begegnung', () => {
  const t = (id: string, liga: Record<string, unknown>, status: Turnier['status']): Turnier => ({
    id,
    verein_id: 'v',
    name: id,
    datum: '2026-10-11',
    disziplin: 'multi-ball',
    modus: 'liga',
    teilnehmerzahl: null,
    serie_id: null,
    status,
    rating_werten: false,
    eingefroren_am: null,
    einstellungen: { liga },
    quelle: 'cuedesk',
    alt_id: null,
    importiert_am: null,
    erstellt_am: '2026-10-11T10:00:00Z',
    beendet_am: null
  } as Turnier);

  test('zeigt den ganzen Spieltag in Spielfolge, Chat an der 1. Begegnung', () => {
    const anzeige = anzeigeWaehlen([
      t('b1', { begegnung: 1, partner: 'b2', doppel: 'd' }, 'beendet'),
      t('b2', { begegnung: 2, partner: 'b1' }, 'geplant'),
      t('d', { begegnung: 1, art: 'doppel', haupt: 'b1' }, 'laeuft')
    ]);
    expect(anzeige?.turnier.id).toBe('d');
    expect(anzeige?.begegnungen.map((x) => x.id)).toEqual(['b1', 'd', 'b2']);
    expect(anzeige?.chatTurnier.id).toBe('b1');
  });
});
