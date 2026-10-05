// Saison-Ueberblick oben auf der Seite "Auswertung und Archiv" (wie in Pool-TS):
// Spiele, Spielzeit an den Tischen, durchschnittliche Spieldauer, aktivster
// Spieler, beste drei nach Siegen und Spielzeit je Tisch. Grundlage sind die
// beendeten Partien der gewaehlten Saison, mit Einzelspielen, Liga und 14.1.
// Spieldauer gibt es nur fuer Spiele, die am Tablet gespielt wurden (begonnen
// und beendet gesetzt). In "Aktivster Spieler" und "Beste drei" stehen nur
// Mitglieder, wie in den Ranglisten; Gaeste zaehlen bei Spielen und Zeiten mit.

export type UeberblickPartie = {
  spieler_a: string;
  spieler_b: string;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  begonnen?: string | null;
  beendet?: string | null;
  tisch_id?: string | null;
};

export type SpielerZahl = { id: string; spiele: number; siege: number };

export type Ueberblick = {
  spiele: number;
  mitDauer: number; // Spiele mit erfasster Dauer
  minuten: number; // Summe der erfassten Spieldauer
  schnitt: number | null; // Minuten je Spiel mit Dauer
  aktivster: SpielerZahl | null;
  beste: SpielerZahl[];
  jeTisch: { tischId: string; minuten: number }[]; // absteigend
};

// Laenger als 6 Stunden ist kein Spiel, sondern ein vergessenes Tablet
const HOECHSTENS_MINUTEN = 360;

export function spieldauer(p: UeberblickPartie): number | null {
  if (!p.begonnen || !p.beendet) return null;
  const minuten = (Date.parse(p.beendet) - Date.parse(p.begonnen)) / 60000;
  return Number.isFinite(minuten) && minuten > 0 && minuten <= HOECHSTENS_MINUTEN ? minuten : null;
}

export function saisonUeberblick(partien: UeberblickPartie[], istMitglied: (id: string) => boolean): Ueberblick {
  const spieler = new Map<string, SpielerZahl>();
  const tische = new Map<string, number>();
  let mitDauer = 0;
  let minuten = 0;

  const zaehle = (id: string, sieg: boolean) => {
    if (!istMitglied(id)) return;
    const z = spieler.get(id) ?? { id, spiele: 0, siege: 0 };
    z.spiele += 1;
    if (sieg) z.siege += 1;
    spieler.set(id, z);
  };

  for (const p of partien) {
    const a = p.ergebnis_a ?? 0;
    const b = p.ergebnis_b ?? 0;
    zaehle(p.spieler_a, a > b);
    zaehle(p.spieler_b, b > a);
    const dauer = spieldauer(p);
    if (dauer !== null) {
      mitDauer += 1;
      minuten += dauer;
      if (p.tisch_id) tische.set(p.tisch_id, (tische.get(p.tisch_id) ?? 0) + dauer);
    }
  }

  const liste = [...spieler.values()];
  const aktivster = [...liste].sort((x, y) => y.spiele - x.spiele || y.siege - x.siege)[0] ?? null;
  const beste = liste
    .filter((z) => z.siege > 0)
    .sort((x, y) => y.siege - x.siege || x.spiele - y.spiele)
    .slice(0, 3);

  return {
    spiele: partien.length,
    mitDauer,
    minuten,
    schnitt: mitDauer > 0 ? minuten / mitDauer : null,
    aktivster,
    beste,
    jeTisch: [...tische.entries()].map(([tischId, m]) => ({ tischId, minuten: m })).sort((x, y) => y.minuten - x.minuten)
  };
}

// 196 h 57 min, 41 min
export function dauerText(minuten: number): string {
  const m = Math.round(minuten);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
}
