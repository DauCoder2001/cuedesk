// Reihenfolge der Gruppenrunden in der Spielplan-Liste, an den Tablets und auf
// dem Fernseher ("Nächste Spiele"). Einstellbar je Turnier mit mehreren Gruppen
// (Einstellung `reihenfolge`):
//   abwechselnd  A 1, B 1, A 2, B 2 ... (Vorgabe); die groessere Gruppe spielt
//                ihre letzten Runden allein
//   verteilt     jede Runde nach ihrem Anteil an der Gruppe, (Runde - 0,5) /
//                Runden; so werden alle Gruppen etwa gleichzeitig fertig
//   laufend      die Gruppe mit den meisten offenen Spielen zuerst; aendert sich
//                mit jedem Ergebnis und folgt so dem Spieltempo
// Ergebnisse und Paarungen aendern sich dabei nie, nur die Reihenfolge.

export type Reihenfolge = 'abwechselnd' | 'verteilt' | 'laufend';

export const REIHENFOLGE_TEXT: Record<Reihenfolge, string> = {
  abwechselnd: 'Abwechselnd',
  verteilt: 'Gleich verteilt',
  laufend: 'Laufend'
};

// Gruppenpartie, wie sie Spielplan und Tablet kennen
type GruppenPartie = { gruppe?: string | null; runde: number | null; phase?: string | null; status: string };

export const rundenSchluessel = (gruppe: string | null | undefined, runde: number | null) => `${gruppe ?? ''}|${runde ?? 0}`;

// Nur die Gruppenphase wird umsortiert; Duelle, KO und Phase 3 folgen danach
export const istGruppenrunde = (p: Pick<GruppenPartie, 'phase'>) =>
  p.phase !== 'phase2' && p.phase !== 'phase3' && p.phase !== 'ko';

// Platz jeder Gruppenrunde (Schluessel rundenSchluessel) in der Liste, ab 0
export function rundenFolge(partien: GruppenPartie[], art: Reihenfolge = 'abwechselnd'): Map<string, number> {
  type Runde = { gruppe: string; runde: number; offen: number };
  const karte = new Map<string, Runde>();
  for (const p of partien) {
    if (!istGruppenrunde(p)) continue;
    const k = rundenSchluessel(p.gruppe, p.runde);
    const r = karte.get(k) ?? { gruppe: p.gruppe ?? '', runde: p.runde ?? 0, offen: 0 };
    if (p.status !== 'beendet' && p.status !== 'abgebrochen') r.offen += 1;
    karte.set(k, r);
  }
  const runden = [...karte.values()];
  const anzahl = new Map<string, number>();
  for (const r of runden) anzahl.set(r.gruppe, (anzahl.get(r.gruppe) ?? 0) + 1);
  // Anteil der Runde an ihrer Gruppe (Mitte der Runde)
  const anteil = (r: Runde, platz: number) => (platz + 0.5) / (anzahl.get(r.gruppe) ?? 1);
  const nachGruppe = new Map<string, Runde[]>();
  for (const r of [...runden].sort((a, b) => a.runde - b.runde)) {
    nachGruppe.set(r.gruppe, [...(nachGruppe.get(r.gruppe) ?? []), r]);
  }
  const platzIn = (r: Runde) => (nachGruppe.get(r.gruppe) ?? []).indexOf(r);

  let folge: Runde[];
  if (art === 'laufend') {
    // Fertige Runden zuerst (abwechselnd), danach immer die Gruppe mit den
    // meisten offenen Spielen; bei Gleichstand wie "gleich verteilt"
    const fertig = runden.filter((r) => r.offen === 0).sort((a, b) => a.runde - b.runde || a.gruppe.localeCompare(b.gruppe));
    const reste = new Map([...nachGruppe].map(([g, l]) => [g, l.filter((r) => r.offen > 0)]));
    const rest = new Map([...reste].map(([g, l]) => [g, l.reduce((s, r) => s + r.offen, 0)]));
    const gruppen = [...reste.keys()].sort();
    folge = [...fertig];
    for (;;) {
      let beste: string | null = null;
      for (const g of gruppen) {
        const naechste = reste.get(g)?.[0];
        if (!naechste) continue;
        if (beste === null) {
          beste = g;
          continue;
        }
        const d = (rest.get(g) ?? 0) - (rest.get(beste) ?? 0);
        const bisher = reste.get(beste)?.[0] as Runde;
        if (d > 0 || (d === 0 && anteil(naechste, platzIn(naechste)) < anteil(bisher, platzIn(bisher)))) beste = g;
      }
      if (beste === null) break;
      const r = (reste.get(beste) as Runde[]).shift() as Runde;
      rest.set(beste, (rest.get(beste) ?? 0) - r.offen);
      folge.push(r);
    }
  } else {
    const wert = (r: Runde) => (art === 'verteilt' ? anteil(r, platzIn(r)) : r.runde);
    folge = [...runden].sort((a, b) => wert(a) - wert(b) || a.gruppe.localeCompare(b.gruppe));
  }
  return new Map(folge.map((r, i) => [rundenSchluessel(r.gruppe, r.runde), i]));
}
