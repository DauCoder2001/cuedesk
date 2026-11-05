// Protokoll am Pool-Scoreboard ohne CueDesk: die letzten beendeten Spiele
// eines Tisches liegen im Browser dieses Geraets (localStorage). Angebunden
// kommt die Liste aus CueDesk (anbindung.ts, get "results"); beide zeigen
// gleich viele Spiele.
//
// Reine Rechnung, abgesichert durch test/protokoll-offline.test.ts.

export const PROTOKOLL_ANZAHL = 10;

export type ProtokollEintrag = {
  table: string;
  gameType: 'pool';
  player1: string;
  player2: string;
  score1: number;
  score2: number;
  date: string;
  timestamp: string;
  serverTimestamp: number;
};

export const protokollSchluessel = (tisch: string) => `cuedesk-scoreboard-protokoll-tisch-${tisch}`;

// Gespeicherten Text lesen; Unbrauchbares ergibt eine leere Liste.
export function protokollLesen(roh: string | null): ProtokollEintrag[] {
  if (!roh) return [];
  try {
    const liste = JSON.parse(roh);
    return Array.isArray(liste) ? liste.filter((e) => e && typeof e === 'object' && typeof e.player1 === 'string') : [];
  } catch {
    return [];
  }
}

// Neues Spiel vorn anfuegen, aeltere ueber die Anzahl hinaus fallen weg.
export function protokollErgaenzen(
  liste: ProtokollEintrag[],
  spiel: { tisch: string; player1: string; player2: string; score1: number; score2: number },
  jetzt = new Date()
): ProtokollEintrag[] {
  const eintrag: ProtokollEintrag = {
    table: spiel.tisch,
    gameType: 'pool',
    player1: spiel.player1,
    player2: spiel.player2,
    score1: spiel.score1,
    score2: spiel.score2,
    date: jetzt.toLocaleDateString('de-DE'),
    timestamp: jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    serverTimestamp: jetzt.getTime()
  };
  return [eintrag, ...liste].slice(0, PROTOKOLL_ANZAHL);
}

// Kommt ein Spiel beim "Neues Match" ins Protokoll? Nur mit Punkten und nur
// beendet: Race-to erreicht, oder ohne Race-to (freies Spiel).
export function insProtokoll(score1: number, score2: number, raceTo: number, zielErreicht: boolean): boolean {
  if (score1 <= 0 && score2 <= 0) return false;
  return raceTo <= 0 || zielErreicht;
}
