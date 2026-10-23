// Turniermodus des Pool-Scoreboards: Umrechnung zwischen den CueDesk-Partien
// und dem Spielplan, den das Scoreboard aus Pool-TS erwartet
// (tournament/active/schedule). Reine Rechnung, getestet in
// test/turnier-plan.test.ts. Die Datenbank spricht nur anbindung.ts an.

import { gruppenRangliste } from '../../src/gruppen';
import { rangliste } from '../../src/turnier';
import type { HandReihenfolge } from '../../src/turnier';

export type PlanPartie = {
  id: string;
  // Leer nur beim Team-Match eines Teamvergleichs (Team gegen Team)
  spieler_a: string | null;
  spieler_b: string | null;
  // Doppel (Liga, Doppel-Begegnung): zweiter Spieler je Seite
  partner_a?: string | null;
  partner_b?: string | null;
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
  // 14.1: Aufnahmen-Begrenzung aus den Ausspielzielen (raceTo ist das Punkteziel)
  innings?: number | null;
  // Kennungen aller Spieler der Partie, im Doppel bis zu vier. Damit erkennt
  // das Tablet jeden einzeln, der gerade an einem anderen Tisch spielt.
  personen?: string[];
  // Liga: Laufen mehrere Begegnungen eines Spieltags zugleich, steht hier, zu
  // welcher die Partie gehoert ("1. Begegnung", "Doppel", "2. Begegnung"),
  // und die Reihenfolge fuer die Auswahl. Bei nur einer Begegnung fehlt beides.
  begegnung?: string | null;
  begegnungNr?: number;
  // Fuer "Naechste Spiele" am Fernseher: Rang wie in der Spielplan-Liste der
  // Turnieransicht und die Kennungen je Seite (wer spielt gerade woanders?)
  reihe?: string;
  personen1?: string[];
  personen2?: string[];
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
  // Teamvergleich: Teamnamen und Kapitaene statt "Gruppe A/B" (TV "Teams")
  groupNames?: Record<number, string>;
  captains?: Record<number, string | null>;
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
  // Teamvergleich: Bloecke mit Team-Match, Doppel und Einzel
  if (p.phase && p.phase in TEAM_ART_NAME) return `Block ${p.runde ?? 1} · ${TEAM_ART_NAME[p.phase]}`;
  if (p.phase === 'phase2') return 'Platzierungsduelle';
  if (p.phase === 'phase3') return 'Platzierungsspiele';
  if (p.phase === 'ko') return KO_NAME[(p.gruppe ?? '').replace(/\d+$/, '')]?.(p.gruppe ?? '') ?? 'KO-Runde';
  const runde = p.runde ? `Runde ${p.runde}` : '';
  return p.gruppe ? `Gruppe ${p.gruppe}${runde ? ` · ${runde}` : ''}` : runde;
}

// Am Tisch zaehlt der Name, nicht der Verein: "Matthias H. (Bassum)" wird zu
// "Matthias H.". Der Zusatz bleibt aber stehen, wenn beide Namen einer Partie
// sonst gleich waeren.
export function ohneZusatz(text: string): string {
  const kurz = text.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return kurz || text;
}

// Spielen am Board noch dieselben zwei Personen wie im Spielplan? Die Seiten
// sind egal, der Vereinszusatz auch. Gebraucht wird das, wenn ein Ergebnis fuer
// eine Partie ankommt, die zwischendurch zurueck in den Plan gelegt wurde:
// Wurde danach die Aufstellung geaendert, darf es nicht mehr hinein.
export function dieselbenSpieler(
  eintrag: { player1?: string | null; player2?: string | null },
  amTisch: { player1?: string | null; player2?: string | null }
): boolean {
  const paar = (x: { player1?: string | null; player2?: string | null }) =>
    [ohneZusatz(String(x.player1 ?? '')), ohneZusatz(String(x.player2 ?? ''))].sort();
  const [a1, a2] = paar(eintrag);
  const [b1, b2] = paar(amTisch);
  return a1 !== '' && a2 !== '' && a1 === b1 && a2 === b2;
}

