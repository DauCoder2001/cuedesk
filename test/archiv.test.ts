import { describe, expect, test } from 'vitest';
import {
  archivFiltern,
  artOptionen,
  direktvergleich,
  platzText,
  rundeText,
  saisonOptionen,
  saisonZeitraum,
  spieltageZusammenfassen
} from '../src/archiv';
import type { ArchivFilter, ArchivPartie, ArchivTeilnahme, ArchivTurnier } from '../src/archiv';

const turnier = (id: string, datum: string, weiteres: Partial<ArchivTurnier> = {}): ArchivTurnier => ({
  id,
  name: `Turnier ${id}`,
  datum,
  disziplin: '9-ball',
  modus: 'einzelgruppe',
  status: 'beendet',
  teilnehmerzahl: null,
  art: null,
  ...weiteres
});

let lfd = 0;
const partie = (turnierId: string | null, a: string, b: string, ea: number, eb: number, weiteres: Partial<ArchivPartie> = {}): ArchivPartie => ({
  id: `p${++lfd}`,
  turnier_id: turnierId,
  disziplin: '9-ball',
  datum: '2026-09-10',
  phase: null,
  gruppe: null,
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  vorgabe_a: 0,
  vorgabe_b: 0,
  beendet: null,
  ...weiteres
});

const filter = (f: Partial<ArchivFilter> = {}): ArchivFilter => ({ saison: 'alle', disziplin: 'alle', art: '', spieler: '', gegen: '', ...f });

describe('Saison', () => {
  test('Auswahl vom ersten Eintrag bis heute, neueste zuerst', () => {
    expect(saisonOptionen('2024-03-01', '2026-09-29')).toEqual(['2026/27', '2025/26', '2024/25', '2023/24']);
    expect(saisonOptionen(null, '2026-09-29')).toEqual(['2026/27']);
  });
  test('Zeitraum einer Saison', () => {
    expect(saisonZeitraum('2026/27')).toEqual({ von: '2026-07-01', bis: '2027-06-30' });
    expect(saisonZeitraum('2026/27', 1)).toEqual({ von: '2026-01-01', bis: '2026-12-31' });
  });
});

describe('Filter', () => {
  const turniere = [
    turnier('vm', '2026-09-04', { art: 'Vereinsmeisterschaft', disziplin: '8-ball' }),
    turnier('cup', '2026-05-10'),
    turnier('liga', '2026-08-28', { modus: 'liga', disziplin: 'multi-ball' }),
    turnier('laeuft', '2026-09-20', { status: 'laeuft' })
  ];
  const partien = [
    partie('vm', 'max', 'jan', 5, 4, { disziplin: '8-ball', datum: '2026-09-04' }),
    partie('cup', 'max', 'uwe', 5, 2, { datum: '2026-05-10' }),
    partie('liga', 'jan', 'gast', 2, 0, { disziplin: '14-1', datum: '2026-08-28' }),
    partie('laeuft', 'max', 'jan', 5, 1, { datum: '2026-09-20' }),
    partie(null, 'jan', 'max', 3, 1, { datum: '2026-09-12' })
  ];
  const teilnahmen: ArchivTeilnahme[] = [
    { turnier_id: 'vm', person_id: 'max', endplatz: 2 },
    { turnier_id: 'vm', person_id: 'jan', endplatz: 1 },
    { turnier_id: 'cup', person_id: 'max', endplatz: 1 },
    { turnier_id: 'cup', person_id: 'uwe', endplatz: 2 }
  ];
  const ids = (x: { id: string }[]) => x.map((t) => t.id);

  test('laufende Turniere und ihre Partien fehlen; neueste zuerst', () => {
    const e = archivFiltern(turniere, partien, teilnahmen, filter());
    expect(ids(e.turniere)).toEqual(['vm', 'liga', 'cup']);
    expect(e.partien.map((p) => p.turnier_id)).toEqual([null, 'vm', 'liga', 'cup']);
  });
  test('Saison nach dem Saisonbeginn im Juli', () => {
    expect(ids(archivFiltern(turniere, partien, teilnahmen, filter({ saison: '2025/26' })).turniere)).toEqual(['cup']);
  });
  test('Liga-Spieltag passt zu jeder Disziplin, die darin gespielt wurde', () => {
    expect(ids(archivFiltern(turniere, partien, teilnahmen, filter({ disziplin: '14-1' })).turniere)).toEqual(['liga']);
  });
  test('Turnierart, Liga und Einzelspiele', () => {
    expect(ids(archivFiltern(turniere, partien, teilnahmen, filter({ art: 'art:Vereinsmeisterschaft' })).turniere)).toEqual(['vm']);
    expect(ids(archivFiltern(turniere, partien, teilnahmen, filter({ art: 'ohne' })).turniere)).toEqual(['cup']);
    const einzel = archivFiltern(turniere, partien, teilnahmen, filter({ art: 'einzel' }));
    expect(einzel.turniere).toEqual([]);
    expect(einzel.partien.map((p) => p.turnier_id)).toEqual([null]);
  });
  test('Spieler und gegen: gemeinsame Turniere und Begegnungen', () => {
    const e = archivFiltern(turniere, partien, teilnahmen, filter({ spieler: 'max', gegen: 'jan' }));
    expect(ids(e.turniere)).toEqual(['vm']);
    expect(e.partien.map((p) => p.turnier_id)).toEqual([null, 'vm']);
  });
  test('Auswahl der Turnierarten', () => {
    expect(artOptionen(turniere, true).map((o) => o.wert)).toEqual(['', 'art:Vereinsmeisterschaft', 'ohne', 'liga', 'einzel']);
  });
  test('Platz im Turnier, Bilanz im Liga-Spieltag', () => {
    expect(platzText(turniere[0], 'jan', teilnahmen, partien)).toBe('1.');
    expect(platzText(turniere[2], 'jan', teilnahmen, partien)).toBe('1:0');
    expect(platzText(turniere[2], 'max', teilnahmen, partien)).toBe('');
  });
});

