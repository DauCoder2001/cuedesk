// Teamvergleich (Mosconi-Format): zwei Teams, jedes Match gibt einen Punkt,
// Sieger ist, wer zuerst das Ziel erreicht. Gespielt wird in Bloecken:
// zuerst ein Team-Match (Team gegen Team, ohne einzelne Spieler), danach
// abwechselnd Doppel und Einzel. Seite A ist immer Team A (Rot), Seite B
// immer Team B (Blau).
//
// Reine Rechnung ohne Datenbank, getestet in test/teamvergleich.test.ts.

export type TeamSeite = 'A' | 'B';
export type MatchArt = 'team' | 'doppel' | 'einzel';

export type TeamvergleichEinstellungen = {
  ziel: number; // Punkte zum Sieg
  race: Record<MatchArt, number>;
  // Kapitaen: ein Spieler des Teams (kapitaenId) oder ein freier Name, der
  // nicht mitspielt (kapitaen) - wie im Mosconi Cup
  teams: Record<TeamSeite, { name: string; kapitaen?: string | null; kapitaenId?: string | null }>;
  einzelFuersRating?: boolean;
};

export const TEAM_VORGABE: TeamvergleichEinstellungen = {
  ziel: 7,
  race: { team: 5, doppel: 5, einzel: 5 },
  teams: { A: { name: 'Team Rot' }, B: { name: 'Team Blau' } },
  einzelFuersRating: false
};

export const TEAM_GROESSE = { min: 2, max: 8 };
export const ZIEL_GRENZEN = { min: 1, max: 21 };

export const ART_NAME: Record<MatchArt, string> = { team: 'Team-Match', doppel: 'Doppel', einzel: 'Einzel' };

// Ein geplantes Match: Spieler je Seite (Team-Match: leer, Doppel: zwei)
export type VorschlagMatch = { block: number; art: MatchArt; paarung: number; a: string[]; b: string[] };

// Hoechstens so viele Matches braucht es, bis ein Team das Ziel erreicht
// (ungerade Zahl, ein Unentschieden ist damit ausgeschlossen)
export const hoechstensMatches = (ziel: number) => 2 * ziel - 1;

export function pruefen(a: string[], b: string[], ziel: number, race: Record<MatchArt, number>): string[] {
  const fehler: string[] = [];
  const { min, max } = TEAM_GROESSE;
  if (a.length < min || a.length > max || b.length < min || b.length > max) {
    fehler.push(`Jedes Team braucht ${min} bis ${max} Spieler.`);
  }
  if (a.length !== b.length) fehler.push('Beide Teams brauchen gleich viele Spieler.');
  if (new Set(a).size !== a.length || new Set(b).size !== b.length) fehler.push('Ein Spieler steht doppelt im selben Team.');
  if (a.some((id) => b.includes(id))) fehler.push('Ein Spieler kann nicht in beiden Teams spielen.');
  if (!Number.isInteger(ziel) || ziel < ZIEL_GRENZEN.min || ziel > ZIEL_GRENZEN.max) {
    fehler.push(`Sieg bei ${ZIEL_GRENZEN.min} bis ${ZIEL_GRENZEN.max} Punkten.`);
  }
  if (Object.values(race).some((r) => !Number.isInteger(r) || r < 1 || r > 15)) fehler.push('Race to: 1 bis 15.');
  return fehler;
}

const drehen = <T>(liste: T[], um: number): T[] => {
  if (liste.length === 0) return liste;
  const k = ((um % liste.length) + liste.length) % liste.length;
  return [...liste.slice(k), ...liste.slice(0, k)];
};

// Doppelpartner nach dem Kreisverfahren: Die Spieler werden nach Namen
// geordnet (damit gleiche Spieler gleiche Paare ergeben), der erste bleibt
// stehen, die uebrigen ruecken je Runde weiter. So wechselt der Partner von
// Block zu Block, solange es neue Kombinationen gibt.
function partnerPaare(spieler: string[], runde: number): string[][] {
  const liste = [...spieler].sort();
  if (liste.length < 2) return [];
  const [fest, ...rest] = liste;
  const kreis = [fest, ...drehen(rest, runde)];
  const paare: string[][] = [];
  for (let i = 0; i < kreis.length / 2; i += 1) paare.push([kreis[i], kreis[kreis.length - 1 - i]]);
  return paare;
}

