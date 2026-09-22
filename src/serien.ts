// Serienwertung: Turnierplatzierungen werden zu Punkten.
//
// Uebertragen aus der Serienwertung v15 (Turnier light):
//
//   Punkte = Teilnehmerzahl + 1 - Platz, dazu ein Bonus fuer Platz 1.
//
// Bei acht Teilnehmern und Bonus 1 bekommt der Sieger also 9, der Zweite 7,
// der Letzte 1 Punkt. "Streicher" bedeutet: nur die besten X Turniere je
// Spieler zaehlen; 0 heisst, alle zaehlen.
//
// Die Reihenfolge entscheidet sich nach Punkten, dann nach der Zahl der
// ersten Plaetze, der zweiten Plaetze und so weiter, zuletzt nach Name.
//
// Diese Datei rechnet nur. Sie kennt weder Datenbank noch Oberflaeche.

export type SerienTurnier = {
  id: string;
  name: string;
  datum: string;
  teilnehmer: number;
  platzierungen: { spieler: string; platz: number }[];
};

export type SerienEinstellungen = {
  streicher: number;
  bonus: number;
};

export type SerienErgebnisEintrag = {
  platz: number;
  punkte: number;
  gestrichen: boolean;
};

export type SerienSpieler = {
  spieler: string;
  summe: number;
  gespielt: number;
  gewertet: number;
  ergebnisse: Record<string, SerienErgebnisEintrag>;
  plaetze: Record<number, number>;
  platz: number; // Punktgleiche teilen sich einen Platz
  zeigePlatz: boolean; // nur beim ersten der Punktgleichen anzeigen
};

export function punkteFuer(platz: number, teilnehmer: number, bonus: number): number {
  if (!platz || !teilnehmer || platz > teilnehmer) return 0;
  return teilnehmer + 1 - platz + (platz === 1 ? Math.max(0, bonus) : 0);
}

export function serienwertung(
  turniere: SerienTurnier[],
  einstellungen: SerienEinstellungen,
  name: (spieler: string) => string = (s) => s
): SerienSpieler[] {
  const bonus = Math.max(0, einstellungen.bonus ?? 1);
  const besteX = Math.max(0, einstellungen.streicher ?? 0);

  const spieler = new Map<string, SerienSpieler>();

  [...turniere]
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))
    .forEach((turnier) => {
      turnier.platzierungen.forEach((platzierung) => {
        const eintrag =
          spieler.get(platzierung.spieler) ??
          ({
            spieler: platzierung.spieler,
            summe: 0,
            gespielt: 0,
            gewertet: 0,
            ergebnisse: {},
            plaetze: {},
            platz: 0,
            zeigePlatz: true
          } as SerienSpieler);
        spieler.set(platzierung.spieler, eintrag);

        // Steht jemand versehentlich zweimal in einem Turnier, zaehlt die
        // bessere Platzierung.
        const alt = eintrag.ergebnisse[turnier.id];
        const neu = {
          platz: platzierung.platz,
          punkte: punkteFuer(platzierung.platz, turnier.teilnehmer, bonus),
          gestrichen: false
        };
        if (!alt || neu.platz < alt.platz) eintrag.ergebnisse[turnier.id] = neu;
      });
    });

  const liste = [...spieler.values()];

  liste.forEach((sp) => {
    const eintraege = Object.values(sp.ergebnisse);
    eintraege.forEach((e) => (e.gestrichen = false));

    if (besteX > 0 && eintraege.length > besteX) {
      // absteigend nach Punkten, die schwaechsten fallen heraus
      const sortiert = [...eintraege].sort((a, b) => b.punkte - a.punkte || a.platz - b.platz);
      sortiert.slice(besteX).forEach((e) => (e.gestrichen = true));
    }

    sp.summe = 0;
    sp.plaetze = {};
    eintraege.forEach((e) => {
      if (!e.gestrichen) sp.summe += e.punkte;
      sp.plaetze[e.platz] = (sp.plaetze[e.platz] ?? 0) + 1; // auch gestrichene
    });
    sp.gespielt = eintraege.length;
    sp.gewertet = eintraege.filter((e) => !e.gestrichen).length;
  });

  liste.sort((a, b) => {
    if (b.summe !== a.summe) return b.summe - a.summe;
    for (let platz = 1; platz <= 64; platz += 1) {
      const x = a.plaetze[platz] ?? 0;
      const y = b.plaetze[platz] ?? 0;
      if (x !== y) return y - x;
    }
    return name(a.spieler).localeCompare(name(b.spieler), 'de');
  });

  // Platzziffern wie in v15: punktgleiche Spieler teilen sich einen Platz
  let platz = 0;
  liste.forEach((sp, i) => {
    const neu = i === 0 || sp.summe !== liste[i - 1].summe;
    if (neu) platz = i + 1;
    sp.platz = platz;
    sp.zeigePlatz = neu;
  });

  return liste;
}
