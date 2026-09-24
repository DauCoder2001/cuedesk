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
