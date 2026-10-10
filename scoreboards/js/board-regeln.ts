// Regeln der beiden Scoreboards (Pool und 14.1) ohne Bildschirm und ohne
// Datenbank: Wann laeuft ein freies Spiel, welche Paarungen stehen zur Wahl,
// wem gehoert ein Spiel, wann wird der Tisch frei. Die Boards rufen nur noch
// diese Funktionen auf; getestet wird in test/board-regeln.test.ts.
//
// Die Boards sind reines JavaScript und kennen die Eintraege aus dem Spielplan
// (tournament/active/schedule). Die Typen hier sind deshalb bewusst locker.

import { dieselbenSpieler } from './turnier-plan';
import type { PlanEintrag } from './turnier-plan';

export type BoardArt = 'pool' | '14.1';

// Ein Spiel im Tablet-Spielplan. Neben den Feldern aus CueDesk kennt das
// Board aus Pool-TS noch KO-Verweise und Titel.
export type BoardSpiel = Partial<PlanEintrag> & {
  phase?: string | null;
  title?: string | null;
  resultId?: string | null;
  winnerTo?: { match: string; slot: 1 | 2 } | null;
  loserTo?: { match: string; slot: 1 | 2 } | null;
};

export type BoardTurnier = {
  status?: string;
  paused?: boolean;
  raceTo?: number;
  schedule?: Record<string, BoardSpiel> | null;
} | null | undefined;

// Stand am Tisch (tables/<n>), wie ihn die Boards speichern
export type TischStand = {
  gameType?: string;
  tournamentMatchId?: string | null;
  frei?: boolean;
  player1?: string;
  player2?: string;
  startedAt?: number | null;
  score1?: number; // Pool
  score2?: number;
  raceTo?: number;
  s1?: number; // 14.1
  s2?: number;
  inn1?: number;
  inn2?: number;
  locked?: boolean;
  log?: unknown[];
} | null | undefined;

const istFreilos = (name: unknown) => String(name).includes('FREILOS');

// ---------- Wechsel der Spielart ----------

// Oeffnet man am selben Tablet das andere Board, ersetzt es den Stand am Tisch.
// Liegt dort ein freies, angefangenes und nicht beendetes Spiel der anderen Art,
// liefert die Funktion die Rueckfrage, sonst null (leer, beendet oder nur
// Namen: ohne Nachfrage ersetzen wie bisher). Turnierspiele schuetzen die
// Boards schon vorher. "art" ist das Board, das gerade startet.
export function wechselRueckfrage(d: TischStand, art: BoardArt, tisch: string): string | null {
  if (!d || d.tournamentMatchId) return null;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  const p1 = d.player1 || 'Spieler 1';
  const p2 = d.player2 || 'Spieler 2';
  if (art === 'pool') {
    if (d.gameType !== '14.1' || d.locked) return null;
    const aufnahmen = n(d.inn1) + n(d.inn2);
    const angefangen =
      n(d.s1) !== 0 || n(d.s2) !== 0 || aufnahmen > 0 || (Array.isArray(d.log) && d.log.length > 0);
    if (!angefangen) return null;
    const aufn = aufnahmen === 1 ? '1 Aufnahme' : `${aufnahmen} Aufnahmen`;
    return (
      `An Tisch ${tisch} läuft ein 14.1-Spiel:\n${p1} ${n(d.s1)} : ${n(d.s2)} ${p2} (${aufn})\n\n` +
      'Auf 8/9/10-Ball wechseln? Der 14.1-Spielstand geht dabei verloren.'
    );
  }
  if (d.gameType !== 'pool') return null;
  const s1 = n(d.score1);
  const s2 = n(d.score2);
  if (s1 === 0 && s2 === 0) return null;
  if (n(d.raceTo) > 0 && Math.max(s1, s2) >= n(d.raceTo)) return null; // Race erreicht = beendet
  return (
    `An Tisch ${tisch} läuft ein 8/9/10-Ball-Spiel:\n${p1} ${s1} : ${s2} ${p2}\n\n` +
    'Auf 14.1 wechseln? Der 8/9/10-Ball-Spielstand geht dabei verloren.'
  );
}

// ---------- Freies Spiel ----------

