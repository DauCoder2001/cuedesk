// 14.1-Statistik einer Person aus dem Aufnahme-Protokoll. Reine Rechnung
// ohne Datenbank, deshalb mit Tests abgesichert (test/statistik-141.test.ts).
//
// Eine Aufnahme ist jede Zeile in aufnahmen_141 - genau so zaehlt auch das
// Scoreboard (jeder Protokolleintrag erhoeht "Aufn."). Punkte sind das
// Aufnahmeresultat (Baelle minus Foulpunkte), eine Serie sind die Baelle.

export type ArtAufnahme = 'serie' | 'sicherheit' | 'foul' | 'foul3' | 'eroeffnungsfoul' | 'ende';

export type StatAufnahme = {
  partie_id: string;
  lfd_nr: number;
  spieler: string;
  baelle: number;
  punkte: number;
  art: ArtAufnahme;
  markierung: string;
  rack_segmente: number[];
  zeitpunkt: string | null;
};

export type StatPartie = {
  id: string;
  datum: string;
  status: 'beendet' | 'abgebrochen';
  spieler_a: string;
  spieler_b: string;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  begonnen: string | null;
  beendet: string | null;
};

export type Ausgang = 'sieg' | 'niederlage' | 'unentschieden' | 'abgebrochen';

export type PartieWerte = {
  partie: StatPartie;
  gegner: string;
  eigene: number;
  fremde: number;
  ausgang: Ausgang;
  aufnahmen: number;
  punkte: number;
  gd: number | null;
  hs: number;
  fouls: number;
  foulquote: number | null; // Fouls je 10 Aufnahmen
};

export const SERIEN_KLASSEN = ['0', '1–4', '5–9', '10–14', '15–29', '30+'] as const;

export type Statistik141 = {
  partien: number;
  aufnahmen: number;
  punkte: number;
  gd: number | null;
  hs: { wert: number; partie: StatPartie | null; gegner: string | null };
  durchschnittSerie: number | null;
  verteilung: number[]; // je SERIEN_KLASSEN
  nullQuote: number | null;
  sicherheitQuote: number | null;
  verschossenQuote: number | null;
  foulsJe10: number | null;
  zweiteFouls: number;
  dreiFouls: number;
  eroeffnungsfouls: number;
  rackUebergaenge: number;
  sekundenJeAufnahme: number | null;
  bilanz: { siege: number; niederlagen: number; unentschieden: number };
  jePartie: PartieWerte[]; // aelteste zuerst
};

export function serienKlasse(baelle: number): number {
  if (baelle <= 0) return 0;
  if (baelle <= 4) return 1;
  if (baelle <= 9) return 2;
  if (baelle <= 14) return 3;
  if (baelle <= 29) return 4;
  return 5;
}

const istFoul = (art: ArtAufnahme) => art === 'foul' || art === 'foul3' || art === 'eroeffnungsfoul';
const anteil = (zaehler: number, nenner: number) => (nenner > 0 ? zaehler / nenner : null);

function spielbeginn(p: StatPartie): number | null {
  return p.begonnen ? Date.parse(p.begonnen) : null;
}

// Chronologische Reihenfolge: Spielende, sonst Datum.
function zeitwert(p: StatPartie): number {
  return Date.parse(p.beendet ?? p.begonnen ?? `${p.datum}T12:00:00Z`);
}

export function sortiertNachZeit(partien: StatPartie[]): StatPartie[] {
  return [...partien].sort((a, b) => zeitwert(a) - zeitwert(b));
}

// Dauer der eigenen Aufnahmen: Abstand zum vorherigen Eintrag derselben
// Partie (beim ersten Eintrag zum Spielbeginn). Fehlt ein Zeitpunkt, zaehlt
// die Aufnahme beim Tempo nicht mit.
function eigeneDauern(zeilen: StatAufnahme[], person: string, partie: StatPartie): number[] {
  const dauern: number[] = [];
  let vorher = spielbeginn(partie);
  let vorherNr = 0;
  for (const z of zeilen) {
    const jetzt = z.zeitpunkt ? Date.parse(z.zeitpunkt) : null;
    if (z.spieler === person && jetzt !== null && vorher !== null && z.lfd_nr === vorherNr + 1) {
      const sek = (jetzt - vorher) / 1000;
      if (sek >= 0 && sek < 3600) dauern.push(sek);
    }
    vorher = jetzt;
    vorherNr = z.lfd_nr;
  }
  return dauern;
}