describe('Liga-Spieltag aus zwei Begegnungen', () => {
  const liga = { modus: 'liga' as const, disziplin: 'multi-ball' as const };
  const erste = turnier('b1', '2026-10-11', { ...liga, name: 'Verden vs. Bassum', begegnung: 1, partner: 'b2' });
  const zweite = turnier('b2', '2026-10-11', { ...liga, name: 'Verden vs. Bassum · 2. Begegnung', begegnung: 2, partner: 'b1' });
  const partien = [
    partie('b1', 'jan', 'gast1', 4, 2, { disziplin: '8-ball', datum: '2026-10-11' }),
    partie('b2', 'uwe', 'gast2', 1, 4, { disziplin: '10-ball', datum: '2026-10-11' })
  ];
  const ids = (x: { id: string }[]) => x.map((t) => t.id);

  test('eine Zeile unter der 1. Begegnung, mit den Partien beider', () => {
    const zeilen = spieltageZusammenfassen([erste, zweite]);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ id: 'b1', name: 'Verden vs. Bassum', status: 'beendet', teile: ['b1', 'b2'] });
    const e = archivFiltern(zeilen, partien, [], filter());
    expect(ids(e.turniere)).toEqual(['b1']);
    expect(e.partien.map((p) => p.turnier_id).sort()).toEqual(['b1', 'b2']);
    // Disziplin und Spieler aus der 2. Begegnung finden den Spieltag
    expect(ids(archivFiltern(zeilen, partien, [], filter({ disziplin: '10-ball' })).turniere)).toEqual(['b1']);
    expect(ids(archivFiltern(zeilen, partien, [], filter({ spieler: 'uwe' })).turniere)).toEqual(['b1']);
    expect(platzText(zeilen[0], 'uwe', [], partien)).toBe('0:1');
  });
  test('erst im Archiv, wenn beide Begegnungen fertig sind', () => {
    const zeilen = spieltageZusammenfassen([erste, { ...zweite, status: 'geplant' }]);
    expect(zeilen[0].status).toBe('geplant');
    const e = archivFiltern(zeilen, partien, [], filter());
    expect(e.turniere).toEqual([]);
    expect(e.partien).toEqual([]);
  });
  test('ohne gegenseitigen Verweis bleiben beide Zeilen', () => {
    const zeilen = spieltageZusammenfassen([{ ...erste, partner: null }, zweite]);
    expect(ids(zeilen)).toEqual(['b1', 'b2']);
  });
});

describe('Runde', () => {
  test('KO, Gruppe, Liga', () => {
    expect(rundeText({ phase: 'ko', gruppe: 'sf1' })).toBe('Halbfinale');
    expect(rundeText({ phase: 'ko', gruppe: 'bro' })).toBe('Spiel um Platz 3');
    expect(rundeText({ phase: 'gruppe', gruppe: 'B' })).toBe('Gruppe B');
    expect(rundeText({ phase: 'Gruppe A', gruppe: 'A' })).toBe('Gruppe A');
    expect(rundeText({ phase: 'rueck', gruppe: null })).toBe('Rückrunde');
    expect(rundeText({ phase: null, gruppe: null })).toBe('–');
  });
});

describe('Direkter Vergleich', () => {
  const partien = [
    partie('t1', 'max', 'jan', 5, 3, { datum: '2026-09-01', vorgabe_b: 1 }),
    partie('t1', 'jan', 'max', 5, 4, { datum: '2026-09-02', disziplin: '8-ball' }),
    partie(null, 'jan', 'max', 60, 75, { id: 'e141', datum: '2026-09-03', disziplin: '14-1' }),
    partie(null, 'jan', 'max', 40, 50, { id: 'x141', datum: '2026-09-04', disziplin: '14-1' }),
    partie('t1', 'max', 'uwe', 5, 0, { datum: '2026-09-05' })
  ];
  const v = direktvergleich('max', 'jan', partien, [
    { partie_id: 'e141', aufnahmen_a: 30, aufnahmen_b: 30, hoechstserie_a: 17, hoechstserie_b: 23 }
  ]);

  test('Summen aus Sicht des ersten Spielers; Racks ohne Vorgabe, nur Pool', () => {
    expect(v.gesamt).toEqual({ partien: 4, siegeA: 3, siegeB: 1, unentschieden: 0, racksA: 9, racksB: 7 });
  });
  test('je Disziplin; 14.1 mit GD und HS aus den lesbaren Kennzahlen', () => {
    expect(v.jeDisziplin.map((d) => d.disziplin)).toEqual(['8-ball', '9-ball', '14-1']);
    const d141 = v.jeDisziplin[2];
    expect(d141.gdA).toBe(2.5);
    expect(d141.gdB).toBe(2);
    expect(d141.hsA).toBe(23);
    expect(d141.hsB).toBe(17);
    expect(d141.ohneWerte).toBe(1);
    expect(d141.racksA).toBe(0);
  });
  test('Verlauf: die aelteste Begegnung zuerst, andere Gegner fehlen', () => {
    expect(v.letzte.map((b) => b.sieger)).toEqual(['a', 'b', 'a', 'a']);
  });
});