// Hat an diesem Tisch schon ein freies Spiel angefangen? Dann bleibt das Board
// im Frei-Modus - auch nach dem Neuladen und auch, wenn nebenher ein Turnier
// laeuft. Frueher fiel es in die Spielauswahl, und "Frei spielen" ueberschrieb
// das laufende Spiel.
export function freiesSpielLaeuft(d: TischStand, art: BoardArt): boolean {
  if (!d || d.tournamentMatchId) return false;
  if (art === 'pool' && d.gameType !== 'pool') return false;
  if (d.frei) return true;
  const namenGesetzt =
    (!!d.player1 && d.player1 !== 'Spieler 1') || (!!d.player2 && d.player2 !== 'Spieler 2');
  if (art === 'pool') {
    return (d.score1 || 0) !== 0 || (d.score2 || 0) !== 0 || !!d.startedAt || namenGesetzt;
  }
  return (
    (d.s1 || 0) !== 0 ||
    (d.s2 || 0) !== 0 ||
    (Array.isArray(d.log) && d.log.length > 0) ||
    !!d.startedAt ||
    namenGesetzt
  );
}

// ---------- Offene Paarungen ----------

// Offene Spiele mit feststehenden Spielern fuer ein Board. Das 14.1-Board
// spielt die 14.1-Partien, das Pool-Board die uebrigen Disziplinen eines
// Liga-Spieltags (ohne Disziplin gehoert ein Spiel nicht in diese Liste).
export function offeneSpiele(turnier: BoardTurnier, art: BoardArt): (BoardSpiel & { id: string })[] {
  if (!turnier || !turnier.schedule) return [];
  return Object.entries(turnier.schedule)
    .filter(([, m]) => {
      if (m.status !== 'pending' || !m.player1 || !m.player2) return false;
      return art === '14.1' ? m.discipline === '14.1' : !!m.discipline && m.discipline !== '14.1';
    })
    .map(([id, m]) => ({ id, ...m }));
}

// Spiele, die laut Spielplan an diesem Tisch laufen, deren Stand am Tisch aber
// fehlt (etwa weil ein anderes Board den Tisch ueberschrieben hat). Ohne diese
// Liste haengen sie fest: nicht offen, also in keiner Auswahl, und kein Board
// haelt sie mehr.
export function haengendeSpiele(
  turnier: BoardTurnier,
  art: BoardArt,
  tisch: string | number,
  amTisch: TischStand
): (BoardSpiel & { id: string })[] {
  if (!turnier || !turnier.schedule) return [];
  return Object.entries(turnier.schedule)
    .filter(([id, m]) => {
      if (!gehoertZumTisch(m, tisch) || id === amTisch?.tournamentMatchId) return false;
      return art === '14.1' ? m.discipline === '14.1' : m.discipline !== '14.1';
    })
    .map(([id, m]) => ({ id, ...m }));
}

// Laeuft am Tisch eine Turnierpartie der anderen Spielart? Dann darf dieses
// Board den Tisch nicht stillschweigend uebernehmen.
export function fremdesTurnierspiel(amTisch: TischStand, art: BoardArt): boolean {
  if (!amTisch || !amTisch.tournamentMatchId) return false;
  return art === 'pool' ? amTisch.gameType !== 'pool' : amTisch.gameType === 'pool';
}

// Ueberschrift fuer die Paarungen, die am jeweils anderen Board warten.
// "art" ist das Board, an dem sie gespielt werden.
export function wartetText(anzahl: number, art: BoardArt): string {
  if (art === '14.1') return anzahl === 1 ? 'Ein 14.1-Spiel wartet noch:' : `${anzahl} 14.1-Spiele warten noch:`;
  return anzahl === 1 ? 'Ein weiteres Spiel wartet noch:' : `${anzahl} weitere Spiele warten noch:`;
}

// ---------- Spielauswahl am Pool-Board ----------

// Wer steckt gerade in einem laufenden Spiel? (zum Ausgrauen) Enthaelt die
// angezeigten Namen und, aus CueDesk, die Kennungen jedes einzelnen Spielers.
// Im Doppel steht als Name das Paar ("A / B"); erst die Kennungen zeigen, dass
// A auch in einem anderen Doppel steht.
export function belegteSpieler(turnier: BoardTurnier): Set<string> {
  const belegt = new Set<string>();
  Object.values(turnier?.schedule ?? {}).forEach((m) => {
    if (m.status === 'running') {
      if (m.player1) belegt.add(m.player1);
      if (m.player2) belegt.add(m.player2);
      (m.personen ?? []).forEach((id) => belegt.add(id));
    }
  });
  return belegt;
}

