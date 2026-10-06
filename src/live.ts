// Live-Stand eines Tisches fuer die Anzeige aufbereiten. Der Stand ist genau
// das, was das Scoreboard schreibt (Pool: score1/score2, 14.1: s1/s2). Reine
// Rechnung, deshalb mit Tests abgesichert (test/live.test.ts).

// Ein Stand, an dem drei Stunden niemand gespielt hat, gilt als liegengeblieben.
// Gilt auch fuer die TV-Ansicht (scoreboards/js/anbindung.ts).
export const VERALTET_NACH_MS = 3 * 60 * 60 * 1000;

// Ein gekoppeltes Geraet ohne Tisch ist ein Fernseher: es zeigt die
// TV-Ansicht (Geraet.tsx oeffnet sie von selbst). Beschriftung der Auswahl.
export const OHNE_TISCH_TEXT = 'Fernseher (TV-Ansicht)';

// Laeuft gerade eine Live-Uebertragung? Ja, wenn ein Turnier oder
// Liga-Spieltag laeuft und Live dort nicht abgeschaltet ist (Stufe 25; die
// Datenbank prueft dasselbe in live_uebertragen).
export function liveAktiv(turniere: { status: string; einstellungen: unknown }[]): boolean {
  return turniere.some(
    (t) => t.status === 'laeuft' && (t.einstellungen as { live?: boolean } | null)?.live !== false
  );
}

export const KEIN_LIVE_TEXT = 'Gerade keine Live-Übertragung. Spielstände erscheinen hier, sobald ein Turnier mit Live-Übertragung läuft.';

export type Kachel =
  // "bereit": am Tisch steht ein Tablet, gespielt wird aber noch nicht
  | { art: 'frei'; bereit: boolean }
  | {
      art: 'pool' | '14.1';
      laeuft: boolean; // false = Spiel ist zu Ende
      seit: number | null; // Spielbeginn (ms)
      spieler1: string;
      spieler2: string;
      stand1: number;
      stand2: number;
      raceTo: number | null;
      turnierspiel: boolean; // Partie aus dem laufenden Turnier (sonst freies Spiel)
      hinweis: string; // Anstoss bzw. wer am Tisch ist
      ziel: string | null; // nur 14.1
    };

const zahl = (w: unknown) => (typeof w === 'number' && Number.isFinite(w) ? w : 0);
const text = (w: unknown, ersatz: string) => (typeof w === 'string' && w.trim() ? w : ersatz);

export function kachel(zustand: unknown, aktualisiert: string | null, jetzt = Date.now()): Kachel {
  if (!zustand || typeof zustand !== 'object') return { art: 'frei', bereit: false };
  if (!aktualisiert || jetzt - Date.parse(aktualisiert) > VERALTET_NACH_MS) return { art: 'frei', bereit: false };
  const z = zustand as Record<string, unknown>;
  const spieler1 = text(z.player1, 'Spieler 1');
  const spieler2 = text(z.player2, 'Spieler 2');
  const seit = typeof z.startedAt === 'number' ? z.startedAt : null;
  // Ein Spiel ist im Gang, sobald Namen eingetragen sind, die Uhr laeuft oder
  // es zu einem Turnierspiel gehoert - auch wenn es noch 0:0 steht.
  const angefangen =
    seit !== null ||
    Boolean(z.tournamentMatchId) ||
    spieler1 !== 'Spieler 1' ||
    spieler2 !== 'Spieler 2';

  if (z.gameType === '14.1') {
    const stand1 = zahl(z.s1);
    const stand2 = zahl(z.s2);
    const log = Array.isArray(z.log) ? z.log.length : 0;
    if (stand1 === 0 && stand2 === 0 && log === 0 && !angefangen) return { art: 'frei', bereit: true };
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
      turnierspiel: Boolean(z.tournamentMatchId),
      hinweis: z.locked ? 'Spiel beendet' : `Am Tisch: ${amTisch}`,
      ziel: `Ziel ${zahl(z.target)}${zielAufn > 0 ? ` / ${zielAufn} Aufn.` : ''} · Aufnahme ${aufnahme}`
    };
  }

  const stand1 = zahl(z.score1);
  const stand2 = zahl(z.score2);
  if (stand1 === 0 && stand2 === 0 && !angefangen) return { art: 'frei', bereit: true };
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
    turnierspiel: Boolean(z.tournamentMatchId),
    hinweis: ende ? 'Spiel beendet' : `Nächster Anstoß: ${anstoss}`,
    ziel: null
  };
}

