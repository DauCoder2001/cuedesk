import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { endtabelleZweiGruppen, gruppenRangliste, phase2Paare, verteilen, zielGroessen, zuVieleGesetzt } from '../src/gruppen';
import { bergerRunden } from '../src/turnier';
import type { RanglistenPartie } from '../src/turnier';

// Original aus Turnier light. Fehlt die Datei, entfallen die Vergleichstests.
const V64 = 'C:/Users/Haas/Documents/Claude Projekte/Turnier light/turnierplan_billard_gruppen_v64.html';

function funktionAus(quelle: string, name: string): string {
  const start = quelle.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} fehlt`);
  let tiefe = 0;
  for (let i = quelle.indexOf('{', start); i < quelle.length; i += 1) {
    if (quelle[i] === '{') tiefe += 1;
    if (quelle[i] === '}') {
      tiefe -= 1;
      if (tiefe === 0) return quelle.slice(start, i + 1);
    }
  }
  throw new Error(`${name} unvollstaendig`);
}

function zufallsquelle(saat: number) {
  let s = saat;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

describe('Verteilung auf zwei Gruppen', () => {
  test('Zielstaerken: vordere Gruppe bekommt den Rest', () => {
    expect(zielGroessen(9, ['A', 'B'])).toEqual({ A: 5, B: 4 });
    expect(zielGroessen(10, ['A', 'B', 'C', 'D'])).toEqual({ A: 3, B: 3, C: 2, D: 2 });
  });

  test('zu viele Setzungen werden erkannt', () => {
    expect(zuVieleGesetzt(6, { a: 'B', b: 'B', c: 'B', d: 'B' }, ['A', 'B'])).toEqual(['B']);
    expect(zuVieleGesetzt(6, { a: 'B', b: 'B', c: 'B' }, ['A', 'B'])).toEqual([]);
  });

  test('Gesetzte bleiben in ihrer Gruppe, Staerken stimmen', () => {
    const g = verteilen(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { c: 'B', f: 'B' }, ['A', 'B'], zufallsquelle(3));
    expect(g.A).toHaveLength(4);
    expect(g.B).toHaveLength(3);
    expect(g.B.slice(0, 2)).toEqual(['c', 'f']);
  });

  test('Phase-2-Paare mit Spielfrei', () => {
    expect(phase2Paare([1, 2, 3], [4, 5])).toEqual({ duelle: [[1, 4], [2, 5]], spielfrei: [3] });
  });
});

describe('Gruppentabelle', () => {
  test('Handreihenfolge wirkt mit Startlisten-Positionen', () => {
    // Gruppe aus den Positionen 4, 1, 6: Dreieck, jeweils 5:3
    const p = (a: number, b: number): RanglistenPartie => ({ a, b, standA: 5, standB: 3, vorgabeA: 0, vorgabeB: 0 });
    const partien = [p(4, 1), p(1, 6), p(6, 4)];
    const ohne = gruppenRangliste([4, 1, 6], partien);
    expect(ohne.zeilen.map((z) => z.pos)).toEqual([4, 1, 6]);
    expect(ohne.gleichstaende[0]).toMatchObject({ schluessel: '1-4-6', start: 0, entschieden: false });
    const mit = gruppenRangliste([4, 1, 6], partien, { '1-4-6': [6, 4, 1] });
    expect(mit.zeilen.map((z) => z.pos)).toEqual([6, 4, 1]);
    expect(mit.gleichstaende[0]).toMatchObject({ mitglieder: [6, 4, 1], entschieden: true });
  });
});

describe.skipIf(!existsSync(V64))('Vergleich mit Turnierplan Gruppen v64', () => {
  const quelle = existsSync(V64) ? readFileSync(V64, 'utf8') : '';

  test('Verteilung mit Setzungen identisch (300 Auslosungen)', () => {
    const v64 = new Function(
      'playerCount',
      'seeded',
      'Math',
      `const groups = { A: [], B: [] };
       ${funktionAus(quelle, 'seedGroups')}
       ${funktionAus(quelle, 'seededOf')}
       ${funktionAus(quelle, 'targetSizes')}
       ${funktionAus(quelle, 'pruneSeeded')}
       ${funktionAus(quelle, 'verteileMitSetzungen')}
       verteileMitSetzungen(); return groups;`
    ) as (n: number, seeded: Record<number, string>, m: object) => Record<string, number[]>;

    const wahl = zufallsquelle(11);
    for (let lauf = 0; lauf < 300; lauf += 1) {
      const n = 4 + Math.floor(wahl() * 13);
      const seeded: Record<number, string> = {};
      const ziel = zielGroessen(n, ['A', 'B']);
      for (let i = 0; i < n; i += 1) {
        if (wahl() < 0.2) {
          const g = wahl() < 0.5 ? 'A' : 'B';
          if (Object.values(seeded).filter((x) => x === g).length < ziel[g]) seeded[i] = g;
        }
      }
      const saat = Math.floor(wahl() * 100000);
      const zufallV64 = zufallsquelle(saat);
      const erwartet = v64(n, seeded, { random: zufallV64, floor: Math.floor, max: Math.max });

      const ids = Array.from({ length: n }, (_, i) => String(i));
      const gesetzt = Object.fromEntries(Object.entries(seeded));
      const ergebnis = verteilen(ids, gesetzt, ['A', 'B'], zufallsquelle(saat));
      expect({ A: ergebnis.A.map(Number), B: ergebnis.B.map(Number) }).toEqual(erwartet);
    }
  });

  test('Gruppentabelle identisch (1000 Gruppen, mit Vorgabe und Stichkampf)', () => {
    const v64 = new Function(
      'groups',
      'groupRounds',
      'scores',
      'vorgaben',
      'manualOrder',
      `const currentNames = []; const raceGroup = 3;
       ${funktionAus(quelle, 'gKey')}
       function hcVorgabe(a, b) { return vorgaben[a + ':' + b] || [0, 0]; }
       function hcAngefangen(s1, s2, v) {
         if ((s1 === null || s1 === undefined) && (s2 === null || s2 === undefined)) return false;
         return (s1 !== null && s1 !== undefined && s1 !== v[0]) || (s2 !== null && s2 !== undefined && s2 !== v[1]);
       }
       function countOpenGamesInGroup() { return 0; }
       ${funktionAus(quelle, 'sortStats')}
       ${funktionAus(quelle, 'tieKey')}
       ${funktionAus(quelle, 'isTiedPair')}
       ${funktionAus(quelle, 'computeGroupRanking')}
       const r = computeGroupRanking('A');
       return { order: r.stats.map(s => s.idx), found: r.tieGroups };`
    ) as (
      groups: object,
      rounds: object,
      scores: object,
      vorgaben: object,
      manualOrder: object
    ) => { order: number[]; found: { key: string; start: number; members: number[]; resolved: boolean }[] };

    const zufall = zufallsquelle(5);
    let mitStichkampf = 0;
    let mitHand = 0;
    for (let lauf = 0; lauf < 1000; lauf += 1) {
      const n = 3 + Math.floor(zufall() * 6);
      const alle = Array.from({ length: 16 }, (_, i) => i);
      const mitglieder: number[] = [];
      while (mitglieder.length < n) {
        const x = alle.splice(Math.floor(zufall() * alle.length), 1)[0];
        mitglieder.push(x);
      }
      const runden = bergerRunden(n).map((paare) => ({
        pairs: paare.map(([a, b]) => [mitglieder[a], b === -1 ? -1 : mitglieder[b]])
      }));
      const scores: Record<string, number> = {};
      const vorgaben: Record<string, [number, number]> = {};
      const partien: RanglistenPartie[] = [];
      runden.forEach((r, rIdx) =>
        r.pairs.forEach(([a, b], gIdx) => {
          if (b === -1) return;
          const v: [number, number] = zufall() < 0.3 ? (zufall() < 0.5 ? [1, 0] : [0, 1]) : [0, 0];
          vorgaben[`${a}:${b}`] = v;
          let [sa, sb] = [3, Math.floor(zufall() * 3)];
          if (zufall() < 0.5) [sa, sb] = [sb, sa];
          if (zufall() < 0.1) [sa, sb] = v; // unberuehrt
          scores[`A-r${rIdx}-g${gIdx}-p1`] = sa;
          scores[`A-r${rIdx}-g${gIdx}-p2`] = sb;
          partien.push({ a, b, standA: sa, standB: sb, vorgabeA: v[0], vorgabeB: v[1] });
        })
      );
      // Gelegentlich eine Handreihenfolge fuer den ersten Gleichstand
      const vorab = gruppenRangliste(mitglieder, partien);
      const hand: Record<string, number[]> = {};
      const manual: Record<string, { order: number[] }> = {};
      if (vorab.gleichstaende.length > 0 && zufall() < 0.5) {
        const g = vorab.gleichstaende[0];
        const r = [...g.mitglieder].reverse();
        hand[g.schluessel] = r;
        manual[g.schluessel] = { order: r };
        mitHand += 1;
      }
      if (vorab.gleichstaende.length > 0) mitStichkampf += 1;

      const erwartet = v64({ A: mitglieder }, { A: runden }, scores, vorgaben, manual);
      const ergebnis = gruppenRangliste(mitglieder, partien, hand);
      expect(ergebnis.zeilen.map((z) => z.pos)).toEqual(erwartet.order);
      expect(ergebnis.gleichstaende.map((g) => [g.schluessel, g.start, g.mitglieder, g.entschieden])).toEqual(
        erwartet.found.map((g) => [g.key, g.start, g.members, g.resolved])
      );
    }
    expect(mitStichkampf).toBeGreaterThan(30);
    expect(mitHand).toBeGreaterThan(15);
  });

  test('Endtabelle identisch (200 Phasen, auch offen und mit Spielfrei)', () => {
    const v64 = new Function(
      'phase2',
      'finalScores',
      `const racePhase2 = 3;
       ${funktionAus(quelle, 'fKey')}
       ${funktionAus(quelle, 'isGameFinished')}
       ${funktionAus(quelle, 'computeFinalTable')}
       return computeFinalTable();`
    ) as (
      p: object,
      s: object
    ) => { idx: number; place: number; groupPlace: number; result: string; open: boolean; bye: boolean }[];

    const zufall = zufallsquelle(9);
    for (let lauf = 0; lauf < 200; lauf += 1) {
      const na = 2 + Math.floor(zufall() * 7);
      const nb = na - (zufall() < 0.5 ? 1 : 0);
      const a = Array.from({ length: na }, (_, i) => i);
      const b = Array.from({ length: nb }, (_, i) => 20 + i);
      const finalScores: Record<string, number> = {};
      const staende = Array.from({ length: Math.min(na, nb) }, (_, i) => {
        let [s1, s2] = [3, Math.floor(zufall() * 3)];
        if (zufall() < 0.5) [s1, s2] = [s2, s1];
        if (zufall() < 0.2) [s1, s2] = [Math.floor(zufall() * 3), Math.floor(zufall() * 3)]; // offen
        finalScores[`f${i}-p1`] = s1;
        finalScores[`f${i}-p2`] = s2;
        return { standA: s1, standB: s2 };
      });
      const erwartet = v64({ A: a, B: b }, finalScores);
      const ergebnis = endtabelleZweiGruppen(a, b, staende, 3);
      expect(ergebnis.map((z) => [z.wer, z.platz, z.gruppenplatz, z.ergebnis, z.offen, z.spielfrei])).toEqual(
        erwartet.map((z) => [z.idx, z.place, z.groupPlace, z.result, z.open, z.bye])
      );
    }
  });
});
