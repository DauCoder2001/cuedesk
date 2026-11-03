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
  berechtigt_ab?: string | null; // Spalte "Berechtigt" im Mannschaftspass
};

// Die Saison beginnt im Juli: Spiele ab dem 1. Juli 2026 gehoeren zu 2026/27.
// beginn: Monat, in dem die Saison anfaengt (Seite "System", Standard Juli)
export function saisonAus(datum: string, beginn = 7): string {
  const d = new Date(`${datum}T12:00:00`);
  const jahr = d.getMonth() + 1 >= beginn ? d.getFullYear() : d.getFullYear() - 1;
  return `${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`;
}

// Auswahl im Formular: die laufende Saison und je zwei davor und danach.
export function saisonListe(heute = new Date().toISOString().slice(0, 10), beginn = 7): string[] {
  const jetzt = Number(saisonAus(heute, beginn).slice(0, 4));
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

// ---------- Einsatzregeln der BLVN-STO Pool ----------

// Ein Liga-Einsatz eines eigenen Spielers: Datum und Mannschaft (Einzel-
// Begegnungen; das Doppel zaehlt nicht).
export type EinsatzTag = { datum: string; mannschaft_id: string; person_id: string };

// Ersatzspieler einer Mannschaft sind Spieler aus numerisch darunter liegenden
// Mannschaften (2.2.2): nicht im Kader dieser Mannschaft, aber in dem einer
// unteren.
export function istErsatz(person: string, mannschaft: MannschaftKurz, kader: KaderEintrag[], mannschaften: MannschaftKurz[]): boolean {
  const eigene = kader.filter((k) => k.person_id === person);
  if (eigene.some((k) => k.mannschaft_id === mannschaft.id)) return false;
  return eigene.some((k) => (mannschaften.find((m) => m.id === k.mannschaft_id)?.rang ?? 0) > mannschaft.rang);
}

// Mit dem 3. Einsatz als Ersatzspieler ist ein Spieler in der Mannschaft
// festgespielt, in der er zuletzt eingesetzt wurde (2.2.4); 1 Spieltag = 1
// Einsatz, gezaehlt wird also nach Datum. Zurueck: Person -> Mannschaft.
export function festgespielt(
  tage: EinsatzTag[],
  kader: KaderEintrag[],
  mannschaften: MannschaftKurz[]
): Map<string, string> {
  const ergebnis = new Map<string, string>();
  const jePerson = new Map<string, EinsatzTag[]>();
  tage.forEach((t) => {
    const m = mannschaften.find((x) => x.id === t.mannschaft_id);
    if (!m || !istErsatz(t.person_id, m, kader, mannschaften)) return;
    jePerson.set(t.person_id, [...(jePerson.get(t.person_id) ?? []), t]);
  });
  jePerson.forEach((liste, person) => {
    const sortiert = [...liste].sort((a, b) => a.datum.localeCompare(b.datum));
    const daten: string[] = [];
    for (const t of sortiert) {
      if (!daten.includes(t.datum)) daten.push(t.datum);
      if (daten.length === 3) {
        ergebnis.set(person, t.mannschaft_id);
        break;
      }
    }
  });
  return ergebnis;
}

// Samstag und Sonntag desselben Wochenendes (2.2.5); an Werktagen nur der Tag
const tagVerschoben = (datum: string, tage: number) => {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
};
export function wochenende(datum: string): string[] {
  const tag = new Date(`${datum}T12:00:00Z`).getUTCDay();
  if (tag === 6) return [datum, tagVerschoben(datum, 1)];
  if (tag === 0) return [tagVerschoben(datum, -1), datum];
  return [datum];
}

const WOCHENTAG = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
const tagText = (datum: string) => {
  const d = new Date(`${datum}T12:00:00Z`);
  return `${WOCHENTAG[d.getUTCDay()]}, ${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;
};

// Hinweise zu Festspielregel und Wochenende fuer eine Begegnung. andere: die
// Einsaetze der uebrigen Einzel-Begegnungen der Saison (ohne diese).
export function einsatzHinweise(args: {
  mannschaft: MannschaftKurz;
  datum: string;
  aufgestellt: string[];
  andere: EinsatzTag[];
  kader: KaderEintrag[];
  mannschaften: MannschaftKurz[];
  name: (id: string) => string;
}): string[] {
  const { mannschaft, datum, andere, kader, mannschaften, name } = args;
  const hinweise: string[] = [];
  const mannschaftName = (id: string) => mannschaften.find((m) => m.id === id)?.name ?? '?';
  const personen = [...new Set(args.aufgestellt.filter(Boolean))];
  const vorher = festgespielt(andere, kader, mannschaften);
  const mitDieser = festgespielt(
    [...andere, ...personen.map((person) => ({ datum, mannschaft_id: mannschaft.id, person_id: person }))],
    kader,
    mannschaften
  );
  const wochenendTage = wochenende(datum);
  personen.forEach((person) => {
    const fest = vorher.get(person);
    if (fest && fest !== mannschaft.id) {
      hinweise.push(`${name(person)} ist in ${mannschaftName(fest)} festgespielt (3 Einsätze als Ersatzspieler) und darf hier nicht mehr antreten.`);
    } else if (!fest && mitDieser.get(person) === mannschaft.id) {
      hinweise.push(`${name(person)} hilft hier zum 3. Mal aus und ist danach in ${mannschaft.name} festgespielt.`);
    }
    const anderswo = andere
      .filter((t) => t.person_id === person && t.mannschaft_id !== mannschaft.id && wochenendTage.includes(t.datum))
      .sort((a, b) => a.datum.localeCompare(b.datum))[0];
    if (anderswo) {
      const text =
        anderswo.datum < datum
          ? `hat am ${tagText(anderswo.datum)} schon für ${mannschaftName(anderswo.mannschaft_id)} gespielt`
          : `steht am ${tagText(anderswo.datum)} auch für ${mannschaftName(anderswo.mannschaft_id)} im Plan`;
      hinweise.push(`${name(person)} ${text} (am selben Wochenende nur eine Mannschaft, STO 2.2.5).`);
    }
    const ab = berechtigtAb(person, mannschaft, kader);
    if (ab && ab > datum) {
      hinweise.push(`${name(person)} ist erst ab ${ab.slice(8, 10)}.${ab.slice(5, 7)}.${ab.slice(0, 4)} spielberechtigt (Nachmeldung, STO 2.1.4).`);
    }
  });
  return hinweise;
}

// Ab wann jemand fuer diese Mannschaft spielen darf: das Datum aus ihrem Kader,
// sonst (Aushilfe) aus dem Kader, in dem er Stammspieler ist, sonst irgendeins.
export function berechtigtAb(person: string, mannschaft: MannschaftKurz, kader: KaderEintrag[]): string | null {
  const eigene = kader.filter((k) => k.person_id === person);
  const eintrag =
    eigene.find((k) => k.mannschaft_id === mannschaft.id) ?? eigene.find((k) => k.stammspieler) ?? eigene.find((k) => k.berechtigt_ab);
  return eintrag?.berechtigt_ab ?? null;
}

// Ersatzspieler einer Aufstellung mit ihrer unteren Mannschaft; laut STO 2.2.3
// stehen sie namentlich unter "Bemerkungen", festgespielte ebenso. fest: aus
// festgespielt (Person -> Mannschaft), diese Begegnung eingerechnet.
export function ersatzspieler(args: {
  mannschaft: MannschaftKurz;
  aufgestellt: string[];
  kader: KaderEintrag[];
  mannschaften: MannschaftKurz[];
  fest: Map<string, string>;
}): { person: string; aus: string; festgespielt: boolean }[] {
  const { mannschaft, kader, mannschaften, fest } = args;
  return [...new Set(args.aufgestellt.filter(Boolean))]
    .filter((person) => istErsatz(person, mannschaft, kader, mannschaften))
    .map((person) => {
      const unten = kader
        .filter((k) => k.person_id === person)
        .map((k) => ({ k, m: mannschaften.find((m) => m.id === k.mannschaft_id) }))
        .filter((x) => x.m && x.m.rang > mannschaft.rang)
        .sort((a, b) => Number(b.k.stammspieler) - Number(a.k.stammspieler) || (a.m?.rang ?? 0) - (b.m?.rang ?? 0));
      return { person, aus: unten[0]?.m?.name ?? '?', festgespielt: fest.get(person) === mannschaft.id };
    });
}

// Zeile fuer die Bemerkungen: "Ersatzspieler: Max M. (Zweite), Lisa L. (Dritte, festgespielt)."
export function ersatzZeile(liste: { person: string; aus: string; festgespielt: boolean }[], name: (id: string) => string): string {
  return `Ersatzspieler: ${liste.map((e) => `${name(e.person)} (${e.aus}${e.festgespielt ? ', festgespielt' : ''})`).join(', ')}.`;
}

// Die Ersatzspieler-Zeile vorn in die Bemerkungen setzen; eine vorhandene
// wird ersetzt, alles andere bleibt
export function mitErsatzZeile(text: string, zeile: string): string {
  const rest = text.split('\n').filter((z) => !z.trim().startsWith('Ersatzspieler:'));
  return [zeile, ...rest].join('\n').trim();
}
