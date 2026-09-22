// Gruppenturniere: Verteilung auf Gruppen mit Setzungen, Gruppentabellen und
// die Platzierungsduelle von "Zwei Gruppen" (Phase 2). Uebertragen aus dem
// Turnierplan Gruppen v64 (Turnier light), reine Rechnung ohne Datenbank,
// abgesichert durch test/gruppen.test.ts.
//
// Spieler werden wie in turnier.ts ueber ihre Position in der Startliste
// angesprochen (0 = Startnummer 1).

import { bergerRunden, rangliste, spielBeendet } from './turnier';
import type { Gleichstand, HandReihenfolge, RanglistenPartie, Stand, Zeile } from './turnier';

// ---------- Verteilung auf die Gruppen ----------

// Zielstaerke jeder Gruppe. Geht die Teilnehmerzahl nicht glatt auf, bekommen
// die vorderen Gruppen den Rest (v64 targetSizes).
export function zielGroessen(anzahl: number, gruppen: string[]): Record<string, number> {
  const basis = Math.floor(anzahl / gruppen.length);
  const rest = anzahl % gruppen.length;
  return Object.fromEntries(gruppen.map((g, k) => [g, basis + (k < rest ? 1 : 0)]));
}

// Gruppen, in die mehr Spieler gesetzt wurden, als hineinpassen (v64 overSeededGroups)
export function zuVieleGesetzt(anzahl: number, gesetzt: Record<string, string>, gruppen: string[]): string[] {
  const ziel = zielGroessen(anzahl, gruppen);
  return gruppen.filter((g) => Object.values(gesetzt).filter((x) => x === g).length > ziel[g]);
}

