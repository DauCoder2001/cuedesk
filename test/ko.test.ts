import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  endtabelleKo,
  erstrundenPaare,
  folgespiele,
  koAufloesen,
  koSpiele,
  nachGruppenleistung,
  nichtQualifiziert,
  setzliste,
  standardGruppenzahl,
  startplatzNamen,
  weiterOptionen,
  weiterPassend
} from '../src/ko';
import type { KoFest, KoRunde, Leistung } from '../src/ko';

// Original aus Turnier light. Fehlt die Datei, entfallen die Vergleichstests.
const V74 = 'C:/Users/Haas/Documents/Claude Projekte/Turnier light/turnierplan_billard_ko_v74.html';

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

describe('KO-Einstellungen', () => {
  test('Gruppenzahl und Weiter-Optionen', () => {
    expect(standardGruppenzahl(15)).toBe(2);
    expect(standardGruppenzahl(16)).toBe(4);
    expect(weiterOptionen(8, 2)).toEqual([2]); // Feld 4; Feld 8 waere "alle weiter"
    expect(weiterOptionen(12, 2)).toEqual([2, 4]);
    expect(weiterOptionen(32, 4)).toEqual([1, 2, 4]);
    expect(weiterPassend(12, 2, undefined)).toBe(4);
    expect(weiterPassend(8, 2, 4)).toBe(2);
  });

  test('Baum mit 8: Viertelfinale, Halbfinale, Finale, Platz 3', () => {
    expect(koSpiele(8).map((s) => s.id)).toEqual(['qf1', 'qf2', 'qf3', 'qf4', 'sf1', 'sf2', 'fin', 'bro']);
    expect(folgespiele(8, 'sf1')).toEqual(['fin', 'bro']);
    expect(folgespiele(8, 'qf3')).toEqual(['sf2']);
  });

  test('Setzliste bei vier Gruppen: erst alle Ersten', () => {
    expect(setzliste({ A: ['a1', 'a2'], B: ['b1', 'b2'], C: ['c1', 'c2'], D: ['d1', 'd2'] }, 4, 2)).toEqual([
      'a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2'
    ]);
    expect(startplatzNamen(4, 2)).toEqual(['G1E', 'G2E', 'G3E', 'G4E', 'G1Z', 'G2Z', 'G3Z', 'G4Z']);
  });

  test('Nichtqualifizierte in Gruppenreihenfolge', () => {
    expect(nichtQualifiziert([[1, 2, 3], [4, 5, 6]], [1, 2, 4, 5])).toEqual([3, 6]);
  });
});

