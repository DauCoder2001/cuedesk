import { describe, expect, test } from 'vitest';
import {
  dkoAufloesen,
  dkoAuslosen,
  dkoEndrunde,
  dkoEndtabelle,
  dkoGroesse,
  dkoSpiele,
  dkoStartplaetze,
  quotient,
  setzReihenfolge
} from '../src/doppelko';
import type { DkoStandSpiel } from '../src/doppelko';

describe('Aufbau', () => {
  test('Baumgroesse und Endrunde nach STO 3.3', () => {
    expect([8, 9, 16, 17, 24, 33, 64].map(dkoGroesse)).toEqual([8, 16, 16, 32, 32, 64, 64]);
    expect([8, 23, 24, 64].map(dkoEndrunde)).toEqual([4, 4, 8, 8]);
  });

  test('Setzreihenfolge: 1 gegen 8, 4 gegen 5, 2 gegen 7, 3 gegen 6', () => {
    expect(setzReihenfolge(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(setzReihenfolge(16).slice(0, 4)).toEqual([1, 16, 8, 9]);
  });

  test('8 Spieler wie im Entwurf: 14 Spiele', () => {
    const s = dkoSpiele(8);
    expect(s.map((x) => x.kurz)).toEqual(['G1-1', 'G1-2', 'G1-3', 'G1-4', 'G2-1', 'G2-2', 'V1-1', 'V1-2', 'V2-1', 'V2-2', 'HF1', 'HF2', 'Finale', 'Platz 3']);
    // Einstieg ueber Kreuz: der Verlierer von G2-2 kommt zu V2-1, Halbfinale 1 ist G2-1 gegen V2-1
    expect(s.find((x) => x.id === 'v2-1')?.quelle[1]).toEqual({ spiel: 'g2-2', nimmt: 'l' });
    expect(s.find((x) => x.id === 'hf1')?.quelle).toEqual([
      { spiel: 'g2-1', nimmt: 'w' },
      { spiel: 'v2-1', nimmt: 'w' }
    ]);
  });

  test('ab 24 Spielern Viertelfinale mit den letzten 8', () => {
    const s = dkoSpiele(24);
    expect(s.filter((x) => x.art === 'VF')).toHaveLength(4);
    expect(s.filter((x) => x.art === 'G').map((x) => x.runde).at(-1)).toBe(3); // 32 -> 16 -> 8 -> 4
  });
});

describe('Auslosung', () => {
  test('Gesetzte zuerst, Rest gelost, Freilose bei den Besten', () => {
    const namen = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
    const liste = dkoAuslosen(namen, ['c', 'a', 'x'], () => 0.5);
    expect(liste.slice(0, 2)).toEqual(['c', 'a']);
    expect([...liste].sort()).toEqual(namen);
    const plaetze = dkoStartplaetze(liste);
    expect(plaetze).toHaveLength(16);
    expect(plaetze.filter((x) => x === null)).toHaveLength(5);
    // Setzrang 1 (c) hat ein Freilos, nie Freilos gegen Freilos
    expect(plaetze[0]).toBe('c');
    expect(plaetze[1]).toBeNull();
    for (let i = 0; i < 16; i += 2) expect(plaetze[i] === null && plaetze[i + 1] === null).toBe(false);
  });
});

// Spielt ein ganzes Turnier durch: der Spieler mit der kleineren Kennung
// gewinnt 5 : (Abstand mod 5)
function durchspielen(n: number) {
  const spieler = Array.from({ length: n }, (_, i) => i + 1);
  const plaetze = dkoStartplaetze(dkoAuslosen(spieler, [], () => 0.3));
  const ergebnisse = new Map<string, [number, number]>();
  const staende = (id: string) => {
    const e = ergebnisse.get(id);
    return { s1: e ? e[0] : null, s2: e ? e[1] : null };
  };
  let baum: Record<string, DkoStandSpiel<number>> = {};
  for (let runde = 0; runde < 200; runde += 1) {
    baum = dkoAufloesen(n, plaetze, staende, () => 5);
    const offen = Object.values(baum).filter((m) => m.bereit && !m.fertig);
    if (offen.length === 0) break;
    offen.forEach((m) => {
      const a = m.a.wer as number;
      const b = m.b.wer as number;
      const verlierer = Math.abs(a - b) % 5;
      ergebnisse.set(m.spiel.id, a < b ? [5, verlierer] : [verlierer, 5]);
    });
  }
  return { baum, ergebnisse };
}

describe('Ganzes Turnier', () => {
  test.each([8, 9, 11, 13, 16, 17, 23, 24, 31, 32, 40, 64])('%i Spieler: alle fertig, jeder genau einmal platziert', (n) => {
    const { baum } = durchspielen(n);
    expect(Object.values(baum).every((m) => m.fertig)).toBe(true);
    const tabelle = dkoEndtabelle(baum, () => ({ gewonnen: 1, verloren: 1 }), (x) => x);
    const platziert = tabelle.filter((z) => z.wer !== null).map((z) => z.wer);
    expect(tabelle.every((z) => !z.offen)).toBe(true);
    expect([...platziert].sort((x, y) => (x as number) - (y as number))).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    // Kleinste Kennung gewinnt immer: 1 ist Erster
    expect(tabelle[0]).toMatchObject({ platz: 1, wer: 1 });
  });

  test('in Gewinner- und Verliererrunde kein Wiedersehen (Einstieg ueber Kreuz)', () => {
    const { baum } = durchspielen(16);
    const paare = Object.values(baum)
      .filter((m) => m.bereit && (m.spiel.art === 'G' || m.spiel.art === 'V'))
      .map((m) => [m.a.wer, m.b.wer].sort().join('-'));
    expect(new Set(paare).size).toBe(paare.length);
  });

  test('Freilos: 9 Spieler, nur G1-2 wird in Runde 1 gespielt', () => {
    const plaetze = dkoStartplaetze(dkoAuslosen(Array.from({ length: 9 }, (_, i) => i + 1), [], () => 0));
    const baum = dkoAufloesen(9, plaetze, () => ({ s1: null, s2: null }), () => 5);
    const runde1 = Object.values(baum).filter((m) => m.spiel.art === 'G' && m.spiel.runde === 1);
    expect(runde1.filter((m) => m.bereit).map((m) => m.spiel.kurz)).toEqual(['G1-2']);
    expect(runde1.filter((m) => m.freilos)).toHaveLength(7);
    // Verliererrunde 1: drei Spiele entfallen, eins wartet auf den Verlierer von G1-2
    const v1 = Object.values(baum).filter((m) => m.spiel.art === 'V' && m.spiel.runde === 1);
    expect(v1.filter((m) => m.entfaellt)).toHaveLength(3);
  });
});

describe('Endtabelle', () => {
  test('gemeinsam ausgeschieden: Quotient, dann gewonnene Saetze, gleiche teilen den Platz', () => {
    const { baum } = durchspielen(8);
    // Im Durchlauf scheiden 5 und 7 in Verliererrunde 2 aus, 6 und 8 in Runde 1
    const bilanz: Record<number, { gewonnen: number; verloren: number }> = {
      5: { gewonnen: 10, verloren: 10 },
      7: { gewonnen: 12, verloren: 10 },
      6: { gewonnen: 9, verloren: 10 },
      8: { gewonnen: 9, verloren: 10 }
    };
    const t = dkoEndtabelle(baum, (x) => bilanz[x] ?? { gewonnen: 1, verloren: 1 }, (x) => x);
    const hinten = t.slice(4).map((z) => [z.platz, z.wer, z.zeigePlatz]);
    expect(hinten.slice(0, 2)).toEqual([
      [5, 7, true],
      [6, 5, true]
    ]);
    expect(hinten.slice(2)).toEqual([
      [7, 6, true],
      [7, 8, false]
    ]);
    expect(quotient({ gewonnen: 7, verloren: 3 })).toBe(2.33);
    expect(quotient({ gewonnen: 3, verloren: 0 })).toBe(Number.POSITIVE_INFINITY);
  });
});
