// Einzelgruppe: Spielplan und Rangliste. Uebertragen aus dem Turnierplan v57
// (Turnier light), reine Rechnung ohne Datenbank, abgesichert durch
// test/turnier.test.ts.
//
// Spieler werden hier ueber ihre Startnummer-Position angesprochen
// (0 = Startnummer 1). Die Seite uebersetzt in Personen.

// ---------- Spielplan (Berger-Kreis) ----------

// Runden fuer n Spieler. Ein Paar mit -1 heisst: spielfrei.
// Gleiches Verfahren wie generateRoundRobinSchedule() in v57.
export function bergerRunden(n: number): [number, number][][] {
  const spieler = Array.from({ length: n }, (_, i) => i);
  if (n % 2 !== 0) spieler.push(-1);
  const anzahl = spieler.length;
  const runden: [number, number][][] = [];
  for (let r = 0; r < anzahl - 1; r += 1) {
    const paare: [number, number][] = [];
    for (let i = 0; i < anzahl / 2; i += 1) {
      const a = spieler[i];
      const b = spieler[anzahl - 1 - i];
      if (a !== -1 && b !== -1) paare.push([a, b]);
      else paare.push([a === -1 ? b : a, -1]);
    }
    runden.push(paare);
    spieler.splice(1, 0, spieler.pop() as number);
  }
  return runden;
}

