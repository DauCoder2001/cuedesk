import { describe, expect, it } from 'vitest';
import { turnierbaum } from '../src/turnierbaum';
import type { EndplatzPartie } from '../src/endplaetze';

const partie = (id: string, phase: string, gruppe: string, a: string, b: string, ea: number | null, eb: number | null, tisch: string | null = null): EndplatzPartie => ({
  id,
  phase,
  gruppe,
  paarung: 1,
  spieler_a: a,
  spieler_b: b,
  ergebnis_a: ea,
  ergebnis_b: eb,
  vorgabe_a: 0,
  vorgabe_b: 0,
  race_to: 3,
  status: ea === null ? (tisch ? 'laeuft' : 'geplant') : 'beendet',
  tisch_id: tisch
});

describe('Turnierbaum fuer den Fernseher', () => {
  it('ohne Auslosung bzw. KO-Start keiner', () => {
    expect(turnierbaum('doppel-ko', { raceTo: 3 }, [], () => null)).toBeNull();
    expect(turnierbaum('gruppen-ko', { raceTo: 3 }, [], () => null)).toBeNull();
    expect(turnierbaum('einzelgruppe', { raceTo: 3 }, [], () => null)).toBeNull();
  });

  it('Doppel-KO: Zonen, Spalten, Sieger und Tisch', () => {
    const setzliste = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const baum = turnierbaum(
      'doppel-ko',
      { raceTo: 3, dko: { setzliste } },
      [partie('p1', 'dko', 'g1-1', 'a', 'h', 3, 1), partie('p2', 'dko', 'g1-2', 'd', 'e', 1, 0, 't2')],
      (id) => (id === 't2' ? '2' : null)
    )!;
    expect(baum.art).toBe('dko');
    expect(baum.spiele.filter((s) => s.zone === 'G')).toHaveLength(6);
    expect(baum.spiele.filter((s) => s.zone === 'V')).toHaveLength(4);
    expect(baum.spiele.filter((s) => s.zone === 'E').map((s) => s.spalte)).toEqual(['Halbfinale', 'Halbfinale', 'Finale und Platz 3', 'Finale und Platz 3']);
    expect(baum.gesamt).toBe(14);
    expect(baum.beendet).toBe(1);
    const g11 = baum.spiele.find((s) => s.id === 'g1-1')!;
    expect(g11).toMatchObject({ spalte: 'Gewinnerrunde 1', name: 'Spiel 1', sieger: 'a', fertig: true });
    expect(baum.spiele.find((s) => s.id === 'g1-2')).toMatchObject({ tisch: '2', partieId: 'p2', fertig: false });
    // Verlierer von G1-1 steht schon in der Verliererrunde
    expect(baum.spiele.find((s) => s.id === 'v1-1')?.a.person).toBe('h');
  });

  it('Doppel-KO mit Freilosen: nur gespielte Spiele zaehlen', () => {
    const setzliste = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const baum = turnierbaum('doppel-ko', { raceTo: 3, dko: { setzliste } }, [], () => null)!;
    expect(baum.spiele.filter((s) => s.zone === 'G' && s.spalte === 'Gewinnerrunde 1' && s.freilos)).toHaveLength(7);
    expect(baum.gesamt).toBeLessThan(baum.spiele.length);
  });

  it('Gruppen mit KO: klassischer Baum', () => {
    const ko = { seeds: ['a', 'b', 'c', 'd'], option: 1, gruppenzahl: 2, weiter: 2, reihung: { A: ['a', 'b'], B: ['c', 'd'] } };
    const baum = turnierbaum('gruppen-ko', { raceTo: 3, ko }, [], () => null)!;
    expect(baum.art).toBe('ko');
    expect(baum.spiele.map((s) => s.spalte)).toEqual(['Halbfinale', 'Halbfinale', 'Finale und Platz 3', 'Finale und Platz 3']);
    expect(baum.spiele.every((s) => s.zone === 'E')).toBe(true);
  });
});
