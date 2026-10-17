// Teilnehmer markieren (Turnieransicht): Wer zwei Spieler ankreuzt, sieht
// ihre gemeinsame Partie hervorgehoben; bei einem Spieler alle seine Partien.
// Reine Rechnung, getestet in test/markierung.test.ts.

type MitSpielern = { spieler_a: string; spieler_b: string; status: string };

// Ankreuzen oder abwaehlen. Hoechstens zwei bleiben markiert; ein dritter
// verdraengt den zuerst markierten.
export function markierungUmschalten(liste: string[], id: string): string[] {
  if (liste.includes(id)) return liste.filter((x) => x !== id);
  return [...liste, id].slice(-2);
}

const spielt = (p: MitSpielern, id: string) => p.spieler_a === id || p.spieler_b === id;

// Die Partie der beiden markierten Spieler. Spielen sie mehrmals gegeneinander
// (Gruppe und spaeter Duell oder KO), zaehlt die erste noch offene, sonst die
// letzte.
export function gemeinsamePartie<T extends MitSpielern>(partien: T[], a: string, b: string): T | null {
  const beide = partien.filter((p) => spielt(p, a) && spielt(p, b));
  return beide.find((p) => p.status !== 'beendet') ?? beide[beide.length - 1] ?? null;
}

// Ist die Partie hervorzuheben? Bei zwei Markierten nur ihre gemeinsame,
// bei einem jede seiner Partien.
export function istMarkiert(p: MitSpielern & { id: string }, markiert: string[], paar: { id: string } | null): boolean {
  if (markiert.length === 2) return paar?.id === p.id;
  return markiert.length === 1 && spielt(p, markiert[0]);
}