// Kann das Spiel jetzt beginnen, ohne dass jemand an zwei Tischen steht?
// Mit Kennungen (CueDesk) zaehlt jeder Spieler einzeln, ohne (Pool-TS,
// offline) der angezeigte Name.
function spielerFrei(m: BoardSpiel, belegt: Set<string>): boolean {
  if (m.personen && m.personen.length > 0) return m.personen.every((id) => !belegt.has(id));
  return !belegt.has(m.player1 as string) && !belegt.has(m.player2 as string);
}

// Namen fuer den Filter: alle, die noch offene Spiele haben, ohne Freilos
export function filterNamen(turnier: BoardTurnier): string[] {
  const namen = new Set<string>();
  Object.values(turnier?.schedule ?? {}).forEach((m) => {
    if (m.status !== 'pending') return;
    if (m.player1 && !istFreilos(m.player1)) namen.add(m.player1);
    if (m.player2 && !istFreilos(m.player2)) namen.add(m.player2);
  });
  return [...namen].sort((a, b) => a.localeCompare(b));
}

export type AuswahlEintrag = BoardSpiel & {
  id: string;
  _waiting: boolean; // KO: Vorrunde noch nicht entschieden
  _freilos: boolean;
  _playable: boolean;
};

// Die Liste der Spielauswahl am Pool-Board: offene Spiele ohne 14.1, auf
// Wunsch nur die eines Spielers. Spielbare zuerst, wartende KO-Spiele zuletzt.
export function poolAuswahl(turnier: BoardTurnier, filter: string): AuswahlEintrag[] {
  if (!turnier || !turnier.schedule) return [];
  const belegt = belegteSpieler(turnier);
  let offen = Object.entries(turnier.schedule)
    // 14.1 wird am 14.1-Board gespielt, nicht hier
    .filter(([, m]) => m.status === 'pending' && m.discipline !== '14.1')
    .map(([id, m]) => ({ id, ...m }));
  if (filter) offen = offen.filter((m) => m.player1 === filter || m.player2 === filter);
  const liste = offen.map((m) => {
    const wartet = m.player1 == null || m.player2 == null;
    const freilos = !wartet && (istFreilos(m.player1) || istFreilos(m.player2));
    const spielbar = !wartet && (freilos || spielerFrei(m, belegt));
    return { ...m, _waiting: wartet, _freilos: freilos, _playable: spielbar };
  });
  return liste.sort((a, b) => {
    if (a._playable !== b._playable) return a._playable ? -1 : 1;
    if (a._waiting !== b._waiting) return a._waiting ? 1 : -1;
    return 0;
  });
}

// Welcher Bildschirm am Pool-Board?
export function poolModus(turnierAktiv: boolean, freiGewaehlt: boolean, hatSpiel: boolean): 'picker' | 'match' | 'free' {
  if (turnierAktiv && !freiGewaehlt) return hatSpiel ? 'match' : 'picker';
  return 'free';
}

// Hat das Turnier ueberhaupt 14.1-Partien (offen, laufend oder gespielt)?
export function hat141Partien(turnier: BoardTurnier): boolean {
  return Object.values(turnier?.schedule ?? {}).some((m) => m.discipline === '14.1');
}

// Legt sich die 14.1-Auswahl ueber das Board? Wie am Pool-Board auch dann,
// wenn alle 14.1-Partien vergeben sind - sonst landete das Board nach dem
// Bestaetigen in einem leeren freien Spiel. Ein Turnier ganz ohne 14.1
// (etwa reines 9-Ball) laesst das Board frei spielen.
export function zeige141Auswahl(turnierAktiv: boolean, imTurnierspiel: boolean, freiGewaehlt: boolean, mit141: boolean): boolean {
  return turnierAktiv && !imTurnierspiel && !freiGewaehlt && mit141;
}

// ---------- Direktlink ----------

