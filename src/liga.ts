// Liga-Spieltage (BLVN, Bezirk Osnabrueck-Huntegau, Saison 2026/27).
//
// Eine Mannschaftsbegegnung besteht aus acht Einzelpartien. Hin- und
// Rueckrunde spielen jeweils 14.1-endlos, 8-Ball, 9-Ball und 10-Ball; im
// Rueckspiel wechselt das Heimrecht. Gewertet wird mit Partiepunkten (8:0 bis
// 0:8) und Matchpunkten (3:0 / 1:1 / 0:3).
//
// Reine Rechnung ohne Datenbank, abgesichert durch test/liga.test.ts. Die
// Ausspielziele stammen aus den Ausschreibungen "OH Ausschreibung V2 ...
// 2026-27"; 14.1 wird auf Punkte mit Aufnahmenbegrenzung gespielt.

import type { TurnierStatus } from './datenbank.types';

export type LigaKennung = 'kreisklasse' | 'kreisliga' | 'bezirksliga' | 'landesliga' | 'spass';

export type Ausspielziele = {
  punkte141: number; // 14.1-endlos: Punkteziel
  aufnahmen141: number; // hoechstens so viele Aufnahmen
  '8-ball': number; // Gewinnsaetze
  '9-ball': number;
  '10-ball': number;
};

export const LIGEN: Record<LigaKennung, { name: string; ziele: Ausspielziele }> = {
  kreisklasse: {
    name: 'Kreisklasse',
    ziele: { punkte141: 40, aufnahmen141: 20, '8-ball': 4, '9-ball': 4, '10-ball': 4 }
  },
  kreisliga: {
    name: 'Kreisliga',
    ziele: { punkte141: 50, aufnahmen141: 20, '8-ball': 4, '9-ball': 5, '10-ball': 4 }
  },
  bezirksliga: {
    name: 'Bezirksliga',
    ziele: { punkte141: 75, aufnahmen141: 25, '8-ball': 4, '9-ball': 6, '10-ball': 5 }
  },
  landesliga: {
    name: 'Landesliga',
    ziele: { punkte141: 85, aufnahmen141: 25, '8-ball': 5, '9-ball': 6, '10-ball': 5 }
  },
  // Eigene Runde ohne Verband: die Ausspielziele legt der Verein selbst fest
  spass: {
    name: 'Spaß-Liga',
    ziele: { punkte141: 50, aufnahmen141: 20, '8-ball': 4, '9-ball': 5, '10-ball': 4 }
  }
};

export type LigaDisziplin = '14-1' | '8-ball' | '9-ball' | '10-ball';
export type Runde = 'hin' | 'rueck';

export type LigaSpiel = {
  nr: number; // 1 bis 8, wie im Spielbericht
  runde: Runde;
  paarung: number; // 1 bis 4 innerhalb der Runde
  disziplin: LigaDisziplin;
  ziel: number; // Gewinnsaetze, bei 14.1 das Punkteziel
  aufnahmen: number | null; // nur 14.1
};

// Hinrunde: 14.1, 8-, 9-, 10-Ball. In der Rueckrunde dreht sich die
// Reihenfolge nach dem 14.1 um (so stehen es auch die Spielberichte des
// Verbands: 14/1e, 10-Ball, 9-Ball, 8-Ball).
const REIHENFOLGE: LigaDisziplin[] = ['14-1', '8-ball', '9-ball', '10-ball'];
const REIHENFOLGE_RUECK: LigaDisziplin[] = ['14-1', '10-ball', '9-ball', '8-ball'];

// Der feste Ablauf einer Begegnung (Ausschreibung Abschnitt "Modus")
export function spielplan(ziele: Ausspielziele): LigaSpiel[] {
  const spiele: LigaSpiel[] = [];
  (['hin', 'rueck'] as Runde[]).forEach((runde, r) => {
    (runde === 'hin' ? REIHENFOLGE : REIHENFOLGE_RUECK).forEach((disziplin, i) => {
      spiele.push({
        nr: r * 4 + i + 1,
        runde,
        paarung: i + 1,
        disziplin,
        ziel: disziplin === '14-1' ? ziele.punkte141 : ziele[disziplin],
        aufnahmen: disziplin === '14-1' ? ziele.aufnahmen141 : null
      });
    });
  });
  return spiele;
}

