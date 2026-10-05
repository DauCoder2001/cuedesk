// Bilanz eines Spielers ueber das ganze Turnier (Gruppenphase, KO-Runde,
// Duelle und Platzierungsspiele) fuer die Endtabellen von "Zwei Gruppen" und
// "Gruppen mit KO". Gezaehlt werden beendete Partien mit Ergebnis; Saetze wie
// in der Gruppentabelle (src/turnier.ts rangliste), also einschliesslich Vorgabe.

export type Bilanz = { spiele: number; siege: number; gewonnen: number; verloren: number };

type Partie = {
  spieler_a: string | null;
  spieler_b: string | null;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  status: string;
};

export const LEERE_BILANZ: Bilanz = { spiele: 0, siege: 0, gewonnen: 0, verloren: 0 };

export function turnierBilanz(partien: Partie[]): Map<string, Bilanz> {
  const karte = new Map<string, Bilanz>();
  const zeile = (id: string) => {
    let b = karte.get(id);
    if (!b) karte.set(id, (b = { ...LEERE_BILANZ }));
    return b;
  };
  for (const p of partien) {
    if (p.status !== 'beendet' || !p.spieler_a || !p.spieler_b) continue;
    if (p.ergebnis_a === null || p.ergebnis_b === null) continue;
    const a = zeile(p.spieler_a);
    const b = zeile(p.spieler_b);
    a.spiele += 1;
    b.spiele += 1;
    a.gewonnen += p.ergebnis_a;
    a.verloren += p.ergebnis_b;
    b.gewonnen += p.ergebnis_b;
    b.verloren += p.ergebnis_a;
    if (p.ergebnis_a > p.ergebnis_b) a.siege += 1;
    else if (p.ergebnis_b > p.ergebnis_a) b.siege += 1;
  }
  return karte;
}

export const diffText = (b: Bilanz) => {
  const d = b.gewonnen - b.verloren;
  return d > 0 ? `+${d}` : String(d);
};