// Liegengebliebener Stand mit begonnenem Spiel: Das Ergebnis wurde nie
// gespeichert, denn nach dem Speichern setzt das Tablet seinen Stand zurueck.
// Fuer den Hinweis an die Turnierleitung auf der Seite Live, sonst null.
export function nichtGespeichert(
  zustand: unknown,
  aktualisiert: string | null,
  jetzt = Date.now()
): Exclude<Kachel, { art: 'frei' }> | null {
  if (!aktualisiert || jetzt - Date.parse(aktualisiert) <= VERALTET_NACH_MS) return null;
  const k = kachel(zustand, aktualisiert, Date.parse(aktualisiert));
  return k.art === 'frei' ? null : k;
}

// Liegengebliebenes Pool-Einzelspiel ohne Tablet speichern (Seite Live): die
// Zeile fuer "partien", genau wie ergebnisSpeichernPool am Tablet sie schreibt.
// Zeitpunkt ist der letzte Stand, nicht der Moment des Speicherns. null, wenn
// das so nicht geht: 14.1 (nur mit vollem Protokoll vom Tablet), Turnierpartie
// oder Spieler nicht aus der Liste gewaehlt.
export type PoolDisziplin = '8-ball' | '9-ball' | '10-ball';

export function einzelspielAusStand(
  zustand: unknown,
  aktualisiert: string,
  disziplin: PoolDisziplin,
  vereinId: string,
  tischId: string
) {
  const k = kachel(zustand, aktualisiert, Date.parse(aktualisiert));
  if (k.art !== 'pool' || k.turnierspiel) return null;
  const z = zustand as Record<string, unknown>;
  const a = typeof z.player1Id === 'string' ? z.player1Id : null;
  const b = typeof z.player2Id === 'string' ? z.player2Id : null;
  if (!a || !b || a === b) return null;
  return {
    verein_id: vereinId,
    turnier_id: null,
    disziplin,
    datum: new Date(aktualisiert).toISOString().slice(0, 10),
    tisch_id: tischId,
    spieler_a: a,
    spieler_b: b,
    race_to: k.raceTo,
    ergebnis_a: k.stand1,
    ergebnis_b: k.stand2,
    status: k.laeuft ? ('abgebrochen' as const) : ('beendet' as const),
    rating_werten: false, // Einzelspiele zaehlen nie fuer das Rating
    begonnen: k.seit !== null ? new Date(k.seit).toISOString() : null,
    beendet: new Date(aktualisiert).toISOString()
  };
}

// ---------- Laufender Stand im Spielplan (Turnier und Liga-Spieltag) ----------

const kurzName = (text: string) => text.replace(/\s*\([^()]*\)\s*$/, '').trim().toLowerCase();

// Laufender Stand einer Turnierpartie am Tisch, umgerechnet auf Spieler A/B
// der Partie. Nach einem Seitenwechsel stehen die Spieler am Board vertauscht;
// massgeblich ist deshalb der Name (wie beim Speichern, turnier-plan.ts).
export function laufenderStand(
  zustand: unknown,
  aktualisiert: string | null,
  nameA: string,
  nameB: string,
  jetzt = Date.now()
): { a: number; b: number; aufnahme: number | null; beendet: boolean } | null {
  const k = kachel(zustand, aktualisiert, jetzt);
  if (k.art === 'frei' || !k.turnierspiel) return null;
  const z = zustand as Record<string, unknown>;
  const getauscht =
    kurzName(nameA) !== kurzName(nameB) &&
    kurzName(k.spieler1) === kurzName(nameB) &&
    kurzName(k.spieler2) === kurzName(nameA);
  return {
    a: getauscht ? k.stand2 : k.stand1,
    b: getauscht ? k.stand1 : k.stand2,
    aufnahme: k.art === '14.1' ? Math.max(zahl(z.inn1), zahl(z.inn2)) : null,
    beendet: !k.laeuft
  };
}

// "● Tisch 1 · 14 : 28 · Aufn. 1" bzw. mit "beendet, noch nicht bestätigt"
export function laufenderStandText(
  stand: { a: number; b: number; aufnahme: number | null; beendet: boolean },
  tischNummer: number | null
): string {
  return [
    `● ${tischNummer !== null ? `Tisch ${tischNummer}` : 'am Tisch'}`,
    `${stand.a} : ${stand.b}`,
    ...(stand.aufnahme !== null ? [`Aufn. ${stand.aufnahme}`] : []),
    ...(stand.beendet ? ['beendet, noch nicht bestätigt'] : [])
  ].join(' · ');
}

export function dauerText(seit: number | null, jetzt = Date.now()): string {
  if (seit === null) return 'läuft';
  const minuten = Math.max(0, Math.floor((jetzt - seit) / 60000));
  if (minuten < 60) return `läuft seit ${minuten} min`;
  return `läuft seit ${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')} h`;
}