// Bei nur drei Spielern entfaellt je Runde eine Partie: in der Hinrunde das
// 10-Ball (Nr. 4), in der Rueckrunde das 14.1 (Nr. 5).
export function entfaelltBeiDritt(nr: number): boolean {
  return nr === 4 || nr === 5;
}

export type LigaErgebnis = {
  nr: number;
  heim: number | null; // Saetze, bei 14.1 Punkte
  gast: number | null;
  gewertet?: boolean; // false: gestrichene Partie ohne Wertung
};

export type LigaWertung = {
  partiepunkte: [number, number];
  matchpunkte: [number, number];
  offen: number; // Partien ohne Ergebnis
  entschieden: boolean;
};

// Partiepunkte zaehlen die gewonnenen Einzelpartien. Bei 14.1 gewinnt, wer
// mehr Punkte hat; die Aufnahmenbegrenzung beendet die Partie vorzeitig.
// Matchpunkte: 3:0 fuer den Sieger, 1:1 bei 4:4 (Ausschreibung Abschnitt
// "Wertung").
export function wertung(ergebnisse: LigaErgebnis[]): LigaWertung {
  let heim = 0;
  let gast = 0;
  let offen = 0;
  ergebnisse.forEach((e) => {
    if (e.gewertet === false) return;
    if (e.heim === null || e.gast === null) {
      offen += 1;
      return;
    }
    if (e.heim > e.gast) heim += 1;
    else if (e.gast > e.heim) gast += 1;
  });
  const matchpunkte: [number, number] = heim > gast ? [3, 0] : gast > heim ? [0, 3] : [1, 1];
  return { partiepunkte: [heim, gast], matchpunkte, offen, entschieden: offen === 0 };
}

// Ein Spieler darf je Runde nur einmal antreten und in der Begegnung
// verschiedene Disziplinen spielen (Ausschreibung Abschnitt "Modus" c).
// Geprueft wird die eigene Aufstellung; zurueck kommen verstaendliche Saetze.
export function aufstellungPruefen(
  spiele: LigaSpiel[],
  spielerJeSpiel: Record<number, string | null>,
  name: (id: string) => string
): string[] {
  const fehler: string[] = [];
  (['hin', 'rueck'] as Runde[]).forEach((runde) => {
    const inRunde = spiele.filter((s) => s.runde === runde);
    const gezaehlt = new Map<string, number>();
    inRunde.forEach((s) => {
      const id = spielerJeSpiel[s.nr];
      if (!id) return;
      gezaehlt.set(id, (gezaehlt.get(id) ?? 0) + 1);
    });
    gezaehlt.forEach((anzahl, id) => {
      if (anzahl > 1) {
        fehler.push(`${name(id)} steht in der ${runde === 'hin' ? 'Hinrunde' : 'Rückrunde'} ${anzahl} mal im Plan.`);
      }
    });
    const besetzt = [...gezaehlt.keys()].length;
    if (inRunde.every((s) => spielerJeSpiel[s.nr]) && besetzt < 3) {
      fehler.push(`In der ${runde === 'hin' ? 'Hinrunde' : 'Rückrunde'} müssen mindestens drei Spieler antreten.`);
    }
  });

  // Verschiedene Disziplinen je Spieler ueber die ganze Begegnung
  const disziplinen = new Map<string, Set<LigaDisziplin>>();
  const einsaetze = new Map<string, number>();
  spiele.forEach((s) => {
    const id = spielerJeSpiel[s.nr];
    if (!id) return;
    const menge = disziplinen.get(id) ?? new Set<LigaDisziplin>();
    menge.add(s.disziplin);
    disziplinen.set(id, menge);
    einsaetze.set(id, (einsaetze.get(id) ?? 0) + 1);
  });
  einsaetze.forEach((anzahl, id) => {
    if (anzahl > 1 && (disziplinen.get(id)?.size ?? 0) < anzahl) {
      fehler.push(`${name(id)} spielt zweimal dieselbe Disziplin.`);
    }
  });
  return fehler;
}