describe.skipIf(!existsSync(V74))('Vergleich mit Turnierplan KO v74', () => {
  const quelle = existsSync(V74) ? readFileSync(V74, 'utf8') : '';

  test('Erstrundenpaare identisch fuer alle Gruppenzahlen, Felder und Optionen', () => {
    const v74 = new Function(
      'groupCount',
      'pairingOption',
      'qualPerGroup',
      `${funktionAus(quelle, 'qualifiersPerGroup')}
       ${funktionAus(quelle, 'bracketOrder')}
       ${funktionAus(quelle, 'standardBracketPairs')}
       ${funktionAus(quelle, 'qfSlotPairs')}
       ${funktionAus(quelle, 'seedSlotLabels')}
       return { paare: qfSlotPairs(), namen: seedSlotLabels() };`
    ) as (g: number, o: number, q: number) => { paare: number[][]; namen: string[] };
    for (const g of [2, 4]) {
      for (const q of [1, 2, 4, 8]) {
        if (![4, 8, 16].includes(g * q)) continue;
        for (const o of [1, 2]) {
          const e = v74(g, o, q);
          expect(erstrundenPaare(g, o, q)).toEqual(e.paare);
          expect(startplatzNamen(g, q)).toEqual(e.namen);
        }
      }
    }
  });

  test('Weiter-Optionen identisch fuer 8 bis 32 Spieler', () => {
    const v74 = new Function(
      'playerCount',
      'groupCount',
      `const FIELD_SIZES = [4, 8, 16]; ${funktionAus(quelle, 'qualOptions')} return qualOptions();`
    ) as (n: number, g: number) => number[];
    for (let n = 8; n <= 32; n += 1) for (const g of [2, 4]) expect(weiterOptionen(n, g)).toEqual(v74(n, g));
  });

  test('Baum und Endtabelle identisch (600 Turniere, auch offen und mit Phase 3)', () => {
    const v74 = new Function(
      'groupCount',
      'pairingOption',
      'qualPerGroup',
      'groups',
      'ko',
      'koScores',
      'stats',
      'phase3',
      'phase3Scores',
      `const ALL_GROUPS = ['A', 'B', 'C', 'D'];
       const raceGroup = 3, raceR16 = 2, raceQF = 3, raceSF = 4, raceFinal = 5, racePhase3 = 2;
       ${funktionAus(quelle, 'activeGroups')}
       ${funktionAus(quelle, 'qualifiersPerGroup')}
       ${funktionAus(quelle, 'koFieldSize')}
       ${funktionAus(quelle, 'buildKoMatches')}
       ${funktionAus(quelle, 'kKey')}
       ${funktionAus(quelle, 'pKey')}
       ${funktionAus(quelle, 'raceForRound')}
       ${funktionAus(quelle, 'isGameFinished')}
       ${funktionAus(quelle, 'bracketOrder')}
       ${funktionAus(quelle, 'standardBracketPairs')}
       ${funktionAus(quelle, 'qfSlotPairs')}
       ${funktionAus(quelle, 'seedSlotLabels')}
       ${funktionAus(quelle, 'resolveKO')}
       function computeGroupRanking(grp) { return { stats: stats[grp] }; }
       ${funktionAus(quelle, 'groupOf')}
       ${funktionAus(quelle, 'collectGroupPerformance')}
       ${funktionAus(quelle, 'sortByGroupPerformance')}
       ${funktionAus(quelle, 'samePerfRank')}
       ${funktionAus(quelle, 'denseGroupRows')}
       ${funktionAus(quelle, 'phase3Paare')}
       ${funktionAus(quelle, 'phase3Solo')}
       ${funktionAus(quelle, 'computeFinalTable')}
       const perf = collectGroupPerformance();
       return { baum: resolveKO(), tabelle: computeFinalTable(), perf,
                rest: sortByGroupPerformance((function () {
                  const imKO = new Set(ko.seeds); const r = [];
                  activeGroups().forEach(g => groups[g].forEach(i => { if (!imKO.has(i)) r.push(i); }));
                  return r; })(), perf) };`
    ) as (...args: unknown[]) => {
      baum: Record<string, { p1: number | null; p2: number | null; l1: string; l2: string; finished: boolean; winner: number | null; loser: number | null }>;
      tabelle: { place: number; idx: number | null; how: string; open: boolean; showRank?: boolean }[];
      rest: number[];
    };

    const RACE: Record<KoRunde, number> = { R16: 2, QF: 3, SF: 4, FIN: 5, BRO: 4 };
    const zufall = zufallsquelle(17);
    let mitPhase3 = 0;
    let fertigeTurniere = 0;
    for (let lauf = 0; lauf < 600; lauf += 1) {
      const n = 8 + Math.floor(zufall() * 25);
      const g = zufall() < 0.5 ? 2 : 4;
      const optionen = weiterOptionen(n, g);
      if (optionen.length === 0) continue;
      const q = optionen[Math.floor(zufall() * optionen.length)];
      const option = g * q === 8 && zufall() < 0.5 ? 2 : 1;
      const gruppenNamen = ['A', 'B', 'C', 'D'].slice(0, g);

      // Gruppen: Spieler 0..n-1 reihum verteilt, Reihenfolge = Tabelle
      const groups: Record<string, number[]> = Object.fromEntries(gruppenNamen.map((x) => [x, [] as number[]]));
      for (let i = 0; i < n; i += 1) groups[gruppenNamen[i % g]].push(i);
      // Gruppenwerte mit vielen Gleichstaenden, absteigend passend zur Tabelle
      const stats: Record<string, { idx: number; pts: number; diff: number; won: number }[]> = {};
      const leistung = new Map<number, Leistung>();
      gruppenNamen.forEach((x) => {
        let pts = 6;
        stats[x] = groups[x].map((idx, platz) => {
          if (zufall() < 0.6) pts = Math.max(0, pts - 1);
          const s = { idx, pts, diff: pts - 3, won: pts * 2 };
          leistung.set(idx, { gruppe: x, platz: platz + 1, punkte: s.pts, diff: s.diff, gewonnen: s.won });
          return s;
        });
      });
      const reihung = Object.fromEntries(gruppenNamen.map((x) => [x, groups[x]]));
      const seeds = setzliste(reihung, g, q);
      const ko: KoFest<number> = { seeds, option, gruppenzahl: g, weiter: q, reihung };
      const koV74 = { seeds, option, groupCount: g, qual: q, ranking: reihung };

      // Staende: meist fertig, manchmal offen
      const koScores: Record<string, number> = {};
      koSpiele(g * q).forEach((s) => {
        const race = RACE[s.runde];
        let [a, b] = [race, Math.floor(zufall() * race)];
        if (zufall() < 0.5) [a, b] = [b, a];
        if (zufall() < 0.12) [a, b] = [Math.floor(zufall() * race), Math.floor(zufall() * race)];
        koScores[`${s.id}-p1`] = a;
        koScores[`${s.id}-p2`] = b;
      });

      const rest = nichtQualifiziert(gruppenNamen.map((x) => groups[x]), seeds);
      const ordnung = (x: number) => x;
      let phase3: { order: number[]; abPlatz: number } | null = null;
      const phase3Scores: Record<string, number> = {};
      if (rest.length >= 2 && zufall() < 0.5) {
        phase3 = { order: nachGruppenleistung(rest, leistung, ordnung), abPlatz: g * q + 1 };
        for (let i = 0; i + 1 < phase3.order.length; i += 2) {
          let [a, b] = [2, Math.floor(zufall() * 2)];
          if (zufall() < 0.5) [a, b] = [b, a];
          if (zufall() < 0.15) [a, b] = [0, 0];
          phase3Scores[`p3-${i / 2}-p1`] = a;
          phase3Scores[`p3-${i / 2}-p2`] = b;
        }
        mitPhase3 += 1;
      }

      const e = v74(g, option, q, groups, koV74, koScores, stats, phase3, phase3Scores);
      expect(nachGruppenleistung(rest, leistung, ordnung)).toEqual(e.rest);

      const baum = koAufloesen(
        ko,
        (id) => ({ s1: koScores[`${id}-p1`], s2: koScores[`${id}-p2`] }),
        (r) => RACE[r]
      );
      Object.entries(e.baum).forEach(([id, m]) => {
        const b = baum[id];
        expect([b.p1, b.p2, b.l1, b.l2, b.fertig, b.sieger, b.verlierer]).toEqual([m.p1, m.p2, m.l1, m.l2, m.finished, m.winner, m.loser]);
      });
      if (baum.fin.fertig) fertigeTurniere += 1;

      const tabelle = endtabelleKo(
        ko,
        baum,
        leistung,
        gruppenNamen.map((x) => groups[x]),
        ordnung,
        phase3
          ? {
              reihung: phase3.order,
              abPlatz: phase3.abPlatz,
              race: 2,
              staende: phase3.order
                .slice(0, Math.floor(phase3.order.length / 2))
                .map((_, i) => ({ s1: phase3Scores[`p3-${i}-p1`], s2: phase3Scores[`p3-${i}-p2`] }))
            }
          : null
      );
      expect(tabelle.map((z) => [z.platz, z.wer, z.wie, z.offen, z.zeigePlatz])).toEqual(
        e.tabelle.map((z) => [z.place, z.idx, z.how, z.open, z.showRank ?? true])
      );
    }
    expect(mitPhase3).toBeGreaterThan(100);
    expect(fertigeTurniere).toBeGreaterThan(100);
  });
});
