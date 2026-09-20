// Vereins-Rating auf der Fargo-Skala.
//
// Uebertragen aus der Serienwertung v15 (Turnier light). Das Verfahren ist
// unveraendert; beschrieben ist es in "Das Vereins-Rating erklaert":
//
//   - 100 Punkte Unterschied = doppelte Rack-Gewinnchance.
//   - Alle Spieler werden gemeinsam geschaetzt (MM-Verfahren), damit die
//     Staerke des Gegners mitzaehlt.
//   - Jeder bekommt zusaetzlich "gedachte" Racks (Gewicht, Vorgabe 30), je
//     zur Haelfte gewonnen und verloren, gegen seinen Startwert. Das bremst
//     Ausreisser bei wenigen Partien und verhindert unendliche Werte.
//   - Gerechnet wird ueber die letzten Monate (Zeitraum). Wer darin weniger
//     als die Mindest-Racks hat, bekommt sein Fenster rueckwaerts erweitert,
//     hoechstens bis zum Rueckgriff.
//   - Disziplinen werden getrennt gerechnet. Fehlt in einer Disziplin die
//     eigene Grundlage, gilt in dieser Reihenfolge: gesetzter Startwert,
//     Wert aus den anderen Disziplinen, Vereinsschnitt.
//
// Diese Datei rechnet nur. Sie kennt weder Datenbank noch Oberflaeche.

export type RatingPartie = {
  datum: string; // JJJJ-MM-TT
  disziplin: string;
  a: string; // Schluessel des Spielers, z.B. Personen-Kennung
  b: string;
  wa: number; // selbst gespielte Racks, Vorgabe bereits abgezogen
  wb: number;
};

export type RatingEinstellungen = {
  zeitraum: number; // Monate
  mindestRacks: number;
  rueckgriff: number; // Monate
  gewicht: number;
  vereinsschnitt: number;
};

export type Startquelle = 'startwert' | 'andere-disziplin' | 'vereinsschnitt';
export type Status = 'eigene-daten' | 'vorlaeufig' | Startquelle;

export type RatingWert = {
  rating: number;
  racks: number;
  gewonnen: number;
  verloren: number;
  letzte: string;
  erweitert: string; // Datum, ab dem rueckwaerts erweitert wurde, sonst ''
  status: Status;
  startwert: number;
  startquelle: Startquelle;
  startAus: string[]; // Disziplinen, aus denen der Startwert stammt
};

export type RatingAnsicht = {
  fenster: string;
  partien: number;
  werte: Record<string, RatingWert>;
};

export type RatingErgebnis = {
  stichtag: string;
  einstellungen: RatingEinstellungen;
  ansichten: Record<string, RatingAnsicht>; // 'gesamt' und je Disziplin
};

export const GESAMT = 'gesamt';

export const STANDARD_EINSTELLUNGEN: RatingEinstellungen = {
  zeitraum: 12,
  mindestRacks: 100,
  rueckgriff: 36,
  gewicht: 30,
  vereinsschnitt: 500
};