// Wer fuer ein Spiel nicht mehr in Frage kommt: schon in derselben Runde
// eingesetzt oder dieselbe Disziplin schon in der anderen Runde. Gilt fuer
// jede Seite fuer sich; die Auswahllisten bieten diese Spieler nicht an.
export function gesperrteSpieler(
  spiele: LigaSpiel[],
  spielerJeSpiel: Record<number, string | null>,
  nr: number
): Set<string> {
  const gesperrt = new Set<string>();
  const spiel = spiele.find((s) => s.nr === nr);
  if (!spiel) return gesperrt;
  spiele.forEach((s) => {
    const id = spielerJeSpiel[s.nr];
    if (!id || s.nr === nr) return;
    if (s.runde === spiel.runde || s.disziplin === spiel.disziplin) gesperrt.add(id);
  });
  return gesperrt;
}

// ---------- Doppel-Begegnung (nur Spass-Liga) ----------
// Zwischen 1. und 2. Begegnung kann ein Spass-Liga-Spieltag eine Begegnung im
// Doppel haben: eigene Partienliste (Disziplin und Race to frei, kein 14.1),
// je Seite zwei Spieler. Sie ist ein eigenes Turnier mit liga.art 'doppel',
// das ueber liga.haupt auf die 1. Begegnung verweist; die 1. Begegnung kennt
// sie ueber liga.doppel. Die Verbindung zwischen 1. und 2. Begegnung bleibt
// davon unberuehrt. Angezeigt wird sie als "2. Begegnung · Doppel", die
// gespeicherte 2. Begegnung dann als "3. Begegnung".

export type DoppelDisziplin = '8-ball' | '9-ball' | '10-ball';
export type DoppelPartie = { disziplin: DoppelDisziplin; ziel: number };

// Spielplan der Doppel-Begegnung: eine Runde, Partien in der gewaehlten Folge
export function doppelSpielplan(plan: DoppelPartie[]): LigaSpiel[] {
  return plan.map((p, i) => ({
    nr: i + 1,
    runde: 'hin' as const,
    paarung: i + 1,
    disziplin: p.disziplin,
    ziel: p.ziel,
    aufnahmen: null
  }));
}

// Eingabe der Partienliste (Race to als Text) pruefen und umwandeln
export function doppelPlanAusEingabe(
  zeilen: { disziplin: DoppelDisziplin; ziel: string }[]
): { plan: DoppelPartie[]; fehler: null } | { plan: null; fehler: string } {
  if (zeilen.length === 0) return { plan: null, fehler: 'Die Doppel-Begegnung braucht mindestens eine Partie.' };
  if (zeilen.length > 12) return { plan: null, fehler: 'Höchstens 12 Doppel-Partien.' };
  const plan = zeilen.map((z) => ({ disziplin: z.disziplin, ziel: Number(z.ziel) }));
  if (plan.some((p) => !Number.isInteger(p.ziel) || p.ziel < 1 || p.ziel > 25)) {
    return { plan: null, fehler: 'Race to der Doppel-Partien: ganze Zahlen zwischen 1 und 25.' };
  }
  return { plan, fehler: null };
}

// Eine Seite eines Doppels: zwei verschiedene Spieler. Wer in mehreren Doppeln
// derselben Begegnung antritt, ist erlaubt.
export function doppelSeitePruefen(
  nr: number,
  erster: string | null,
  zweiter: string | null,
  name: (id: string) => string
): string | null {
  if (erster && zweiter && erster === zweiter) return `Doppel ${nr}: ${name(erster)} steht zweimal auf derselben Seite.`;
  return null;
}

export type LigaVerweis = {
  begegnung?: 1 | 2;
  partner?: string;
  art?: 'doppel';
  haupt?: string; // Doppel-Begegnung: die 1. Begegnung
  doppel?: string; // 1. Begegnung: die Doppel-Begegnung
};

export function ligaVerweisVon(einstellungen: unknown): LigaVerweis | null {
  return (einstellungen as { liga?: LigaVerweis } | null)?.liga ?? null;
}

export function istDoppelBegegnung(t: { einstellungen: unknown }): boolean {
  return ligaVerweisVon(t.einstellungen)?.art === 'doppel';
}