// Wer am anderen Board eine Paarung antippt, kommt mit ?spiel=<id> an. Nach
// dem Start muss der Parameter aus der Adresse, sonst startet ein spaeteres
// Neuladen (etwa ueber "Neu laden" in der Live-Uebersicht) dieselbe Partie
// erneut, falls sie inzwischen wieder offen ist.
export function ohneSpielParameter(adresse: string): string {
  const url = new URL(adresse);
  url.searchParams.delete('spiel');
  return url.pathname + url.search + url.hash;
}

// ---------- Tisch und Spiel ----------

// Gehoert das Spiel gerade diesem Tisch? Schuetzt vor verspaeteten Writes, die
// den frischen Anspruch eines anderen Tisches ueberschreiben wuerden.
export function gehoertZumTisch(m: BoardSpiel | null | undefined, tisch: string | number): boolean {
  return !!m && m.status === 'running' && String(m.table) === String(tisch);
}

// Aenderungen fuer runTransaction. Wie bei Firebase wird der uebergebene
// Eintrag geaendert und zurueckgegeben; undefined bricht die Transaktion ab.

// Spiel am Tisch starten (nur offene Spiele mit feststehenden Spielern)
export function spielBeanspruchen(m: BoardSpiel | null, tisch: string, jetzt: number): BoardSpiel | undefined {
  if (!m || m.status !== 'pending') return undefined;
  if (m.player1 == null || m.player2 == null) return undefined; // KO: Spieler stehen noch nicht fest
  m.status = 'running';
  m.table = tisch;
  m.startedAt = jetzt;
  return m;
}

// Spiel abbrechen: zurueck in den Plan, nur wenn es noch diesem Tisch gehoert
export function spielZuruecklegen(m: BoardSpiel | null, tisch: string): BoardSpiel | undefined {
  if (!gehoertZumTisch(m, tisch)) return undefined;
  const eintrag = m as BoardSpiel;
  eintrag.status = 'pending';
  eintrag.table = null;
  eintrag.startedAt = null;
  return eintrag;
}

// Ergebnis bestaetigen: abschliessen, wenn das Spiel noch diesem Tisch gehoert.
// Wurde es in CueDesk zurueck in den Plan gelegt, waehrend hier weitergespielt
// wurde, gilt das Ergebnis trotzdem - solange es an keinem anderen Tisch laeuft
// und noch dieselben zwei Spieler darin stehen.
export function spielAbschliessen(
  m: BoardSpiel | null,
  tisch: string,
  ergebnisId: string,
  amTisch?: { player1?: string | null; player2?: string | null }
): BoardSpiel | undefined {
  const zurueckgelegt = !!m && m.status === 'pending' && !m.table && !!amTisch && dieselbenSpieler(m, amTisch);
  if (!gehoertZumTisch(m, tisch) && !zurueckgelegt) return undefined;
  const eintrag = m as BoardSpiel;
  eintrag.status = 'completed';
  eintrag.resultId = ergebnisId;
  return eintrag;
}

// Abschluss am Tisch abgelehnt: die Meldung haengt am aktuellen Stand der
// Partie. null = nicht mehr im Spielplan, 'completed' = das Ergebnis steht
// schon in CueDesk (z. B. nach einem zweiten Tippen oder von Hand
// eingetragen), sonst gehoert sie inzwischen einem anderen Tisch.
export function abschlussAbgelehnt(stand: { status?: string; table?: string | null } | null, ergebnis: string): string {
  if (!stand) {
    return 'Dieses Spiel steht nicht mehr im Spielplan - vermutlich wurde die Aufstellung geändert.\n\n' +
      'Bitte das Ergebnis ' + ergebnis + ' in CueDesk eintragen.';
  }
  if (stand.status === 'completed') return 'Das Ergebnis dieses Spiels steht schon in CueDesk.\n\nDer Tisch ist wieder frei.';
  return (stand.table ? `Dieses Spiel läuft inzwischen an Tisch ${stand.table}.` : 'Dieses Spiel gehört nicht mehr zu diesem Tisch.') +
    '\n\nHier wurde nichts gespeichert; der Tisch ist wieder frei.';
}

// Freilos werten (nur solange es offen ist)
export function freilosAbschliessen(m: BoardSpiel | null, ergebnisId: string): BoardSpiel | undefined {
  if (!m || m.status !== 'pending') return undefined;
  m.status = 'completed';
  m.resultId = ergebnisId;
  return m;
}

