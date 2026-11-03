// Turnierbaum fuer den Fernseher ("TV zeigt: Turnierbaum"): Doppel-KO mit
// Gewinner-, Verliererrunde und Endrunde, Gruppen mit KO als klassischer
// Baum. Gerechnet mit denselben Bausteinen wie die Turnieransicht
// (dkoAufloesen, koAufloesen); die Fernseher-Seite zeichnet nur noch.

import { dkoAbschnitt, dkoAufloesen, dkoStartplaetze } from './doppelko';
import type { DkoArt } from './doppelko';
import { KO_RUNDEN_NAME, koAufloesen, koSpiele } from './ko';
import type { KoRunde } from './ko';
import type { Stand } from './turnier';
import type { TurnierEinstellungen } from './seiten/Turniere';
import type { EndplatzPartie } from './endplaetze';

export type BaumSeite = { person: string | null; herkunft: string; frei: boolean };

export type BaumSpiel = {
  id: string;
  zone: 'G' | 'V' | 'E'; // Gewinnerrunde, Verliererrunde, Endrunde (KO-Runde: immer E)
  spalte: string; // Ueberschrift der Spalte, z. B. "Gewinnerrunde 1" oder "Halbfinale"
  name: string; // "Spiel 2", "Halbfinale 1", "Finale"
  a: BaumSeite;
  b: BaumSeite;
  s1: Stand;
  s2: Stand;
  fertig: boolean;
  freilos: boolean; // nur ein Spieler, wird nicht gespielt
  entfaellt: boolean; // keiner
  sieger: 'a' | 'b' | null;
  partieId: string | null;
  tisch: string | null;
};

export type Turnierbaum = { art: 'dko' | 'ko'; beendet: number; gesamt: number; spiele: BaumSpiel[] };

export function turnierbaum(
  modus: string,
  e: TurnierEinstellungen,
  partien: EndplatzPartie[],
  tischNummer: (id: string) => string | null
): Turnierbaum | null {
  const raceTo = e.raceTo ?? 0;
  const stand = (p: EndplatzPartie | undefined) =>
    p ? { s1: p.ergebnis_a ?? p.vorgabe_a, s2: p.ergebnis_b ?? p.vorgabe_b, race: p.race_to } : { s1: null, s2: null, race: null };
  const partieZu = (phase: string, id: string) => partien.find((p) => p.phase === phase && p.gruppe === id);
  const ort = (phase: string, id: string) => {
    const p = partieZu(phase, id);
    return { partieId: p?.id ?? null, tisch: p?.tisch_id ? tischNummer(p.tisch_id) : null };
  };
  const zaehlen = (spiele: BaumSpiel[]) => {
    const gespielt = spiele.filter((s) => !s.freilos && !s.entfaellt);
    return { beendet: gespielt.filter((s) => s.fertig).length, gesamt: gespielt.length };
  };

  if (modus === 'doppel-ko') {
    const dko = e.dko;
    if (!dko) return null;
    const rd = e.raceDko;
    const raceFuer = (art: DkoArt) =>
      (art === 'G' ? rd?.G : art === 'V' ? rd?.V : art === 'VF' ? rd?.VF : art === 'FIN' ? rd?.FIN : rd?.HF) ?? raceTo;
    const baum = dkoAufloesen(
      dko.setzliste.length,
      dkoStartplaetze(dko.setzliste),
      (id, a, b) => {
        const p = partieZu('dko', id);
        return stand(p && p.spieler_a === a && p.spieler_b === b ? p : undefined);
      },
      raceFuer
    );
    const spiele: BaumSpiel[] = Object.values(baum).map((m) => {
      const id = m.spiel.id;
      const spalte = dkoAbschnitt(id).titel;
      return {
        id,
        zone: id.startsWith('g') ? 'G' : /^v\d/.test(id) ? 'V' : 'E',
        spalte,
        name: m.spiel.name.replace(`${spalte} · `, ''),
        a: { person: m.a.wer, herkunft: m.l1, frei: m.a.frei },
        b: { person: m.b.wer, herkunft: m.l2, frei: m.b.frei },
        s1: m.s1,
        s2: m.s2,
        fertig: m.fertig,
        freilos: m.freilos,
        entfaellt: m.entfaellt,
        sieger: m.sieger.wer === null ? null : m.sieger.wer === m.a.wer ? 'a' : 'b',
        ...ort('dko', id)
      };
    });
    return { art: 'dko', ...zaehlen(spiele), spiele };
  }

  if (modus === 'gruppen-ko') {
    const ko = e.ko;
    if (!ko) return null;
    const rk = e.raceKo;
    const raceFuer = (runde: KoRunde) =>
      (runde === 'R16' ? rk?.R16 : runde === 'QF' ? rk?.QF : runde === 'FIN' ? rk?.FIN : rk?.SF) ?? raceTo;
    const baum = koAufloesen(
      ko,
      (id, p1, p2) => {
        const p = partieZu('ko', id);
        return stand(p && p.spieler_a === p1 && p.spieler_b === p2 ? p : undefined);
      },
      raceFuer
    );
    const spiele: BaumSpiel[] = koSpiele(ko.gruppenzahl * ko.weiter).map((s) => {
      const m = baum[s.id];
      return {
        id: s.id,
        zone: 'E',
        spalte: s.runde === 'FIN' || s.runde === 'BRO' ? 'Finale und Platz 3' : KO_RUNDEN_NAME[s.runde],
        name: s.name,
        a: { person: m.p1, herkunft: m.l1, frei: false },
        b: { person: m.p2, herkunft: m.l2, frei: false },
        s1: m.s1,
        s2: m.s2,
        fertig: m.fertig,
        freilos: false,
        entfaellt: false,
        sieger: m.sieger === null ? null : m.sieger === m.p1 ? 'a' : 'b',
        ...ort('ko', s.id)
      };
    });
    return { art: 'ko', ...zaehlen(spiele), spiele };
  }

  return null;
}
