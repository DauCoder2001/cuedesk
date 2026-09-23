// Turniermodus des Pool-Scoreboards: Umrechnung zwischen den CueDesk-Partien
// und dem Spielplan, den das Scoreboard aus Pool-TS erwartet
// (tournament/active/schedule). Reine Rechnung, getestet in
// test/turnier-plan.test.ts. Die Datenbank spricht nur anbindung.ts an.

import { gruppenRangliste } from '../../src/gruppen';
import { rangliste } from '../../src/turnier';
import type { HandReihenfolge } from '../../src/turnier';

export type PlanPartie = {
  id: string;
  spieler_a: string;
  spieler_b: string;
  race_to: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
  status: 'geplant' | 'laeuft' | 'beendet' | 'abgebrochen';
  tisch_id: string | null;
  runde: number | null;
  begonnen: string | null;
  gruppe?: string | null; // Zwei Gruppen: A oder B
  phase?: string | null; // 'gruppe' oder 'phase2'
  disziplin?: string | null; // 8-ball, 9-ball, 10-ball, 14-1
};

// Ein Eintrag, wie ihn das Scoreboard kennt
export type PlanEintrag = {
  player1: string;
  player2: string;
  status: 'pending' | 'running' | 'completed';
  table: string | null;
  startedAt: number | null;
  raceTo: number | null;
  group: string;
  vorgabe1: number;
  vorgabe2: number;
  // Liga-Spieltag: jede Partie hat ihre eigene Disziplin. Ohne Angabe gilt die
  // Disziplin des Turniers.
  discipline?: string | null;
};

export type TabletTurnier = {
  id: string;
  name: string;
  status: 'running';
  paused: boolean;
  raceTo: number;
  schedule: Record<string, PlanEintrag>;
  // fuer die TV-Auslosung (Pool-TS: tournament/active)
  mode?: 'single' | 'two' | 'four';
  type?: string;
  discipline?: string;
  eventDate?: string;
  players?: Record<string, { name: string; group: number }>;
};

// Turnier-Ergebnis fuer den Fernseher (Pool-TS: tournament_archive)
export type TvErgebnis = {
  type: string;
  discipline: string;
  raceTo: number;
  date: string;
  endedAt: number;
  groups: Record<string, { name: string; games: number; wins: number; losses: number; plus: number; minus: number }[]>;
  // Gruppenturniere nach dem Abschluss: die Endplaetze (dann ohne Gruppen)
  finalPlacement?: { place: number; name: string; score: string }[];
};

export type TvTeilnehmer = { id: string; gruppe: string | null; endplatz: number | null };

// Beendet ist beendet; wer einen Tisch hat, laeuft; alles andere ist offen
// (auch ein am Notebook angefangenes Spiel ohne Tisch).
export function planStatus(p: Pick<PlanPartie, 'status' | 'tisch_id'>): PlanEintrag['status'] {
  if (p.status === 'beendet') return 'completed';
  if (p.tisch_id) return 'running';
  return 'pending';
}

// KO-Spiele heissen nach ihrer Kennung (qf1 = Viertelfinale 1)
const KO_NAME: Record<string, (id: string) => string> = {
  af: (id) => `Achtelfinale ${id.slice(2)}`,
  qf: (id) => `Viertelfinale ${id.slice(2)}`,
  sf: (id) => `Halbfinale ${id.slice(2)}`,
  fin: () => 'Finale',
  bro: () => 'Spiel um Platz 3'
};

// Beschriftung am Tablet: Runde, bei Gruppen mit Gruppe, dazu die
// Platzierungsrunden der Modi "Zwei Gruppen" und "Gruppen mit KO"
export function abschnittName(p: Pick<PlanPartie, 'runde' | 'gruppe' | 'phase'>): string {
  if (p.phase === 'phase2') return 'Platzierungsduelle';
  if (p.phase === 'phase3') return 'Platzierungsspiele';
  if (p.phase === 'ko') return KO_NAME[(p.gruppe ?? '').replace(/\d+$/, '')]?.(p.gruppe ?? '') ?? 'KO-Runde';
  const runde = p.runde ? `Runde ${p.runde}` : '';
  return p.gruppe ? `Gruppe ${p.gruppe}${runde ? ` · ${runde}` : ''}` : runde;
}

// Wie die Disziplin am Tisch heissen soll
const DISZIPLIN_NAME: Record<string, string> = {
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball',
  '14-1': '14.1'
};

export type Verdeckt = { hin?: { heim?: boolean; gast?: boolean }; rueck?: { heim?: boolean; gast?: boolean } };

// Was am Tablet zur Auswahl steht: 14.1 laeuft nicht ueber das Pool-Board
// (dort gibt es keinen Picker), und eine verdeckte Aufstellung bleibt auch am
// Tisch verdeckt - sonst waere das Verbergen umsonst.
export function fuersTablet<T extends { disziplin?: string | null; runde: number | null }>(
  partien: T[],
  verdeckt?: Verdeckt
): T[] {
  return partien.filter((p) => {
    if (p.disziplin === '14-1') return false;
    if (!verdeckt) return true;
    const seiten = p.runde === 2 ? verdeckt.rueck : verdeckt.hin;
    return !(seiten?.heim || seiten?.gast);
  });
}