// Wurde das Ergebnis des Spiels am Tisch schon woanders eingetragen (etwa am
// Notebook)? Dann gibt der Tisch es frei, sonst haengt das Tablet in einem
// Spiel fest, das es nicht mehr abschliessen kann.
export function ergebnisSchonEingetragen(
  turnier: BoardTurnier,
  spielId: string | null | undefined,
  abgegeben: boolean
): boolean {
  if (!spielId || abgegeben || !turnier || turnier.status !== 'running' || !turnier.schedule) return false;
  return turnier.schedule[spielId]?.status === 'completed';
}

// ---------- Ergebnisse ----------

// Ausspielziel am Pool-Board: im Turnierspiel das der Partie, sonst das
// frei gesetzte Ziel (0 = ohne Ziel)
export function ausspielziel(imTurnierspiel: boolean, tischZiel: number | null | undefined, turnierZiel: number | null | undefined, freiesZiel: number | null | undefined): number {
  if (imTurnierspiel) return tischZiel || turnierZiel || 0;
  return freiesZiel || 0;
}

export function zielErreicht(ziel: number, stand1: number, stand2: number): boolean {
  return ziel > 0 && (stand1 >= ziel || stand2 >= ziel);
}

// Fernseher: Ist das Spiel am Tisch zu Ende? null = laeuft noch, 1 oder 2 =
// Sieger, 0 = beendet ohne Sieger (14.1 mit Gleichstand). Pool endet mit dem
// erreichten Race (dieselbe Regel wie am Board), 14.1 mit dem gesperrten Board.
export function tischEnde(t: TischStand): 0 | 1 | 2 | null {
  if (!t) return null;
  const sieger = (a: number, b: number) => (a > b ? 1 : b > a ? 2 : 0);
  if (t.gameType === 'pool') {
    const s1 = Number(t.score1) || 0;
    const s2 = Number(t.score2) || 0;
    return zielErreicht(Number(t.raceTo) || 0, s1, s2) ? sieger(s1, s2) : null;
  }
  return t.locked ? sieger(Number(t.s1) || 0, Number(t.s2) || 0) : null;
}

// Freilos: der echte Spieler gewinnt kampflos Race-to:0
export function freilosWertung(m: BoardSpiel, raceTo: number): { spieler: string; score1: number; score2: number } {
  const links = istFreilos(m.player1);
  return {
    spieler: (links ? m.player2 : m.player1) as string,
    score1: links ? 0 : raceTo,
    score2: links ? raceTo : 0
  };
}

// KO: Sieger (und Halbfinal-Verlierer) ins Folgespiel eintragen. Zurueck kommen
// die Pfade fuer update(); ein verwaister 'running'-Status wird dabei geheilt.
export function koFortschreibung(
  m: BoardSpiel | null | undefined,
  stand: { player1: string; player2: string; score1: number; score2: number }
): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (!m || m.phase !== 'ko') return u;
  const vorne = stand.score1 >= stand.score2;
  const sieger = vorne ? stand.player1 : stand.player2;
  const verlierer = vorne ? stand.player2 : stand.player1;
  if (m.winnerTo) {
    u[`tournament/active/schedule/${m.winnerTo.match}/player${m.winnerTo.slot}`] = sieger;
    u[`tournament/active/schedule/${m.winnerTo.match}/status`] = 'pending';
  }
  if (m.loserTo) {
    u[`tournament/active/schedule/${m.loserTo.match}/player${m.loserTo.slot}`] = verlierer;
    u[`tournament/active/schedule/${m.loserTo.match}/status`] = 'pending';
  }
  return u;
}

// Text im Bestaetigungsfeld
export function siegerText(player1: string, player2: string, stand1: number, stand2: number, art: BoardArt): string {
  if (art === 'pool') return `🏁 ${stand1 > stand2 ? player1 : player2} gewinnt ${stand1}:${stand2}`;
  if (stand1 === stand2) return `🏁 Unentschieden ${stand1}:${stand2}`;
  const sieger = stand1 > stand2 ? player1 : player2;
  return `🏁 ${sieger} gewinnt ${Math.max(stand1, stand2)}:${Math.min(stand1, stand2)}`;
}