// Teamvergleich: Match-Arten (phase der Partie)
const TEAM_ART_NAME: Record<string, string> = { team: 'Team-Match', doppel: 'Doppel', einzel: 'Einzel' };

// Wie die Disziplin am Tisch heissen soll
const DISZIPLIN_NAME: Record<string, string> = {
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball',
  '14-1': '14.1'
};

export type Verdeckt = { hin?: { heim?: boolean; gast?: boolean }; rueck?: { heim?: boolean; gast?: boolean } };
// Liga: Hin- und Rueckrunde einer Begegnung werden einzeln gestartet. Fehlt
// der Eintrag (Spieltage von vor dieser Regel), gelten beide als gestartet.
export type Gestartet = { hin?: boolean; rueck?: boolean };

export function rundeGestartet(gestartet: Gestartet | undefined, runde: number | null): boolean {
  if (!gestartet) return true;
  return Boolean(runde === 2 ? gestartet.rueck : gestartet.hin);
}

// Was am Tablet zur Auswahl steht: eine verdeckte Aufstellung bleibt auch am
// Tisch verdeckt, sonst waere das Verbergen umsonst; eine noch nicht
// gestartete Runde erscheint gar nicht. Welches Board welche Disziplin zeigt,
// entscheidet das Board (8/9/10-Ball am Pool-Board, 14.1 am 14.1-Board).
export function fuersTablet<T extends { runde: number | null }>(partien: T[], verdeckt?: Verdeckt, gestartet?: Gestartet): T[] {
  return partien.filter((p) => {
    if (!rundeGestartet(gestartet, p.runde)) return false;
    const seiten = p.runde === 2 ? verdeckt?.rueck : verdeckt?.hin;
    return !(seiten?.heim || seiten?.gast);
  });
}

// Teamvergleich: Namen der Teams und ihre Spieler (fuer das Team-Match)
export type TabletTeams = { namen: Record<'A' | 'B', string>; spieler: Record<'A' | 'B', string[]> };

// Teamvergleich am Tablet: nur freigegebene Bloecke, entfallene Matches nicht
export function fuersTabletTeam<T extends { runde: number | null; status: string }>(partien: T[], freigegeben: number): T[] {
  return partien.filter((p) => (p.runde ?? 1) <= freigegeben && p.status !== 'abgebrochen');
}

export function tabletSpielplan(
  partien: PlanPartie[],
  name: (personId: string) => string,
  tischNummer: (tischId: string) => string | null,
  aufnahmen141?: number | null,
  teams?: TabletTeams
): Record<string, PlanEintrag> {
  const plan: Record<string, PlanEintrag> = {};
  // Reihenfolge wie im Spielplan (Runde, dann Paarung) - die Auswahl am
  // Tablet zeigt die Spiele in dieser Reihenfolge.
  for (const p of partien) {
    // Im Doppel steht je Seite "A / B"; der Vereinszusatz faellt je Name weg
    const seite = (erster: string, zweiter: string | null | undefined, kurz: boolean) => {
      const n = (id: string) => (kurz ? ohneZusatz(name(id)) : name(id));
      return zweiter ? `${n(erster)} / ${n(zweiter)}` : n(erster);
    };
    // Team-Match (Teamvergleich): Team gegen Team; belegt sind alle Spieler beider
    // Teams, denn im Team-Match spielen alle reihum
    if (p.spieler_a === null || p.spieler_b === null) {
      if (!teams) continue;
      plan[p.id] = {
        player1: teams.namen.A,
        player2: teams.namen.B,
        status: planStatus(p),
        table: p.tisch_id ? tischNummer(p.tisch_id) : null,
        startedAt: p.begonnen ? Date.parse(p.begonnen) : null,
        raceTo: p.race_to,
        group: abschnittName(p),
        vorgabe1: p.vorgabe_a,
        vorgabe2: p.vorgabe_b,
        discipline: DISZIPLIN_NAME[p.disziplin ?? ''] ?? null,
        innings: null,
        personen: [...teams.spieler.A, ...teams.spieler.B],
        reihe: listenRang(p),
        personen1: teams.spieler.A,
        personen2: teams.spieler.B
      };
      continue;
    }
    const spielerA = p.spieler_a;
    const spielerB = p.spieler_b;
    const eindeutig = seite(spielerA, p.partner_a, true) !== seite(spielerB, p.partner_b, true);
    plan[p.id] = {
      player1: seite(spielerA, p.partner_a, eindeutig),
      player2: seite(spielerB, p.partner_b, eindeutig),
      status: planStatus(p),
      table: p.tisch_id ? tischNummer(p.tisch_id) : null,
      startedAt: p.begonnen ? Date.parse(p.begonnen) : null,
      raceTo: p.race_to,
      group: abschnittName(p),
      vorgabe1: p.vorgabe_a,
      vorgabe2: p.vorgabe_b,
      discipline: DISZIPLIN_NAME[p.disziplin ?? ''] ?? null,
      innings: p.disziplin === '14-1' ? aufnahmen141 ?? null : null,
      personen: [p.spieler_a, p.partner_a, p.spieler_b, p.partner_b].filter((id): id is string => Boolean(id)),
      reihe: listenRang(p),
      personen1: [p.spieler_a, p.partner_a].filter((id): id is string => Boolean(id)),
      personen2: [p.spieler_b, p.partner_b].filter((id): id is string => Boolean(id))
    };
  }
  return plan;
}