// Vorschlag: Block 1 Team-Match, danach abwechselnd Doppel und Einzel, bis
// genug Matches geplant sind (hoechstensMatches). Gleiche Einsaetze durch
// Drehen der Reihenfolge je Block; "variante" ergibt einen anderen, ebenso
// gleichmaessigen Vorschlag (Knopf "Neuer Vorschlag").
export function vorschlag(a: string[], b: string[], ziel: number, variante = 0): VorschlagMatch[] {
  const n = Math.min(a.length, b.length);
  const max = hoechstensMatches(ziel);
  const plan: VorschlagMatch[] = [{ block: 1, art: 'team', paarung: 1, a: [], b: [] }];
  const zahl = new Map<string, number>();
  const mehr = (ids: string[]) => ids.forEach((id) => zahl.set(id, (zahl.get(id) ?? 0) + 1));
  // Wer bisher am wenigsten gespielt hat, zuerst; bei Gleichstand die gedrehte Reihenfolge
  const nachEinsatz = (liste: string[], um: number) => {
    const gedreht = drehen(liste, um);
    return [...gedreht].sort((x, y) => (zahl.get(x) ?? 0) - (zahl.get(y) ?? 0) || gedreht.indexOf(x) - gedreht.indexOf(y));
  };
  let block = 1;
  let doppelNr = 0;
  let einzelNr = 0;
  while (plan.length < max && n > 0) {
    block += 1;
    const istDoppel = block % 2 === 0 && n >= 2;
    // Der letzte Block ist oft nur teilweise noetig: dann spielen je Team die
    // bisher am wenigsten Eingesetzten
    const platz = max - plan.length;
    const matches: VorschlagMatch[] = [];
    if (istDoppel) {
      // Paare aus den am wenigsten Eingesetzten; bei ungerader Zahl setzt so je Block ein anderer aus
      const paare = Math.min(Math.floor(n / 2), platz);
      const pa = partnerPaare(nachEinsatz(a, doppelNr + variante).slice(0, 2 * paare), doppelNr + variante);
      const pb = partnerPaare(nachEinsatz(b, doppelNr * 2 + variante + 1).slice(0, 2 * paare), doppelNr + variante + 1);
      for (let i = 0; i < paare; i += 1) {
        const j = (i + doppelNr) % paare;
        matches.push({ block, art: 'doppel', paarung: i + 1, a: pa[i], b: pb[j] });
      }
      doppelNr += 1;
    } else {
      // Jeder spielt einmal; die Gegner wandern je Einzel-Block weiter
      const anzahl = Math.min(n, platz);
      const sa = anzahl < n ? nachEinsatz(a, einzelNr + variante).slice(0, anzahl) : a;
      const sb = anzahl < n ? nachEinsatz(b, einzelNr + variante + 1).slice(0, anzahl) : b;
      for (let i = 0; i < anzahl; i += 1) {
        matches.push({ block, art: 'einzel', paarung: i + 1, a: [sa[i]], b: [sb[(i + einzelNr + variante) % anzahl]] });
      }
      einzelNr += 1;
    }
    matches.forEach((m) => mehr([...m.a, ...m.b]));
    plan.push(...matches);
  }
  return plan;
}

// ---------- Stand ----------

export type StandPartie = {
  id: string;
  status: 'geplant' | 'laeuft' | 'beendet' | 'abgebrochen';
  ergebnis_a: number | null;
  ergebnis_b: number | null;
};

export type TeamStand = {
  a: number;
  b: number;
  sieger: TeamSeite | null;
  // Nach dem Sieg: offene Matches entfallen, laufende muessen entschieden werden
  entfallen: string[];
  laufend: string[];
};

export function siegerVon(p: StandPartie): TeamSeite | null {
  if (p.status !== 'beendet' || p.ergebnis_a === null || p.ergebnis_b === null || p.ergebnis_a === p.ergebnis_b) return null;
  return p.ergebnis_a > p.ergebnis_b ? 'A' : 'B';
}

// Gezaehlt werden beendete Matches in der Reihenfolge der Liste, bis ein Team
// das Ziel erreicht; was danach noch beendet wurde, zaehlt nicht mehr.
export function stand(partien: StandPartie[], ziel: number, reihenfolge?: (p: StandPartie) => string): TeamStand {
  const beendet = partien.filter((p) => siegerVon(p) !== null);
  if (reihenfolge) beendet.sort((x, y) => reihenfolge(x).localeCompare(reihenfolge(y)));
  let a = 0;
  let b = 0;
  let sieger: TeamSeite | null = null;
  for (const p of beendet) {
    if (sieger) break;
    if (siegerVon(p) === 'A') a += 1;
    else b += 1;
    if (a >= ziel) sieger = 'A';
    else if (b >= ziel) sieger = 'B';
  }
  return {
    a,
    b,
    sieger,
    entfallen: sieger ? partien.filter((p) => p.status === 'geplant').map((p) => p.id) : [],
    laufend: sieger ? partien.filter((p) => p.status === 'laeuft').map((p) => p.id) : []
  };
}

// Einsaetze je Spieler im Vorschlag (Anzeige "jeder spielt etwa gleich oft")
export function einsaetze(plan: VorschlagMatch[]): Map<string, number> {
  const zahl = new Map<string, number>();
  plan.forEach((m) => [...m.a, ...m.b].forEach((id) => zahl.set(id, (zahl.get(id) ?? 0) + 1)));
  return zahl;
}
