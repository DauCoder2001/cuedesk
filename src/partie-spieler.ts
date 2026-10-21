// Partien mit und ohne Spieler. Leer sind die Spieler nur beim Team-Match
// eines Teamvergleichs (Regel partien_team_match in der Datenbank). Alle
// Ansichten, die einzelne Spieler zeigen oder auswerten (Turnier, Liga,
// Ranglisten, Archiv, Statistik), arbeiten mit SpielerPartie und filtern
// Team-Matches beim Laden mit mitSpielern heraus.

export type MitSpielerFeldern = { spieler_a: string | null; spieler_b: string | null };

export type SpielerPartie<T extends MitSpielerFeldern = MitSpielerFeldern> = T & { spieler_a: string; spieler_b: string };

export function mitSpielern<T extends MitSpielerFeldern>(p: T): p is SpielerPartie<T> {
  return p.spieler_a !== null && p.spieler_b !== null;
}

// Team-Match: Team gegen Team ohne einzelne Spieler
export function istTeamMatch(p: MitSpielerFeldern & { phase?: string | null }): boolean {
  return p.spieler_a === null && p.spieler_b === null && p.phase === 'team';
}