// Rang in der Spielplan-Liste (wie listenAbschnitte in TurnierAnsicht.tsx):
// Gruppenrunden abwechselnd (A 1, B 1, A 2 ...), danach Duelle, KO, Phase 3
export function listenRang(p: Pick<PlanPartie, 'runde' | 'gruppe' | 'phase'>): string {
  const r = String(p.runde ?? 0).padStart(3, '0');
  if (p.phase === 'phase2') return '1Z';
  if (p.phase === 'phase3') return '1Z3';
  if (p.phase === 'ko') return `1Y${r}`;
  return `0${r}${p.gruppe ?? ''}`;
}

export type NaechstesSpiel = {
  id: string;
  eintrag: PlanEintrag;
  belegt: { name: string; tisch: string | null }[]; // Seiten, die gerade woanders spielen
};

// Die naechsten offenen Spiele (ohne Tisch, beide Spieler bekannt) in der
// Reihenfolge der Spielplan-Liste. Bei mehreren Liga-Begegnungen zuerst nach
// Begegnung.
export function naechsteSpiele(schedule: Record<string, PlanEintrag> | null | undefined, anzahl: number): NaechstesSpiel[] {
  const alle = Object.entries(schedule ?? {});
  const tischVon = new Map<string, string | null>();
  for (const [, e] of alle) {
    if (e.status === 'running') (e.personen ?? []).forEach((id) => tischVon.set(id, e.table));
  }
  const rang = (e: PlanEintrag) => `${String(e.begegnungNr ?? 0).padStart(2, '0')}${e.reihe ?? ''}`;
  return alle
    .filter(([, e]) => e.status === 'pending' && e.player1 && e.player2)
    .map(([id, e], i) => ({ id, e, i }))
    .sort((a, b) => rang(a.e).localeCompare(rang(b.e)) || a.i - b.i)
    .slice(0, anzahl)
    .map(({ id, e }) => {
      const belegt: NaechstesSpiel['belegt'] = [];
      const seite = (ids: string[] | undefined, name: string) => {
        const id = (ids ?? []).find((x) => tischVon.has(x));
        if (id) belegt.push({ name, tisch: tischVon.get(id) ?? null });
      };
      seite(e.personen1, e.player1);
      seite(e.personen2, e.player2);
      return { id, eintrag: e, belegt };
    });
}

// Laufende Tische fuer die Fusszeile, nach Tischnummer
export function laufendeTische(schedule: Record<string, PlanEintrag> | null | undefined): PlanEintrag[] {
  return Object.values(schedule ?? {})
    .filter((e) => e.status === 'running')
    .sort((a, b) => Number(a.table ?? 0) - Number(b.table ?? 0));
}

