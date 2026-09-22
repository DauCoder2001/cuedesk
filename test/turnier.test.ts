import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { angefangen, auslosen, bergerRunden, hoechstwert, rangliste, spielBeendet } from '../src/turnier';
import type { RanglistenPartie } from '../src/turnier';

// Original aus Turnier light. Fehlt die Datei, entfallen die Vergleichstests.
const V57 = 'C:/Users/Haas/Documents/Claude Projekte/Turnier light als Programm/turnierplan_billard_v57.html';

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

// Zufallszahlen reproduzierbar
function zufallsquelle(saat: number) {
  let s = saat;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

describe('Spielplan', () => {
  test('jeder spielt genau einmal gegen jeden', () => {
    for (let n = 3; n <= 12; n += 1) {
      const paare = bergerRunden(n).flat().filter(([, b]) => b !== -1);
      expect(paare).toHaveLength((n * (n - 1)) / 2);
      const gesehen = new Set(paare.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-')));
      expect(gesehen.size).toBe(paare.length);
    }
  });

  test('ungerade Zahl: je Runde genau ein Spielfrei', () => {
    const runden = bergerRunden(5);
    expect(runden).toHaveLength(5);
    runden.forEach((r) => expect(r.filter(([, b]) => b === -1)).toHaveLength(1));
  });

  test('Auslosung mischt nur um', () => {
    const neu = auslosen(['a', 'b', 'c', 'd'], zufallsquelle(7));
    expect([...neu].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('Ergebnisse', () => {
  test('beendet nur bei erreichtem Race to ohne Gleichstand', () => {
    expect(spielBeendet(5, 3, 5)).toBe(true);
    expect(spielBeendet(4, 3, 5)).toBe(false);
    expect(spielBeendet(null, 3, 5)).toBe(false);
    expect(hoechstwert(5, 5)).toBe(4);
    expect(hoechstwert(3, 5)).toBe(5);
  });

  test('Stand gleich Vorgabe zaehlt nicht als begonnen', () => {
    expect(angefangen(0, 2, 0, 2)).toBe(false);
    expect(angefangen(1, 2, 0, 2)).toBe(true);
    expect(angefangen(null, null, 0, 0)).toBe(false);
  });
});

describe('Rangliste', () => {
  const partie = (a: number, b: number, sa: number, sb: number): RanglistenPartie => ({
    a,
    b,
    standA: sa,
    standB: sb,
    vorgabeA: 0,
    vorgabeB: 0
  });

  test('direkter Vergleich trennt punkt- und differenzgleiche Spieler', () => {
    // 0 schlaegt 1, 1 schlaegt 2, 2 schlaegt 0, jeweils 5:3 -> alle 1 Punkt, Diff 0
    // -> Dreieck, nicht trennbar: Gleichstand, Startnummern-Reihenfolge
    const { zeilen, gleichstaende } = rangliste(3, [partie(0, 1, 5, 3), partie(1, 2, 5, 3), partie(2, 0, 5, 3)]);
    expect(zeilen.map((z) => z.pos)).toEqual([0, 1, 2]);
    expect(gleichstaende).toEqual([{ schluessel: '0-1-2', start: 0, mitglieder: [0, 1, 2], entschieden: false }]);
  });

  test('Stichkampf-Reihenfolge von Hand', () => {
    const partien = [partie(0, 1, 5, 3), partie(1, 2, 5, 3), partie(2, 0, 5, 3)];
    const { zeilen, gleichstaende } = rangliste(3, partien, { '0-1-2': [2, 0, 1] });
    expect(zeilen.map((z) => z.pos)).toEqual([2, 0, 1]);
    expect(gleichstaende[0].entschieden).toBe(true);
  });
});

describe.skipIf(!existsSync(V57))('Vergleich mit Turnierplan v57', () => {
  const quelle = existsSync(V57) ? readFileSync(V57, 'utf8') : '';

  test('Spielplan identisch fuer 3 bis 12 Spieler', () => {
    const erzeugen = new Function(
      'playerCount',
      `let roundsDefinition; ${funktionAus(quelle, 'generateRoundRobinSchedule')}
       generateRoundRobinSchedule(); return roundsDefinition.map(r => r.pairs);`
    ) as (n: number) => [number, number][][];
    for (let n = 3; n <= 12; n += 1) expect(bergerRunden(n)).toEqual(erzeugen(n));
  });

  test('Rangliste identisch auf 400 zufaelligen Turnieren', () => {
    const sortieren = new Function(
      'stats',
      'h2h',
      'manualOrder',
      `${funktionAus(quelle, 'sortStats')}
       ${funktionAus(quelle, 'tieKey')}
       ${funktionAus(quelle, 'isTiedPair')}
       const found = sortStats(stats, h2h); return { order: stats.map(s => s.idx), found };`
    ) as (
      stats: object[],
      h2h: number[][],
      manualOrder: object
    ) => { order: number[]; found: { key: string; start: number; members: number[]; resolved: boolean }[] };

    const zufall = zufallsquelle(42);
    for (let lauf = 0; lauf < 400; lauf += 1) {
      const n = 3 + Math.floor(zufall() * 8);
      const race = 2 + Math.floor(zufall() * 3);
      const partien: RanglistenPartie[] = [];
      bergerRunden(n)
        .flat()
        .forEach(([a, b]) => {
          if (b === -1 || zufall() < 0.1) return; // manche Spiele offen
          const sieger = Math.floor(zufall() * race);
          const [sa, sb] = zufall() < 0.5 ? [race, sieger] : [sieger, race];
          partien.push({ a, b, standA: sa, standB: sb, vorgabeA: 0, vorgabeB: 0 });
        });

      // Eingaben fuer v57 wie in calculateRanking()
      const stats = Array.from({ length: n }, (_, i) => ({ idx: i, pts: 0, diff: 0, won: 0, lost: 0 }));
      const h2h = Array.from({ length: n }, () => Array(n).fill(0));
      partien.forEach((p) => {
        const sa = p.standA as number;
        const sb = p.standB as number;
        stats[p.a].diff += sa - sb;
        stats[p.b].diff += sb - sa;
        if (sa > sb) stats[p.a].pts += 1;
        else stats[p.b].pts += 1;
        h2h[p.a][p.b] = sa - sb;
        h2h[p.b][p.a] = sb - sa;
      });

      const erwartet = sortieren(stats, h2h, {});
      const ergebnis = rangliste(n, partien);
      expect(ergebnis.zeilen.map((z) => z.pos)).toEqual(erwartet.order);
      expect(ergebnis.gleichstaende.map((g) => [g.schluessel, g.start, g.mitglieder])).toEqual(
        erwartet.found.map((g) => [g.key, g.start, g.members])
      );
    }
  });
});
