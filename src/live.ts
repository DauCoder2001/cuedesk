// Live-Stand eines Tisches fuer die Anzeige aufbereiten. Der Stand ist genau
// das, was das Scoreboard schreibt (Pool: score1/score2, 14.1: s1/s2). Reine
// Rechnung, deshalb mit Tests abgesichert (test/live.test.ts).

// Ein Stand, an dem drei Stunden niemand gespielt hat, gilt als liegengeblieben.
// Gilt auch fuer die TV-Ansicht (scoreboards/js/anbindung.ts).
export const VERALTET_NACH_MS = 3 * 60 * 60 * 1000;

export type Kachel =
  | { art: 'frei' }
  | {
      art: 'pool' | '14.1';
      laeuft: boolean; // false = Spiel ist zu Ende
      seit: number | null; // Spielbeginn (ms)
      spieler1: string;
      spieler2: string;
      stand1: number;
      stand2: number;
      raceTo: number | null;
      hinweis: string; // Anstoss bzw. wer am Tisch ist
      ziel: string | null; // nur 14.1
    };

const zahl = (w: unknown) => (typeof w === 'number' && Number.isFinite(w) ? w : 0);
const text = (w: unknown, ersatz: string) => (typeof w === 'string' && w.trim() ? w : ersatz);

export function kachel(zustand: unknown, aktualisiert: string | null, jetzt = Date.now()): Kachel {
  if (!zustand || typeof zustand !== 'object') return { art: 'frei' };
  if (!aktualisiert || jetzt - Date.parse(aktualisiert) > VERALTET_NACH_MS) return { art: 'frei' };
  const z = zustand as Record<string, unknown>;
  const spieler1 = text(z.player1, 'Spieler 1');
  const spieler2 = text(z.player2, 'Spieler 2');
  const seit = typeof z.startedAt === 'number' ? z.startedAt : null;

  if (z.gameType === '14.1') {
    const stand1 = zahl(z.s1);
    const stand2 = zahl(z.s2);
    const log = Array.isArray(z.log) ? z.log.length : 0;
    if (stand1 === 0 && stand2 === 0 && log === 0) return { art: 'frei' };
    const amTisch = z.turn === 2 ? spieler2 : spieler1;
    const aufnahme = Math.max(zahl(z.inn1), zahl(z.inn2));
    const zielAufn = zahl(z.targetInn);
    return {
      art: '14.1',
      laeuft: !z.locked,
      seit,
      spieler1,
      spieler2,
      stand1,
      stand2,
      raceTo: null,
      hinweis: z.locked ? 'Spiel beendet' : `Am Tisch: ${amTisch}`,
      ziel: `Ziel ${zahl(z.target)}${zielAufn > 0 ? ` / ${zielAufn} Aufn.` : ''} · Aufnahme ${aufnahme}`
    };
  }

  const stand1 = zahl(z.score1);
  const stand2 = zahl(z.score2);
  if (stand1 === 0 && stand2 === 0) return { art: 'frei' };
  const raceTo = zahl(z.raceTo) > 0 ? zahl(z.raceTo) : null;
  const ende = raceTo !== null && (stand1 >= raceTo || stand2 >= raceTo);
  const anstoss = z.nextBreak === 2 ? spieler2 : spieler1;
  return {
    art: 'pool',
    laeuft: !ende,
    seit,
    spieler1,
    spieler2,
    stand1,
    stand2,
    raceTo,
    hinweis: ende ? 'Spiel beendet' : `Nächster Anstoß: ${anstoss}`,
    ziel: null
  };
}

export function dauerText(seit: number | null, jetzt = Date.now()): string {
  if (seit === null) return 'läuft';
  const minuten = Math.max(0, Math.floor((jetzt - seit) / 60000));
  if (minuten < 60) return `läuft seit ${minuten} min`;
  return `läuft seit ${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')} h`;
}
