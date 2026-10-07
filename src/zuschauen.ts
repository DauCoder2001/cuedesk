// Zuschauerseite fuer Mitglieder (src/seiten/Zuschauen.tsx): welches Turnier
// gezeigt wird, Tabellen, Liga-Stand und Spielliste. Reine Rechnung ohne
// Datenbank, abgesichert durch test/zuschauen.test.ts. Tabellen rechnen mit
// denselben Funktionen wie die Turnieransicht (src/turnier.ts, src/gruppen.ts).

import { rangliste } from './turnier';
import { gruppenRangliste } from './gruppen';
import { KO_GRUPPEN, standardGruppenzahl } from './ko';
import { doppelVon, partnerVon, wertung } from './liga';
import type { RanglistenPartie } from './turnier';
import type { Partie, Turnier, TurnierTeilnehmer } from './datenbank.types';

type Einstellungen = {
  gruppenzahl?: number;
  handReihenfolge?: Record<string, number[]>;
  chat?: boolean;
  live?: boolean; // fehlt = an (Stufe 25)
  liga?: {
    begegnung?: 1 | 2;
    partner?: string;
    heim?: boolean;
    eigene?: string;
    gegner?: string;
    art?: 'doppel';
    haupt?: string;
  };
};
const einstellungenVon = (t: Turnier) => (t.einstellungen ?? {}) as Einstellungen;

// ---------- Welches Turnier ----------

export type Anzeige = {
  turnier: Turnier; // das laufende Turnier bzw. die laufende Begegnung
  begegnungen: Turnier[]; // Liga: beide Begegnungen (1. zuerst), sonst nur das Turnier
  chatTurnier: Turnier; // Turnier, an dem der Chat haengt (Liga: 1. Begegnung)
};

export const NACHLAUF_MS = 24 * 60 * 60 * 1000; // so lange bleibt ein Chat nach dem Ende lesbar

// Das juengste laufende Turnier, sonst eines, das vor weniger als einem Tag
// zu Ende ging (sein Chat ist dann noch lesbar); beim Liga-Spieltag beide
// Begegnungen.
export function anzeigeWaehlen(turniere: Turnier[], jetzt = Date.now()): Anzeige | null {
  const neueste = (a: Turnier, b: Turnier) => b.datum.localeCompare(a.datum) || b.erstellt_am.localeCompare(a.erstellt_am);
  const laufend = turniere.filter((t) => t.status === 'laeuft').sort(neueste);
  const kuerzlich = turniere
    .filter((t) => t.status !== 'laeuft' && t.beendet_am && jetzt - Date.parse(t.beendet_am) < NACHLAUF_MS)
    .sort((a, b) => (b.beendet_am ?? '').localeCompare(a.beendet_am ?? ''));
  const turnier = laufend[0] ?? kuerzlich[0];
  if (!turnier) return null;
  if (turnier.modus !== 'liga') return { turnier, begegnungen: [turnier], chatTurnier: turnier };
  // Laeuft die Doppel-Begegnung, gehoert sie zum Spieltag ihrer 1. Begegnung
  const haupt = einstellungenVon(turnier).liga?.art === 'doppel'
    ? turniere.find((t) => t.id === einstellungenVon(turnier).liga?.haupt) ?? null
    : null;
  const basis = haupt ?? turnier;
  const partner = partnerVon(basis, turniere);
  const doppel = doppelVon(basis, turniere);
  const alle = [basis, ...(partner ? [partner] : []), ...(doppel ? [doppel] : [])];
  // Reihenfolge wie gespielt: 1., Doppel, 2. (gespeichert)
  const rang = (t: Turnier) => (einstellungenVon(t).liga?.art === 'doppel' ? 1.5 : einstellungenVon(t).liga?.begegnung ?? 1);
  alle.sort((a, b) => rang(a) - rang(b));
  return { turnier, begegnungen: alle, chatTurnier: alle[0] };
}

// Chat nur mit Live-Uebertragung (Stufe 29); "chat" bleibt gespeichert und gilt
// wieder, sobald Live an ist
export const chatAn = (t: Turnier) => einstellungenVon(t).chat === true && einstellungenVon(t).live !== false;

// ---------- Tabellen ----------

export type Tabellenzeile = { personId: string; spiele: number; siege: number; diff: number };
export type Tabelle = { gruppe: string | null; zeilen: Tabellenzeile[] };

const istGruppenspiel = (p: Partie) => !p.phase || p.phase === 'gruppe';