export function tabletSpielplan(
  partien: PlanPartie[],
  name: (personId: string) => string,
  tischNummer: (tischId: string) => string | null
): Record<string, PlanEintrag> {
  const plan: Record<string, PlanEintrag> = {};
  // Reihenfolge wie im Spielplan (Runde, dann Paarung) - die Auswahl am
  // Tablet zeigt die Spiele in dieser Reihenfolge.
  for (const p of partien) {
    plan[p.id] = {
      player1: name(p.spieler_a),
      player2: name(p.spieler_b),
      status: planStatus(p),
      table: p.tisch_id ? tischNummer(p.tisch_id) : null,
      startedAt: p.begonnen ? Date.parse(p.begonnen) : null,
      raceTo: p.race_to,
      group: abschnittName(p),
      vorgabe1: p.vorgabe_a,
      vorgabe2: p.vorgabe_b,
      discipline: DISZIPLIN_NAME[p.disziplin ?? ''] ?? null
    };
  }
  return plan;
}

export type ErgebnisPartie = Pick<PlanPartie, 'spieler_a' | 'spieler_b' | 'vorgabe_a' | 'vorgabe_b' | 'phase'> & {
  ergebnis_a: number | null;
  ergebnis_b: number | null;
};

// Rangliste fuer den Fernseher, gerechnet wie am Notebook (v57- und
// v64-Regeln). Einzelgruppe: eine Tabelle. Gruppenturniere: eine Tabelle je
// Gruppe aus den Gruppenspielen, nach dem Abschluss die Endplaetze.
export function tvErgebnis(
  turnier: { name: string; disziplin: string; raceTo: number; datum: string; beendet?: boolean },
  teilnehmer: TvTeilnehmer[], // in Startnummern-Reihenfolge
  partien: ErgebnisPartie[],
  hand: HandReihenfolge,
  name: (personId: string) => string
): TvErgebnis {
  const pos = new Map(teilnehmer.map((t, i) => [t.id, i]));
  const eingabe = partien
    .filter((p) => !p.phase || p.phase === 'gruppe')
    .filter((p) => pos.has(p.spieler_a) && pos.has(p.spieler_b))
    .map((p) => ({
      a: pos.get(p.spieler_a) as number,
      b: pos.get(p.spieler_b) as number,
      standA: p.ergebnis_a,
      standB: p.ergebnis_b,
      vorgabeA: p.vorgabe_a,
      vorgabeB: p.vorgabe_b
    }));
  const zeile = (z: { pos: number; spiele: number; punkte: number; gewonnen: number; verloren: number }) => ({
    name: name(teilnehmer[z.pos].id),
    games: z.spiele,
    wins: z.punkte,
    losses: z.spiele - z.punkte,
    plus: z.gewonnen,
    minus: z.verloren
  });
  const gruppenNamen = [...new Set(teilnehmer.map((t) => t.gruppe).filter((g): g is string => Boolean(g)))].sort();
  const groups: TvErgebnis['groups'] =
    gruppenNamen.length === 0
      ? { 1: rangliste(teilnehmer.length, eingabe, hand).zeilen.map(zeile) }
      : Object.fromEntries(
          gruppenNamen.map((g) => {
            const mitglieder = teilnehmer.flatMap((t, i) => (t.gruppe === g ? [i] : []));
            return [g, gruppenRangliste(mitglieder, eingabe, hand).zeilen.map(zeile)];
          })
        );
  const endplaetze = teilnehmer.filter((t) => t.endplatz !== null);
  return {
    type: turnier.name,
    discipline: turnier.disziplin,
    raceTo: turnier.raceTo,
    date: new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE'),
    endedAt: Date.now(),
    groups,
    ...(gruppenNamen.length > 0 && turnier.beendet && endplaetze.length > 0
      ? {
          finalPlacement: [...endplaetze]
            .sort((a, b) => (a.endplatz ?? 0) - (b.endplatz ?? 0))
            .map((t) => ({ place: t.endplatz as number, name: name(t.id), score: '' }))
        }
      : {})
  };
}

// Ergebnis vom Tablet: Nach einem Seitenwechsel stehen die Spieler dort
// vertauscht. Massgeblich ist deshalb der Name, nicht die Seite.
export function ergebnisVomTablet(
  eintrag: Pick<PlanEintrag, 'player1' | 'player2'>,
  ergebnis: { player1: string; player2: string; score1: number; score2: number }
): { ergebnis_a: number; ergebnis_b: number } {
  const getauscht =
    eintrag.player1 !== eintrag.player2 &&
    ergebnis.player1 === eintrag.player2 &&
    ergebnis.player2 === eintrag.player1;
  return getauscht
    ? { ergebnis_a: ergebnis.score2, ergebnis_b: ergebnis.score1 }
    : { ergebnis_a: ergebnis.score1, ergebnis_b: ergebnis.score2 };
}