// JJJJ-MM-TT minus n Monate; der Tag wird auf das Monatsende begrenzt.
export function minusMonate(iso: string, n: number): string {
  const [jahrRoh, monatRoh, tagRoh] = iso.split('-').map((x) => parseInt(x, 10));
  let jahr = jahrRoh;
  let monat = monatRoh - n;
  while (monat < 1) {
    monat += 12;
    jahr -= 1;
  }
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const tag = Math.min(tagRoh, letzter);
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

type Auswahl = {
  fenster: string;
  beginn: Record<string, string>;
  benutzt: RatingPartie[];
};

// Partien im Zeitfenster. Wer darin weniger als die Mindest-Racks hat, bekommt
// sein Fenster rueckwaerts erweitert. Eine Partie zaehlt, wenn sie im Fenster
// mindestens eines ihrer beiden Spieler liegt.
export function auswahl(
  partien: RatingPartie[],
  stichtag: string,
  einst: RatingEinstellungen
): Auswahl {
  const fenster = minusMonate(stichtag, einst.zeitraum);
  const rueck = minusMonate(stichtag, einst.rueckgriff);

  const imRueckgriff = partien
    .filter((p) => p.datum <= stichtag && p.datum >= rueck)
    .sort((x, y) => (x.datum < y.datum ? 1 : x.datum > y.datum ? -1 : 0));

  const racks: Record<string, number> = {};
  imRueckgriff.forEach((p) => {
    if (p.datum < fenster) return;
    const n = p.wa + p.wb;
    racks[p.a] = (racks[p.a] ?? 0) + n;
    racks[p.b] = (racks[p.b] ?? 0) + n;
  });

  const aeltere: Record<string, RatingPartie[]> = {};
  imRueckgriff.forEach((p) => {
    if (p.datum >= fenster) return;
    (aeltere[p.a] = aeltere[p.a] ?? []).push(p);
    (aeltere[p.b] = aeltere[p.b] ?? []).push(p);
  });

  const beginn: Record<string, string> = {};
  const spieler = new Set<string>();
  imRueckgriff.forEach((p) => {
    spieler.add(p.a);
    spieler.add(p.b);
  });

  spieler.forEach((k) => {
    let r = racks[k] ?? 0;
    beginn[k] = fenster;
    if (r >= einst.mindestRacks) return;
    beginn[k] = rueck;
    for (const partie of aeltere[k] ?? []) {
      r += partie.wa + partie.wb;
      if (r >= einst.mindestRacks) {
        beginn[k] = partie.datum;
        break;
      }
    }
  });

  return {
    fenster,
    beginn,
    benutzt: imRueckgriff.filter(
      (p) => p.datum >= fenster || p.datum >= beginn[p.a] || p.datum >= beginn[p.b]
    )
  };
}

type Zwischenstand = {
  rating: number;
  racks: number;
  gewonnen: number;
  verloren: number;
  letzte: string;
  erste: string;
};

// Die eigentliche Schaetzung (MM-Verfahren). Es wird so lange gerechnet, bis
// sich kein Wert mehr um mehr als 0,001 Punkte bewegt.
export function rechnen(
  partien: RatingPartie[],
  startwert: (schluessel: string) => number,
  gewicht: number
): Record<string, Zwischenstand> {
  type Spieler = {
    gewonnen: number;
    racks: number;
    gegen: Record<string, number>;
    letzte: string;
    erste: string;
  };
  const sp: Record<string, Spieler> = {};
  const hole = (k: string): Spieler =>
    (sp[k] ??= { gewonnen: 0, racks: 0, gegen: {}, letzte: '', erste: '9999-99-99' });

  partien.forEach((p) => {
    const a = hole(p.a);
    const b = hole(p.b);
    const n = p.wa + p.wb;
    a.gewonnen += p.wa;
    b.gewonnen += p.wb;
    a.racks += n;
    b.racks += n;
    a.gegen[p.b] = (a.gegen[p.b] ?? 0) + n;
    b.gegen[p.a] = (b.gegen[p.a] ?? 0) + n;
    [a, b].forEach((x) => {
      if (p.datum > x.letzte) x.letzte = p.datum;
      if (p.datum < x.erste) x.erste = p.datum;
    });
  });

  const keys = Object.keys(sp);
  const g: Record<string, number> = {};
  const g0: Record<string, number> = {};
  keys.forEach((k) => {
    g0[k] = Math.pow(2, startwert(k) / 100);
    g[k] = g0[k];
  });

  for (let runde = 0; runde < 5000; runde += 1) {
    const neu: Record<string, number> = {};
    keys.forEach((k) => {
      const s = sp[k];
      let nenner = gewicht / (g[k] + g0[k]);
      for (const gegner in s.gegen) nenner += s.gegen[gegner] / (g[k] + g[gegner]);
      neu[k] = (s.gewonnen + gewicht / 2) / nenner;
    });
    let groessteAenderung = 0;
    keys.forEach((k) => {
      groessteAenderung = Math.max(groessteAenderung, Math.abs(100 * Math.log2(neu[k] / g[k])));
      g[k] = neu[k];
    });
    if (groessteAenderung < 0.001) break;
  }

  const ergebnis: Record<string, Zwischenstand> = {};
  keys.forEach((k) => {
    ergebnis[k] = {
      rating: 100 * Math.log2(g[k]),
      racks: sp[k].racks,
      gewonnen: sp[k].gewonnen,
      verloren: sp[k].racks - sp[k].gewonnen,
      letzte: sp[k].letzte,
      erste: sp[k].erste
    };
  });
  return ergebnis;
}

function disziplinenJeSpieler(partien: RatingPartie[], reihenfolge: string[]) {
  const map: Record<string, Set<string>> = {};
  partien.forEach((p) => {
    (map[p.a] ??= new Set()).add(p.disziplin);
    (map[p.b] ??= new Set()).add(p.disziplin);
  });
  const out: Record<string, string[]> = {};
  Object.keys(map).forEach((k) => {
    out[k] = [...map[k]].sort((a, b) => reihenfolge.indexOf(a) - reihenfolge.indexOf(b));
  });
  return out;
}

type Start = { wert: number; quelle: Startquelle; aus: string[] };

function eintrag(
  stand: Zwischenstand | undefined,
  start: Start,
  ausw: Auswahl,
  schluessel: string,
  mindestRacks: number
): RatingWert {
  if (stand) {
    const eigenErweitert =
      ausw.beginn[schluessel] !== undefined &&
      ausw.beginn[schluessel] < ausw.fenster &&
      stand.erste < ausw.fenster;
    return {
      rating: Math.round(stand.rating),
      racks: stand.racks,
      gewonnen: stand.gewonnen,
      verloren: stand.verloren,
      letzte: stand.letzte,
      erweitert: eigenErweitert ? stand.erste : '',
      status: stand.racks >= mindestRacks ? 'eigene-daten' : 'vorlaeufig',
      startwert: start.wert,
      startquelle: start.quelle,
      startAus: start.aus
    };
  }
  return {
    rating: Math.round(start.wert),
    racks: 0,
    gewonnen: 0,
    verloren: 0,
    letzte: '',
    erweitert: '',
    status: start.quelle,
    startwert: start.wert,
    startquelle: start.quelle,
    startAus: start.aus
  };
}

export type RatingEingabe = {
  partien: RatingPartie[];
  startwerte: Record<string, number>;
  stichtag: string;
  einstellungen?: Partial<RatingEinstellungen>;
  disziplinen: string[];
  /** Spieler, die in der Liste nicht erscheinen. Ihre Partien zaehlen weiter. */
  ausgeblendet?: string[];
};

export function berechnen(eingabe: RatingEingabe): RatingErgebnis {
  const einst: RatingEinstellungen = { ...STANDARD_EINSTELLUNGEN, ...eingabe.einstellungen };
  einst.rueckgriff = Math.max(einst.zeitraum, einst.rueckgriff);

  const stichtag = eingabe.stichtag;
  const rueck = minusMonate(stichtag, einst.rueckgriff);
  const versteckt = new Set(eingabe.ausgeblendet ?? []);

  // Aufgefuehrt werden Spieler mit Partien im Rueckgriff oder mit Startwert.
  const spieler = new Set<string>();
  eingabe.partien.forEach((p) => {
    if (p.datum > stichtag || p.datum < rueck) return;
    spieler.add(p.a);
    spieler.add(p.b);
  });
  Object.keys(eingabe.startwerte).forEach((k) => spieler.add(k));
  versteckt.forEach((k) => spieler.delete(k));

  const startManuell = (k: string): Start =>
    eingabe.startwerte[k] !== undefined
      ? { wert: eingabe.startwerte[k], quelle: 'startwert', aus: [] }
      : { wert: einst.vereinsschnitt, quelle: 'vereinsschnitt', aus: [] };

  const ergebnis: RatingErgebnis = { stichtag, einstellungen: einst, ansichten: {} };

  // Gesamt ueber alle Disziplinen
  const gAusw = auswahl(eingabe.partien, stichtag, einst);
  const gRes = rechnen(gAusw.benutzt, (k) => startManuell(k).wert, einst.gewicht);
  const gWerte: Record<string, RatingWert> = {};
  spieler.forEach((k) => {
    gWerte[k] = eintrag(gRes[k], startManuell(k), gAusw, k, einst.mindestRacks);
  });
  ergebnis.ansichten[GESAMT] = {
    fenster: gAusw.fenster,
    partien: gAusw.benutzt.length,
    werte: gWerte
  };

  // Je Disziplin, mit Startwert aus den anderen Disziplinen
  eingabe.disziplinen.forEach((disziplin) => {
    const andere = auswahl(
      eingabe.partien.filter((p) => p.disziplin !== disziplin),
      stichtag,
      einst
    );
    const andereRes = rechnen(andere.benutzt, (k) => startManuell(k).wert, einst.gewicht);
    const andereDisziplinen = disziplinenJeSpieler(andere.benutzt, eingabe.disziplinen);

    const start = (k: string): Start => {
      if (eingabe.startwerte[k] !== undefined) return startManuell(k);
      if (andereRes[k]) {
        return {
          wert: andereRes[k].rating,
          quelle: 'andere-disziplin',
          aus: andereDisziplinen[k] ?? []
        };
      }
      return startManuell(k);
    };

    const eigene = auswahl(
      eingabe.partien.filter((p) => p.disziplin === disziplin),
      stichtag,
      einst
    );
    const eigeneRes = rechnen(eigene.benutzt, (k) => start(k).wert, einst.gewicht);

    const werte: Record<string, RatingWert> = {};
    spieler.forEach((k) => {
      werte[k] = eintrag(eigeneRes[k], start(k), eigene, k, einst.mindestRacks);
    });
    ergebnis.ansichten[disziplin] = {
      fenster: eigene.fenster,
      partien: eigene.benutzt.length,
      werte
    };
  });

  return ergebnis;
}
