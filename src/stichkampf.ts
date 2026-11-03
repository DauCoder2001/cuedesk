// Offene Stichkaempfe: Gleichstand in einer Tabelle, den erst ein Shoot-Out
// entscheidet (BLVN-STO Pool 3.4). Angeboten je Gruppe, sobald deren Spiele
// beendet sind und die Plaetze noch nicht fuer Duelle bzw. KO-Runde fixiert
// sind. Fuer den Hinweis in der Turnieransicht und den Fernseher ("Naechste
// Spiele", "Live + Naechste"). Doppel-KO, Liga und Teamvergleich kennen keinen.

import { gruppenRangliste } from './gruppen';
import { rangliste, spielBeendet } from './turnier';
import type { Gleichstand, HandReihenfolge, RanglistenPartie } from './turnier';

export type OffenerStichkampf = {
  gruppe: string | null; // null: Einzelgruppe
  von: number; // Tabellenplatz, ab 1
  bis: number;
  positionen: number[]; // Positionen der Startliste in aktueller Reihenfolge
};

export function offeneStichkaempfe(
  tabellen: { gruppe: string | null; gleichstaende: Gleichstand[]; fertig: boolean }[]
): OffenerStichkampf[] {
  return tabellen.flatMap((t) =>
    t.fertig
      ? t.gleichstaende
          .filter((g) => !g.entschieden)
          .map((g) => ({ gruppe: t.gruppe, von: g.start + 1, bis: g.start + g.mitglieder.length, positionen: g.mitglieder }))
      : []
  );
}

// "Platz 3–4"
export function plaetzeText(s: { von: number; bis: number }): string {
  return s.von === s.bis ? `Platz ${s.von}` : `Platz ${s.von}–${s.bis}`;
}

export type StichkampfPartie = {
  spieler_a: string;
  spieler_b: string;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
  race_to: number | null;
  phase: string | null;
  gruppe: string | null;
};

// Aus den Rohdaten des Turniers (Fernseher): je offenem Stichkampf Gruppe,
// Plaetze und die Personen in der angezeigten Reihenfolge
export function stichkaempfeImTurnier(
  modus: string,
  e: { raceTo?: number; handReihenfolge?: HandReihenfolge; phase2?: unknown; ko?: unknown },
  aufstellung: { id: string; gruppe: string | null }[], // nach Startnummer
  partien: StichkampfPartie[],
  saetze: boolean
): { gruppe: string | null; von: number; bis: number; personen: string[] }[] {
  const mehrgruppig = modus === 'zwei-gruppen' || modus === 'gruppen-ko';
  if (modus !== 'einzelgruppe' && !mehrgruppig) return [];
  if (modus === 'zwei-gruppen' ? e.phase2 : modus === 'gruppen-ko' ? e.ko : false) return [];
  const posVon = new Map(aufstellung.map((t, i) => [t.id, i]));
  const gruppenspiele = partien.filter((p) => !p.phase || p.phase === 'gruppe');
  const offen = (p: StichkampfPartie) => !spielBeendet(p.ergebnis_a, p.ergebnis_b, p.race_to ?? e.raceTo ?? 0);
  const eingabe: RanglistenPartie[] = gruppenspiele
    .filter((p) => posVon.has(p.spieler_a) && posVon.has(p.spieler_b))
    .map((p) => ({
      a: posVon.get(p.spieler_a) as number,
      b: posVon.get(p.spieler_b) as number,
      standA: p.ergebnis_a,
      standB: p.ergebnis_b,
      vorgabeA: p.vorgabe_a,
      vorgabeB: p.vorgabe_b
    }));
  const hand = e.handReihenfolge ?? {};
  const tabellen = mehrgruppig
    ? [...new Set(aufstellung.map((t) => t.gruppe).filter((g): g is string => Boolean(g)))].sort().map((g) => ({
        gruppe: g,
        gleichstaende: gruppenRangliste(
          aufstellung.flatMap((t, i) => (t.gruppe === g ? [i] : [])),
          eingabe,
          hand,
          saetze
        ).gleichstaende,
        fertig: !gruppenspiele.some((p) => p.gruppe === g && offen(p))
      }))
    : [
        {
          gruppe: null,
          gleichstaende: rangliste(aufstellung.length, eingabe, hand, saetze).gleichstaende,
          fertig: gruppenspiele.length > 0 && !gruppenspiele.some(offen)
        }
      ];
  return offeneStichkaempfe(tabellen).map((s) => ({
    gruppe: s.gruppe,
    von: s.von,
    bis: s.bis,
    personen: s.positionen.map((pos) => aufstellung[pos].id)
  }));
}
