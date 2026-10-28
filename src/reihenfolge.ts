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

// Bei "laufend" bleiben die ersten drei offenen Spiele stehen, bis sie an
// einem Tisch starten; erst die frei gewordenen Plaetze fuellt die aktuelle
// Rechnung. Ab Platz 4 darf sich die Liste verschieben.
export const FESTE_SPITZE = 3;

type SpielPartie = GruppenPartie & {
  id: string;
  tisch_id?: string | null;
  begonnen?: string | null;
  beendet?: string | null;
};

// Platz jedes Gruppenspiels (Schluessel: Partie-ID), ab 0. Die Partien kommen
// in Spielplan-Reihenfolge (Runde, Paarung); innerhalb einer Runde bleibt sie.
// Gebraucht von der Spielplan-Liste, den Tablets und "Nächste Spiele".
export function spielFolge(partien: SpielPartie[], art: Reihenfolge = 'abwechselnd'): Map<string, number> {
  const spiele = partien.filter(istGruppenrunde);
  const index = new Map(spiele.map((p, i) => [p.id, i]));
  const ordnen = (status: (p: SpielPartie) => string) => {
    const runden = rundenFolge(spiele.map((p) => ({ ...p, status: status(p) })), art);
    const platz = (p: SpielPartie) => runden.get(rundenSchluessel(p.gruppe, p.runde)) ?? 0;
    return [...spiele].sort((a, b) => platz(a) - platz(b) || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  };
  const nummern = (liste: SpielPartie[]) => new Map(liste.map((p, i) => [p.id, i]));
  if (art !== 'laufend') return nummern(ordnen((p) => p.status));

  // Offen heisst: weder beendet noch abgebrochen noch an einem Tisch
  const offenJetzt = (p: SpielPartie) => p.status !== 'beendet' && p.status !== 'abgebrochen' && !p.tisch_id;
  // Die feste Spitze ergibt sich aus dem Verlauf (begonnen/beendet), damit
  // jedes Geraet auch nach dem Neuladen dieselbe sieht. Ein zurueckgesetztes
  // Spiel hat keine Zeitstempel mehr und reiht sich normal ein.
  const zeit = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
  const zeiten = [...new Set(spiele.flatMap((p) => [zeit(p.begonnen), zeit(p.beendet)]).filter((t) => Number.isFinite(t)))].sort((a, b) => a - b);
  let spitze: string[] = [];
  const schritt = (offen: (p: SpielPartie) => boolean, fertig: (p: SpielPartie) => boolean) => {
    const istOffen = new Set(spiele.filter(offen).map((p) => p.id));
    spitze = spitze.filter((id) => istOffen.has(id));
    const nachfolger = ordnen((p) => (fertig(p) ? 'beendet' : 'geplant')).filter((p) => istOffen.has(p.id) && !spitze.includes(p.id));
    spitze = [...spitze, ...nachfolger.slice(0, Math.max(0, FESTE_SPITZE - spitze.length)).map((p) => p.id)];
  };
  for (const t of [-Infinity, ...zeiten]) {
    // Beendet ohne Zeitstempel (alter Stand): gilt von Anfang an als fertig
    const fertig = (p: SpielPartie) => p.status === 'beendet' && (!p.beendet || zeit(p.beendet) <= t);
    const gestartet = (p: SpielPartie) => zeit(p.begonnen) <= t;
    schritt((p) => p.status !== 'abgebrochen' && !fertig(p) && !gestartet(p), fertig);
  }
  schritt(offenJetzt, (p) => p.status === 'beendet');

  // Erst die nicht mehr offenen Spiele, dann die feste Spitze, dann der Rest
  const jetzt = ordnen((p) => p.status);
  const nachId = new Map(spiele.map((p) => [p.id, p]));
  return nummern([
    ...jetzt.filter((p) => !offenJetzt(p)),
    ...spitze.map((id) => nachId.get(id) as SpielPartie),
    ...jetzt.filter((p) => offenJetzt(p) && !spitze.includes(p.id))
  ]);
}