// Gruppentabellen wie in der Turnieransicht: Einzelgruppe eine Tabelle,
// sonst je Gruppe. Liga-Spieltage haben keine Tabelle.
export function tabellen(turnier: Turnier, teilnehmer: TurnierTeilnehmer[], partien: Partie[]): Tabelle[] {
  if (turnier.modus === 'liga') return [];
  const e = einstellungenVon(turnier);
  const aufstellung = teilnehmer
    .filter((t) => t.startnummer !== null)
    .sort((a, b) => (a.startnummer ?? 0) - (b.startnummer ?? 0));
  const posVon = new Map(aufstellung.map((t, i) => [t.person_id, i]));
  const eingabe: RanglistenPartie[] = partien
    .filter((p) => istGruppenspiel(p) && posVon.has(p.spieler_a) && posVon.has(p.spieler_b))
    .map((p) => ({
      a: posVon.get(p.spieler_a) as number,
      b: posVon.get(p.spieler_b) as number,
      standA: p.ergebnis_a,
      standB: p.ergebnis_b,
      vorgabeA: p.vorgabe_a,
      vorgabeB: p.vorgabe_b
    }));
  const hand = e.handReihenfolge ?? {};
  const zeile = (z: { pos: number; spiele: number; punkte: number; diff: number }): Tabellenzeile => ({
    personId: aufstellung[z.pos]?.person_id ?? '',
    spiele: z.spiele,
    siege: z.punkte,
    diff: z.diff
  });
  if (turnier.modus === 'einzelgruppe') {
    return [{ gruppe: null, zeilen: rangliste(aufstellung.length, eingabe, hand).zeilen.map(zeile) }];
  }
  const namen =
    turnier.modus === 'zwei-gruppen'
      ? ['A', 'B']
      : KO_GRUPPEN.slice(0, e.gruppenzahl ?? standardGruppenzahl(teilnehmer.length));
  return namen.map((g) => {
    const mitglieder = aufstellung.map((t, i) => (t.gruppe === g ? i : -1)).filter((i) => i >= 0);
    return { gruppe: g, zeilen: gruppenRangliste(mitglieder, eingabe, hand).zeilen.map(zeile) };
  });
}

// ---------- Liga ----------

export type LigaStand = {
  heim: string;
  gast: string;
  partiepunkte: [number, number]; // Heim zuerst
  matchpunkte: [number, number] | null; // erst wenn alle Partien entschieden sind
};

// Stand einer Begegnung; gezaehlt werden nur beendete Partien (Heim = Seite A)
export function ligaStand(begegnung: Turnier, partien: Partie[], vereinName: string): LigaStand {
  const liga = einstellungenVon(begegnung).liga ?? {};
  const eigene = liga.eigene || vereinName;
  const gegner = liga.gegner || 'Gegner';
  const w = wertung(
    partien
      .filter((p) => p.turnier_id === begegnung.id)
      .map((p) => ({
        nr: ((p.runde ?? 1) - 1) * 4 + (p.paarung ?? 1),
        heim: p.status === 'beendet' ? p.ergebnis_a : null,
        gast: p.status === 'beendet' ? p.ergebnis_b : null
      }))
  );
  const wirHeim = liga.heim ?? true;
  return {
    heim: wirHeim ? eigene : gegner,
    gast: wirHeim ? gegner : eigene,
    partiepunkte: w.partiepunkte,
    matchpunkte: w.entschieden && partien.some((p) => p.turnier_id === begegnung.id) ? w.matchpunkte : null
  };
}

// ---------- Spiele ----------

// Paarung fuer die Spiellisten, wie am Tablet: ohne Vereinszusatz
// ("Marcel B. (Bassum)" -> "Marcel B."), im Doppel "A / B". Waeren beide
// Seiten danach gleich, bleibt der Zusatz stehen.
const ohneZusatz = (text: string) => text.replace(/\s*\([^()]*\)\s*$/, '').trim() || text;
export function paarungText(
  p: Pick<Partie, 'spieler_a' | 'spieler_b' | 'partner_a' | 'partner_b'>,
  name: (id: string) => string
): string {
  const seite = (erster: string, zweiter: string | null, kurz: boolean) => {
    const n = (id: string) => (kurz ? ohneZusatz(name(id)) : name(id));
    return zweiter ? `${n(erster)} / ${n(zweiter)}` : n(erster);
  };
  const kurz = seite(p.spieler_a, p.partner_a, true) !== seite(p.spieler_b, p.partner_b, true);
  return `${seite(p.spieler_a, p.partner_a, kurz)} – ${seite(p.spieler_b, p.partner_b, kurz)}`;
}

export type Spiellage = {
  laufend: Partie[];
  naechste: Partie[]; // bis zu drei offene Spiele in Planreihenfolge
  heute: Partie[]; // heute beendet, neueste zuerst
};

// Kalendertag eines Zeitpunkts in der Ortszeit des Geraets ("2026-09-30")
export function ortsTag(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function spiellage(partien: Partie[], heute: string, naechsteHoechstens = 3): Spiellage {
  const nachPlan = (a: Partie, b: Partie) =>
    (a.runde ?? 0) - (b.runde ?? 0) || (a.paarung ?? 0) - (b.paarung ?? 0) || a.erstellt_am.localeCompare(b.erstellt_am);
  return {
    laufend: partien.filter((p) => p.status === 'laeuft').sort(nachPlan),
    naechste: partien.filter((p) => p.status === 'geplant').sort(nachPlan).slice(0, naechsteHoechstens),
    heute: partien
      .filter((p) => p.status === 'beendet' && p.beendet !== null && ortsTag(p.beendet) === heute)
      .sort((a, b) => (b.beendet ?? '').localeCompare(a.beendet ?? ''))
  };
}