// ---------- Spieltag aus zwei Begegnungen ----------
// Ein Spieltag steht in der Datenbank als zwei Turniere, die sich ueber
// einstellungen.liga.partner gegenseitig kennen. In Listen erscheint er als
// eine Zeile unter der 1. Begegnung.

export type SpieltagTeil = { id: string; status: TurnierStatus; einstellungen: unknown };

const ligaVerweis = (t: SpieltagTeil) => ligaVerweisVon(t.einstellungen);

// Die Doppel-Begegnung eines Spieltags, wenn sie in der Liste steht und
// zurueckverweist (t ist die 1. oder 2. Begegnung)
export function doppelVon<T extends SpieltagTeil>(t: T, turniere: T[]): T | null {
  const verweis = ligaVerweis(t);
  const erste = (verweis?.begegnung ?? 1) === 1 ? t : partnerVon(t, turniere);
  const id = erste ? ligaVerweis(erste)?.doppel : undefined;
  const d = id ? turniere.find((x) => x.id === id) : undefined;
  return d && ligaVerweis(d)?.haupt === erste?.id ? d : null;
}

// Doppel-Begegnungen, deren 1. Begegnung in der Liste steht; sie bekommen
// keine eigene Zeile.
export function doppelBegegnungIds(turniere: SpieltagTeil[]): Set<string> {
  const ids = new Set(turniere.map((t) => t.id));
  return new Set(
    turniere
      .filter((t) => ligaVerweis(t)?.art === 'doppel' && ids.has(ligaVerweis(t)?.haupt ?? ''))
      .map((t) => t.id)
  );
}

// Die andere Begegnung, wenn sie in der Liste steht und zurueckverweist
export function partnerVon<T extends SpieltagTeil>(t: T, turniere: T[]): T | null {
  const partner = ligaVerweis(t)?.partner;
  const andere = partner ? turniere.find((x) => x.id === partner) : undefined;
  return andere && ligaVerweis(andere)?.partner === t.id ? andere : null;
}

// Zweite Begegnungen, deren erste in der Liste steht; sie bekommen keine
// eigene Zeile. Fehlt die erste, bleibt die zweite sichtbar.
export function zweiteBegegnungIds(turniere: SpieltagTeil[]): Set<string> {
  return new Set(
    turniere.filter((t) => ligaVerweis(t)?.begegnung === 2 && partnerVon(t, turniere)).map((t) => t.id)
  );
}

// Stand des ganzen Spieltags aus dem Stand beider Begegnungen. teilBeendet
// nennt die Begegnung, die schon fertig ist, solange die andere noch aussteht.
// Eine Doppel-Begegnung zaehlt mit: Laeuft sie, laeuft der Spieltag; ist sie
// noch offen, ist er nicht fertig.
export function spieltagStand(
  erste: TurnierStatus,
  zweite: TurnierStatus | null,
  doppel: TurnierStatus | null = null
): { status: TurnierStatus; teilBeendet: 1 | 2 | 3 | null } {
  if (doppel !== null) {
    const ohne = spieltagStand(erste, zweite);
    if (doppel === 'laeuft') return { status: 'laeuft', teilBeendet: null };
    const doppelFertig = doppel === 'beendet' || doppel === 'abgebrochen';
    if (ohne.status === 'beendet' || ohne.status === 'abgebrochen') {
      return doppelFertig ? ohne : { status: 'geplant', teilBeendet: null };
    }
    // Mit Doppel-Begegnung heisst die gespeicherte 2. Begegnung "3."
    return { ...ohne, teilBeendet: ohne.teilBeendet === 2 ? 3 : ohne.teilBeendet };
  }
  if (zweite === null) return { status: erste, teilBeendet: null };
  if (erste === 'laeuft' || zweite === 'laeuft') return { status: 'laeuft', teilBeendet: null };
  const fertig = (s: TurnierStatus) => s === 'beendet' || s === 'abgebrochen';
  if (fertig(erste) && fertig(zweite)) {
    return { status: erste === 'beendet' || zweite === 'beendet' ? 'beendet' : 'abgebrochen', teilBeendet: null };
  }
  if (fertig(erste)) return { status: 'geplant', teilBeendet: 1 };
  if (fertig(zweite)) return { status: 'geplant', teilBeendet: 2 };
  return { status: 'geplant', teilBeendet: null };
}
