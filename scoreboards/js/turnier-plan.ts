// Turniermodus des Pool-Scoreboards: Umrechnung zwischen den CueDesk-Partien
// und dem Spielplan, den das Scoreboard aus Pool-TS erwartet
// (tournament/active/schedule). Reine Rechnung, getestet in
// test/turnier-plan.test.ts. Die Datenbank spricht nur anbindung.ts an.

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
};

export type TabletTurnier = {
  id: string;
  name: string;
  status: 'running';
  paused: boolean;
  raceTo: number;
  schedule: Record<string, PlanEintrag>;
  // fuer die TV-Auslosung (Pool-TS: tournament/active)
  mode?: 'single';
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
};

// Beendet ist beendet; wer einen Tisch hat, laeuft; alles andere ist offen
// (auch ein am Notebook angefangenes Spiel ohne Tisch).
export function planStatus(p: Pick<PlanPartie, 'status' | 'tisch_id'>): PlanEintrag['status'] {
  if (p.status === 'beendet') return 'completed';
  if (p.tisch_id) return 'running';
  return 'pending';
}

// Beschriftung am Tablet: Runde, bei Gruppen mit Gruppe, Platzierungsduelle als Phase 2
export function abschnittName(p: Pick<PlanPartie, 'runde' | 'gruppe' | 'phase'>): string {
  if (p.phase === 'phase2') return 'Phase 2';
  const runde = p.runde ? `Runde ${p.runde}` : '';
  return p.gruppe ? `Gruppe ${p.gruppe}${runde ? ` · ${runde}` : ''}` : runde;
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
      vorgabe2: p.vorgabe_b
    };
  }
  return plan;
}

export type ErgebnisPartie = Pick<PlanPartie, 'spieler_a' | 'spieler_b' | 'vorgabe_a' | 'vorgabe_b'> & {
  ergebnis_a: number | null;
  ergebnis_b: number | null;
};

// Rangliste fuer den Fernseher, gerechnet wie am Notebook (v57-Regeln)
export function tvErgebnis(
  turnier: { name: string; disziplin: string; raceTo: number; datum: string },
  startliste: string[], // Personen in Startnummern-Reihenfolge
  partien: ErgebnisPartie[],
  hand: HandReihenfolge,
  name: (personId: string) => string
): TvErgebnis {
  const pos = new Map(startliste.map((id, i) => [id, i]));
  const { zeilen } = rangliste(
    startliste.length,
    partien
      .filter((p) => pos.has(p.spieler_a) && pos.has(p.spieler_b))
      .map((p) => ({
        a: pos.get(p.spieler_a) as number,
        b: pos.get(p.spieler_b) as number,
        standA: p.ergebnis_a,
        standB: p.ergebnis_b,
        vorgabeA: p.vorgabe_a,
        vorgabeB: p.vorgabe_b
      })),
    hand
  );
  return {
    type: turnier.name,
    discipline: turnier.disziplin,
    raceTo: turnier.raceTo,
    date: new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE'),
    endedAt: Date.now(),
    groups: {
      1: zeilen.map((z) => ({
        name: name(startliste[z.pos]),
        games: z.spiele,
        wins: z.punkte,
        losses: z.spiele - z.punkte,
        plus: z.gewonnen,
        minus: z.verloren
      }))
    }
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
