// Mannschaften und Kader.
//
// Ein Verein meldet je Saison mehrere Mannschaften; im Mannschaftspass tragen
// sie die Nummern 1, 2, 3 ... Wer im Kader einer unteren Mannschaft steht,
// hilft oben aus, umgekehrt geht das nicht: Stammspieler sind an ihre
// Mannschaft gebunden. Das Programm erzwingt nichts, es weist nur darauf hin
// und zaehlt die Einsaetze, damit die Festspielregel im Blick bleibt.
//
// Reine Rechnung ohne Datenbank, abgesichert durch test/mannschaften.test.ts.

export type MannschaftKurz = {
  id: string;
  name: string;
  rang: number; // 1 = erste Mannschaft, kleinere Zahl heisst hoeher
};

export type KaderEintrag = {
  mannschaft_id: string;
  person_id: string;
  stammspieler: boolean;
};

// Die Saison beginnt im Juli: Spiele ab dem 1. Juli 2026 gehoeren zu 2026/27.
export function saisonAus(datum: string): string {
  const d = new Date(`${datum}T12:00:00`);
  const jahr = d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`;
}

// Auswahl im Formular: die laufende Saison und je zwei davor und danach.
export function saisonListe(heute = new Date().toISOString().slice(0, 10)): string[] {
  const jetzt = Number(saisonAus(heute).slice(0, 4));
  return [-2, -1, 0, 1].map((v) => {
    const jahr = jetzt + v;
    return `${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`;
  });
}

// Hinweise zu einer Aufstellung. Aushilfe nach oben ist normal und bleibt
// stumm; gemeldet wird, wer gar nicht gemeldet ist oder wer oben festgespielt
// ist und unten antreten soll.
export function kaderHinweise(args: {
  mannschaft: MannschaftKurz;
  aufgestellt: string[];
  kader: KaderEintrag[];
  mannschaften: MannschaftKurz[];
  name: (id: string) => string;
}): string[] {
  const { mannschaft, kader, mannschaften, name } = args;
  const hinweise: string[] = [];
  const mannschaftVon = (id: string) => mannschaften.find((m) => m.id === id);

  [...new Set(args.aufgestellt.filter(Boolean))].forEach((person) => {
    const eintraege = kader.filter((k) => k.person_id === person);
    if (eintraege.length === 0) {
      hinweise.push(`${name(person)} steht in keinem Kader dieser Saison.`);
      return;
    }
    if (eintraege.some((k) => k.mannschaft_id === mannschaft.id)) return;

    // Stammspieler einer hoeheren Mannschaft duerfen nicht nach unten.
    const stamm = eintraege.find((k) => k.stammspieler);
    const heimat = stamm ? mannschaftVon(stamm.mannschaft_id) : undefined;
    if (heimat && heimat.rang < mannschaft.rang) {
      hinweise.push(`${name(person)} ist Stammspieler in ${heimat.name} und darf hier nicht antreten.`);
    }
  });
  return hinweise;
}

export type Einsatzzeile = {
  person_id: string;
  mannschaft_id: string | null; // ohne Zuordnung, wenn der Spieltag keine kennt
  begegnungen: number;
  partien: number;
};

// Zaehlt die Einsaetze. Eine Begegnung zaehlt einmal, auch wenn jemand darin
// zwei Partien bestreitet; die Partien stehen daneben.
export function einsaetze(
  spieltage: { id: string; mannschaft_id: string | null; spieler: string[] }[]
): Einsatzzeile[] {
  const gezaehlt = new Map<string, Einsatzzeile>();
  spieltage.forEach((tag) => {
    const inDieserBegegnung = new Set<string>();
    tag.spieler.filter(Boolean).forEach((person) => {
      const schluessel = `${person}|${tag.mannschaft_id ?? ''}`;
      const zeile = gezaehlt.get(schluessel) ?? {
        person_id: person,
        mannschaft_id: tag.mannschaft_id,
        begegnungen: 0,
        partien: 0
      };
      zeile.partien += 1;
      if (!inDieserBegegnung.has(schluessel)) {
        zeile.begegnungen += 1;
        inDieserBegegnung.add(schluessel);
      }
      gezaehlt.set(schluessel, zeile);
    });
  });
  return [...gezaehlt.values()].sort((a, b) => b.begegnungen - a.begegnungen || b.partien - a.partien);
}

export type SpieltagErgebnis = {
  partiepunkte: [number, number]; // immer aus eigener Sicht
  matchpunkte: [number, number];
  entschieden: boolean;
};

export type SaisonBilanz = {
  begegnungen: number;
  gewertet: number; // abgeschlossene Begegnungen
  siege: number;
  unentschieden: number;
  niederlagen: number;
  matchpunkte: [number, number];
  partiepunkte: [number, number];
};

// Summe ueber alle Begegnungen einer Saison, aus Sicht der eigenen Mannschaft.
export function saisonBilanz(ergebnisse: SpieltagErgebnis[]): SaisonBilanz {
  const bilanz: SaisonBilanz = {
    begegnungen: ergebnisse.length,
    gewertet: 0,
    siege: 0,
    unentschieden: 0,
    niederlagen: 0,
    matchpunkte: [0, 0],
    partiepunkte: [0, 0]
  };
  ergebnisse.forEach((e) => {
    bilanz.partiepunkte[0] += e.partiepunkte[0];
    bilanz.partiepunkte[1] += e.partiepunkte[1];
    if (!e.entschieden) return;
    bilanz.gewertet += 1;
    bilanz.matchpunkte[0] += e.matchpunkte[0];
    bilanz.matchpunkte[1] += e.matchpunkte[1];
    if (e.matchpunkte[0] > e.matchpunkte[1]) bilanz.siege += 1;
    else if (e.matchpunkte[0] < e.matchpunkte[1]) bilanz.niederlagen += 1;
    else bilanz.unentschieden += 1;
  });
  return bilanz;
}

// Der Verband erwartet je Mannschaft eine Mindestzahl Stammspieler: vier in
// den unteren Klassen, in hoeheren mehr. Geprueft wird nur die Anzahl.
export function stammspielerHinweis(anzahl: number, soll = 4): string | null {
  if (anzahl >= soll) return null;
  if (anzahl === 0) return `Noch kein Stammspieler gemeldet (${soll} sind üblich).`;
  return `Erst ${anzahl} von ${soll} Stammspielern gemeldet.`;
}