// Zufaellige Reihenfolge (Auslosung der Startnummern)
export function auslosen<T>(liste: T[], zufall: () => number = Math.random): T[] {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(zufall() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

// ---------- Ergebnisse ----------

export type Stand = number | null;

// Beendet: einer hat das Race to erreicht, kein Gleichstand (v57 isGameFinished)
export function spielBeendet(a: Stand, b: Stand, raceTo: number): boolean {
  if (a === null || b === null || a === b) return false;
  return Math.max(a, b) >= raceTo;
}

// Hoechster zulaessiger Wert eines Feldes, wenn der Gegner schon das Race to
// hat, ist raceTo - 1 (v57 maxFor). So ist 5:5 bei Race to 5 unmoeglich.
export function hoechstwert(gegner: Stand, raceTo: number): number {
  return gegner !== null && gegner >= raceTo ? raceTo - 1 : raceTo;
}

// Ein Spiel zaehlt erst, wenn der Stand von der Vorgabe abweicht (v57 hcAngefangen)
export function angefangen(a: Stand, b: Stand, vorgabeA: number, vorgabeB: number): boolean {
  if (a === null && b === null) return false;
  return (a !== null && a !== vorgabeA) || (b !== null && b !== vorgabeB);
}

// ---------- Rangliste ----------

export type RanglistenPartie = {
  a: number; // Position Spieler A
  b: number; // Position Spieler B
  standA: Stand;
  standB: Stand;
  vorgabeA: number;
  vorgabeB: number;
};

export type Zeile = {
  pos: number;
  punkte: number;
  diff: number;
  gewonnen: number; // Saetze
  verloren: number;
  spiele: number;
  dvPunkte?: number; // direkter Vergleich
  dvDiff?: number;
};

export type Gleichstand = {
  schluessel: string; // aus den sortierten Positionen, z.B. "2-5"
  start: number; // Tabellenplatz-Index der Gruppe
  mitglieder: number[]; // Positionen in aktueller Reihenfolge
  entschieden: boolean; // Reihenfolge von Hand festgelegt
};

// Von Hand festgelegte Reihenfolge je Gleichstandsgruppe (Stichkampf)
export type HandReihenfolge = Record<string, number[]>;

export function gleichstandSchluessel(positionen: number[]): string {
  return [...positionen].sort((x, y) => x - y).join('-');
}

function nichtTrennbar(x: Zeile, y: Zeile): boolean {
  return (
    x.punkte === y.punkte &&
    x.diff === y.diff &&
    x.dvPunkte !== undefined &&
    y.dvPunkte !== undefined &&
    x.dvPunkte === y.dvPunkte &&
    x.dvDiff === y.dvDiff
  );
}

// Tabelle wie in v57 calculateRanking() und sortStats():
//   1. Punkte (1 je gewonnenem Spiel), 2. Satzdifferenz,
//   3. direkter Vergleich innerhalb der punkt- und differenzgleichen Gruppe
//      (Siege, dann Satzdifferenz), 4. von Hand festgelegte Reihenfolge.
// Bei voelliger Gleichheit bleibt die Startnummern-Reihenfolge.
export function rangliste(
  anzahl: number,
  partien: RanglistenPartie[],
  hand: HandReihenfolge = {}
): { zeilen: Zeile[]; gleichstaende: Gleichstand[] } {
  const zeilen: Zeile[] = Array.from({ length: anzahl }, (_, pos) => ({
    pos,
    punkte: 0,
    diff: 0,
    gewonnen: 0,
    verloren: 0,
    spiele: 0
  }));
  const dv: number[][] = Array.from({ length: anzahl }, () => Array(anzahl).fill(0));

  for (const p of partien) {
    if (p.b < 0 || p.a < 0) continue;
    if (!angefangen(p.standA, p.standB, p.vorgabeA, p.vorgabeB)) continue;
    if (p.standA === null || p.standB === null) continue;
    const a = zeilen[p.a];
    const b = zeilen[p.b];
    a.diff += p.standA - p.standB;
    b.diff += p.standB - p.standA;
    a.gewonnen += p.standA;
    a.verloren += p.standB;
    b.gewonnen += p.standB;
    b.verloren += p.standA;
    a.spiele += 1;
    b.spiele += 1;
    if (p.standA > p.standB) a.punkte += 1;
    else if (p.standB > p.standA) b.punkte += 1;
    dv[p.a][p.b] = p.standA - p.standB;
    dv[p.b][p.a] = p.standB - p.standA;
  }

  // Stufe 1 und 2 (stabil: sonst Startnummern-Reihenfolge)
  zeilen.sort((x, y) => y.punkte - x.punkte || y.diff - x.diff);

  // Stufe 3: direkter Vergleich je punkt- und differenzgleichem Block
  let start = 0;
  while (start < zeilen.length) {
    let ende = start + 1;
    while (
      ende < zeilen.length &&
      zeilen[ende].punkte === zeilen[start].punkte &&
      zeilen[ende].diff === zeilen[start].diff
    )
      ende += 1;
    if (ende - start > 1) {
      const block = zeilen.slice(start, ende);
      block.forEach((p) => {
        p.dvPunkte = 0;
        p.dvDiff = 0;
        block.forEach((q) => {
          if (p.pos === q.pos) return;
          const d = dv[p.pos][q.pos];
          p.dvDiff = (p.dvDiff ?? 0) + d;
          if (d > 0) p.dvPunkte = (p.dvPunkte ?? 0) + 1;
        });
      });
      block.sort((x, y) => (y.dvPunkte ?? 0) - (x.dvPunkte ?? 0) || (y.dvDiff ?? 0) - (x.dvDiff ?? 0));
      block.forEach((p, k) => (zeilen[start + k] = p));
    }
    start = ende;
  }

  // Stufe 4: nicht trennbare Gruppen, Reihenfolge von Hand anwenden
  const gleichstaende: Gleichstand[] = [];
  let i = 0;
  while (i < zeilen.length) {
    let j = i + 1;
    while (j < zeilen.length && nichtTrennbar(zeilen[i], zeilen[j])) j += 1;
    if (j - i > 1) {
      const mitglieder = zeilen.slice(i, j).map((z) => z.pos);
      const schluessel = gleichstandSchluessel(mitglieder);
      const reihenfolge = hand[schluessel];
      let entschieden = false;
      if (
        Array.isArray(reihenfolge) &&
        reihenfolge.length === mitglieder.length &&
        reihenfolge.every((x) => mitglieder.includes(x))
      ) {
        const nachPos = new Map(zeilen.slice(i, j).map((z) => [z.pos, z]));
        reihenfolge.forEach((pos, k) => (zeilen[i + k] = nachPos.get(pos) as Zeile));
        entschieden = true;
      }
      gleichstaende.push({ schluessel, start: i, mitglieder: zeilen.slice(i, j).map((z) => z.pos), entschieden });
    }
    i = j;
  }

  return { zeilen, gleichstaende };
}