export function statistik141(
  person: string,
  partien: StatPartie[],
  aufnahmen: StatAufnahme[],
  namen: (id: string) => string
): Statistik141 {
  const jePartieZeilen = new Map<string, StatAufnahme[]>();
  for (const a of aufnahmen) {
    const liste = jePartieZeilen.get(a.partie_id) ?? [];
    liste.push(a);
    jePartieZeilen.set(a.partie_id, liste);
  }
  jePartieZeilen.forEach((liste) => liste.sort((x, y) => x.lfd_nr - y.lfd_nr));

  const verteilung = SERIEN_KLASSEN.map(() => 0);
  let aufnahmenZahl = 0;
  let punkte = 0;
  let mitBaellen = 0;
  let baelleSumme = 0;
  let nullen = 0;
  let sicherheiten = 0;
  let verschossen = 0;
  let fouls = 0;
  let zweiteFouls = 0;
  let dreiFouls = 0;
  let eroeffnungsfouls = 0;
  let rackUebergaenge = 0;
  const dauern: number[] = [];
  const hs: Statistik141['hs'] = { wert: 0, partie: null, gegner: null };
  const bilanz = { siege: 0, niederlagen: 0, unentschieden: 0 };
  const jePartie: PartieWerte[] = [];

  for (const partie of sortiertNachZeit(partien)) {
    const alle = jePartieZeilen.get(partie.id) ?? [];
    const eigene = alle.filter((z) => z.spieler === person);
    const binA = partie.spieler_a === person;
    const gegnerId = binA ? partie.spieler_b : partie.spieler_a;
    const eigenePunkte = (binA ? partie.ergebnis_a : partie.ergebnis_b) ?? 0;
    const fremdePunkte = (binA ? partie.ergebnis_b : partie.ergebnis_a) ?? 0;

    let ausgang: Ausgang = 'abgebrochen';
    if (partie.status === 'beendet') {
      if (eigenePunkte > fremdePunkte) ausgang = 'sieg';
      else if (eigenePunkte < fremdePunkte) ausgang = 'niederlage';
      else ausgang = 'unentschieden';
    }
    if (ausgang === 'sieg') bilanz.siege += 1;
    if (ausgang === 'niederlage') bilanz.niederlagen += 1;
    if (ausgang === 'unentschieden') bilanz.unentschieden += 1;

    let pPunkte = 0;
    let pHs = 0;
    let pFouls = 0;
    for (const z of eigene) {
      aufnahmenZahl += 1;
      punkte += z.punkte;
      pPunkte += z.punkte;
      if (z.punkte > pHs) pHs = z.punkte;
      verteilung[serienKlasse(z.baelle)] += 1;
      if (z.baelle > 0) {
        mitBaellen += 1;
        baelleSumme += z.baelle;
      } else {
        nullen += 1;
      }
      if (z.art === 'sicherheit') sicherheiten += 1;
      if (z.art === 'serie') verschossen += 1;
      if (istFoul(z.art)) {
        fouls += 1;
        pFouls += 1;
      }
      if (z.markierung === '//') zweiteFouls += 1;
      if (z.art === 'foul3') dreiFouls += 1;
      if (z.art === 'eroeffnungsfoul') eroeffnungsfouls += 1;
      if (z.rack_segmente.length > 1) rackUebergaenge += 1;
    }
    if (pHs > hs.wert) {
      hs.wert = pHs;
      hs.partie = partie;
      hs.gegner = namen(gegnerId);
    }
    dauern.push(...eigeneDauern(alle, person, partie));

    jePartie.push({
      partie,
      gegner: namen(gegnerId),
      eigene: eigenePunkte,
      fremde: fremdePunkte,
      ausgang,
      aufnahmen: eigene.length,
      punkte: pPunkte,
      gd: anteil(pPunkte, eigene.length),
      hs: pHs,
      fouls: pFouls,
      foulquote: eigene.length > 0 ? (pFouls * 10) / eigene.length : null
    });
  }

  return {
    partien: partien.length,
    aufnahmen: aufnahmenZahl,
    punkte,
    gd: anteil(punkte, aufnahmenZahl),
    hs,
    durchschnittSerie: anteil(baelleSumme, mitBaellen),
    verteilung,
    nullQuote: anteil(nullen, aufnahmenZahl),
    sicherheitQuote: anteil(sicherheiten, aufnahmenZahl),
    verschossenQuote: anteil(verschossen, aufnahmenZahl),
    foulsJe10: aufnahmenZahl > 0 ? (fouls * 10) / aufnahmenZahl : null,
    zweiteFouls,
    dreiFouls,
    eroeffnungsfouls,
    rackUebergaenge,
    sekundenJeAufnahme: dauern.length > 0 ? dauern.reduce((s, d) => s + d, 0) / dauern.length : null,
    bilanz,
    jePartie
  };
}

// Gleitender Durchschnitt ueber die letzten n Werte; Luecken (null) zaehlen nicht.
export function gleitend(werte: (number | null)[], n: number): (number | null)[] {
  return werte.map((_, i) => {
    const fenster = werte.slice(Math.max(0, i - n + 1), i + 1).filter((w): w is number => w !== null);
    return fenster.length > 0 ? fenster.reduce((s, w) => s + w, 0) / fenster.length : null;
  });
}