// Gesetzte Spieler kommen in ihre Gruppe, alle uebrigen werden gemischt und
// reihum in die Gruppe mit dem groessten Rueckstand auf ihre Zielstaerke
// verteilt, bei Gleichstand zufaellig (v64 verteileMitSetzungen).
// teilnehmer: feste Reihenfolge (Startliste); gesetzt: Teilnehmer -> Gruppe.
export function verteilen<T extends string>(
  teilnehmer: T[],
  gesetzt: Partial<Record<T, string>>,
  gruppen: string[],
  zufall: () => number = Math.random
): Record<string, T[]> {
  const ergebnis: Record<string, T[]> = Object.fromEntries(gruppen.map((g) => [g, [] as T[]]));
  gruppen.forEach((g) => teilnehmer.filter((t) => gesetzt[t] === g).forEach((t) => ergebnis[g].push(t)));

  const rest = teilnehmer.filter((t) => !gruppen.includes(gesetzt[t] ?? ''));
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(zufall() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  const ziel = zielGroessen(teilnehmer.length, gruppen);
  rest.forEach((t) => {
    const luecke = (g: string) => ziel[g] - ergebnis[g].length;
    const groesste = Math.max(...gruppen.map(luecke));
    const kandidaten = gruppen.filter((g) => luecke(g) === groesste);
    ergebnis[kandidaten[Math.floor(zufall() * kandidaten.length)]].push(t);
  });
  return ergebnis;
}

// ---------- Gruppentabelle ----------

// Tabelle einer Gruppe nach den Regeln der Einzelgruppe. mitglieder sind
// Positionen der Startliste in Gruppenreihenfolge; bei voelliger Gleichheit
// bleibt diese Reihenfolge. Schluessel der Handreihenfolge und der
// Gleichstaende bestehen aus Positionen der Startliste und sind damit ueber
// alle Gruppen eindeutig (v64 computeGroupRanking und tieKey).
export function gruppenRangliste(
  mitglieder: number[],
  partien: RanglistenPartie[],
  hand: HandReihenfolge = {}
): { zeilen: Zeile[]; gleichstaende: Gleichstand[] } {
  const lokal = new Map(mitglieder.map((pos, i) => [pos, i]));
  const eigene = partien
    .filter((p) => lokal.has(p.a) && lokal.has(p.b))
    .map((p) => ({ ...p, a: lokal.get(p.a) as number, b: lokal.get(p.b) as number }));

  const schluesselGlobal = (lokaleListe: number[]) =>
    lokaleListe
      .map((i) => mitglieder[i])
      .sort((x, y) => x - y)
      .join('-');
  // Handreihenfolgen dieser Gruppe in Gruppenpositionen umrechnen
  const handLokal: HandReihenfolge = {};
  Object.entries(hand).forEach(([schluessel, reihenfolge]) => {
    if (!Array.isArray(reihenfolge) || !reihenfolge.every((pos) => lokal.has(pos))) return;
    const liste = reihenfolge.map((pos) => lokal.get(pos) as number);
    if (schluesselGlobal(liste) === schluessel) handLokal[[...liste].sort((x, y) => x - y).join('-')] = liste;
  });

  const { zeilen, gleichstaende } = rangliste(mitglieder.length, eigene, handLokal);
  return {
    zeilen: zeilen.map((z) => ({ ...z, pos: mitglieder[z.pos] })),
    gleichstaende: gleichstaende.map((g) => ({
      ...g,
      schluessel: schluesselGlobal(g.mitglieder),
      mitglieder: g.mitglieder.map((i) => mitglieder[i])
    }))
  };
}

// ---------- Zwei Gruppen: Phase 2 ----------

// Platzierungsduelle: A1 gegen B1, A2 gegen B2 und so fort. Wer in der
// groesseren Gruppe uebrig bleibt, ist spielfrei (v64 startPhase2).
export function phase2Paare<T>(a: T[], b: T[]): { duelle: [T, T][]; spielfrei: T[] } {
  const n = Math.min(a.length, b.length);
  const duelle = Array.from({ length: n }, (_, i) => [a[i], b[i]] as [T, T]);
  const spielfrei = a.length > b.length ? a.slice(n) : b.slice(n);
  return { duelle, spielfrei };
}

export type EndZeile<T> = {
  wer: T;
  platz: number;
  gruppenplatz: number;
  ergebnis: string; // Duell-Ergebnis in der Zeile des Siegers, sonst leer
  offen: boolean;
  spielfrei: boolean;
};

// Endtabelle aus den Duellen: Sieger von Duell 1 ist Platz 1, Verlierer Platz 2,
// Sieger von Duell 2 Platz 3 und so fort; Spielfreie haengen hinten an. Solange
// ein Duell offen ist, steht der Spieler aus Gruppe A vorn (v64 computeFinalTable).
export function endtabelleZweiGruppen<T>(
  a: T[],
  b: T[],
  staende: { standA: Stand; standB: Stand }[],
  raceTo: number
): EndZeile<T>[] {
  const { duelle, spielfrei } = phase2Paare(a, b);
  const zeilen: EndZeile<T>[] = [];
  duelle.forEach(([x, y], i) => {
    const s1 = staende[i]?.standA ?? null;
    const s2 = staende[i]?.standB ?? null;
    const gueltig = s1 !== null && s2 !== null;
    const entschieden = spielBeendet(s1, s2, raceTo);
    let [sieger, verlierer, ws, ls] = [x, y, gueltig ? (s1 as number) : 0, gueltig ? (s2 as number) : 0];
    if (entschieden && (s2 as number) > (s1 as number)) [sieger, verlierer, ws, ls] = [y, x, s2 as number, s1 as number];
    zeilen.push({ wer: sieger, platz: 2 * i + 1, gruppenplatz: i + 1, ergebnis: `${ws} : ${ls}`, offen: !entschieden, spielfrei: false });
    zeilen.push({ wer: verlierer, platz: 2 * i + 2, gruppenplatz: i + 1, ergebnis: '', offen: !entschieden, spielfrei: false });
  });
  spielfrei.forEach((wer, k) => {
    zeilen.push({
      wer,
      platz: 2 * duelle.length + k + 1,
      gruppenplatz: duelle.length + k + 1,
      ergebnis: 'spielfrei',
      offen: false,
      spielfrei: true
    });
  });
  return zeilen;
}

// ---------- Spieler nachtragen ----------

export type PlanAenderung = { id: string; runde: number; paarung: number };
export type PlanNeu<T> = { a: T; b: T; runde: number; paarung: number };

// Spielplan einer Gruppe (Einzelgruppe: des Turniers) nach dem Nachtragen neu
// aufbauen: Berger-Kreis ueber die Mitglieder, der Nachzuegler zuletzt. Jedes
// bisherige Spiel behaelt seine Partie samt Ergebnis und bekommt nur Runde und
// Paarung neu, die Spiele des Nachzueglers kommen hinzu (v60 und v64
// addLatePlayer mit collectScoresByPair und rebuildScoresFromPairs).
export function nachtragenPlan<T>(
  mitglieder: T[],
  bestehend: { id: string; spieler_a: T; spieler_b: T }[]
): { aendern: PlanAenderung[]; neu: PlanNeu<T>[] } {
  const schluessel = (x: T, y: T) => {
    const i = mitglieder.indexOf(x);
    const j = mitglieder.indexOf(y);
    return i < j ? `${i}:${j}` : `${j}:${i}`;
  };
  const vorhanden = new Map(bestehend.map((p) => [schluessel(p.spieler_a, p.spieler_b), p]));
  const aendern: PlanAenderung[] = [];
  const neu: PlanNeu<T>[] = [];
  bergerRunden(mitglieder.length).forEach((paare, r) =>
    paare.forEach(([a, b], g) => {
      if (b === -1) return;
      const alt = vorhanden.get(schluessel(mitglieder[a], mitglieder[b]));
      if (alt) aendern.push({ id: alt.id, runde: r + 1, paarung: g + 1 });
      else neu.push({ a: mitglieder[a], b: mitglieder[b], runde: r + 1, paarung: g + 1 });
    })
  );
  return { aendern, neu };
}