// ---------- Liga: mehrere Begegnungen zugleich an den Tablets ----------

// Verweise zwischen den Begegnungen eines Spieltags (einstellungen.liga)
export type LigaVerweis = { art?: string; haupt?: string; begegnung?: number; partner?: string };
type MitLiga = { id: string; status: string; modus?: string | null; einstellungen: unknown };

const ligaVon = (t: MitLiga): LigaVerweis | null =>
  t.modus === 'liga' ? ((t.einstellungen ?? {}) as { liga?: LigaVerweis }).liga ?? null : null;

// Kennung der 1. Begegnung: gemeinsamer Schluessel aller Begegnungen eines
// Spieltags (wie spieltagLaden in anbindung.ts)
export function spieltagSchluessel(t: MitLiga): string | null {
  const liga = ligaVon(t);
  if (!liga) return null;
  if (liga.art === 'doppel') return liga.haupt ?? null;
  return (liga.begegnung ?? 1) === 1 ? t.id : liga.partner ?? null;
}

// Name und Reihenfolge am Tablet: 1. Begegnung, Doppel, 2. Begegnung
export function begegnungKennung(t: MitLiga): { name: string; nr: number } {
  const liga = ligaVon(t);
  if (liga?.art === 'doppel') return { name: 'Doppel', nr: 2 };
  return (liga?.begegnung ?? 1) === 2 ? { name: '2. Begegnung', nr: 3 } : { name: '1. Begegnung', nr: 1 };
}

// Welche laufenden Turniere teilen sich die Tablets mit "t"? Bei einem
// Liga-Spieltag alle gestarteten Begegnungen desselben Spieltags, sortiert;
// sonst nur "t" selbst. Nicht gestartete oder beendete bleiben draussen.
export function laufendeBegegnungen<T extends MitLiga>(liste: T[], t: T): T[] {
  const schluessel = spieltagSchluessel(t);
  if (!schluessel || t.status !== 'laeuft') return [t];
  return liste
    .filter((x) => x.status === 'laeuft' && spieltagSchluessel(x) === schluessel)
    .sort((a, b) => begegnungKennung(a).nr - begegnungKennung(b).nr);
}

export type ErgebnisPartie =Pick<PlanPartie, 'spieler_a' | 'spieler_b' | 'vorgabe_a' | 'vorgabe_b' | 'phase'> & {
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
    .filter((p) => p.spieler_a !== null && p.spieler_b !== null && pos.has(p.spieler_a) && pos.has(p.spieler_b))
    .map((p) => ({
      a: pos.get(p.spieler_a as string) as number,
      b: pos.get(p.spieler_b as string) as number,
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
// Hat das Board die Seiten getauscht? Dann gehoert Seite 1 zu Spieler B.
export function seitenGetauscht(
  eintrag: Pick<PlanEintrag, 'player1' | 'player2'>,
  ergebnis: { player1: string; player2: string }
): boolean {
  // Verglichen wird ohne Vereinszusatz: Ein Board kann den Namen noch in der
  // langen Form fuehren, waehrend der Spielplan schon die kurze zeigt.
  return (
    ohneZusatz(eintrag.player1) !== ohneZusatz(eintrag.player2) &&
    ohneZusatz(ergebnis.player1) === ohneZusatz(eintrag.player2) &&
    ohneZusatz(ergebnis.player2) === ohneZusatz(eintrag.player1)
  );
}

export function ergebnisVomTablet(
  eintrag: Pick<PlanEintrag, 'player1' | 'player2'>,
  ergebnis: { player1: string; player2: string; score1: number; score2: number }
): { ergebnis_a: number; ergebnis_b: number } {
  const getauscht = seitenGetauscht(eintrag, ergebnis);
  return getauscht
    ? { ergebnis_a: ergebnis.score2, ergebnis_b: ergebnis.score1 }
    : { ergebnis_a: ergebnis.score1, ergebnis_b: ergebnis.score2 };
}
