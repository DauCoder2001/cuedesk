import { spieldauer } from './saison-ueberblick';

// Geschaetztes Turnierende, uebernommen aus dem Turnierplan v57.
//
// Gemessen wird das Tempo in Saetzen je Minute seit dem ersten Ergebnis.
// Zusammen mit den noch erwarteten Saetzen ergibt sich die Restdauer. Die Zahl
// der Tische steckt bereits im gemessenen Tempo. Pausen verschieben die
// Schaetzung nach hinten, das laesst sich nicht herausrechnen.
//
// Bis genug gemessen ist, gilt der Vereinswert "Minuten je Partie bei Race to 3"
// (Seite System) zusammen mit der Zahl der Tische. Sein Anteil sinkt mit jedem
// gespielten Satz und jeder Minute; voll zaehlt das gemessene Tempo erst ab
// PROGNOSE_VOLL_SAETZE und PROGNOSE_VOLL_MINUTEN. Schnell nachgetragene
// Ergebnisse koennen die Schaetzung so nicht ausreissen lassen.

export const SAETZE_JE_RACE = 1.6; // ein Race to R dauert im Mittel etwa 1,6 x R Saetze
export const PROGNOSE_MIN_SAETZE = 8; // darunter ist die Datenbasis zu duenn
export const PROGNOSE_MIN_MINUTEN = 10;
export const STANDARD_MINUTEN_JE_PARTIE = 35;
export const PROGNOSE_RACE_BASIS = 3; // darauf bezieht sich der Vereinswert
export const PROGNOSE_VOLL_SAETZE = 24;
export const PROGNOSE_VOLL_MINUTEN = 60;
const MESSUNG_MIN_PARTIEN = 10; // darunter wird kein gemessener Wert angeboten

export type Vereinstempo = { minutenJePartie: number; tische: number };

// Saetze je Minute, die der Vereinswert auf allen Tischen zusammen ergibt
const vereinsSaetzeJeMinute = (v: Vereinstempo) =>
  v.tische / (v.minutenJePartie / (SAETZE_JE_RACE * PROGNOSE_RACE_BASIS));

// Mehr Tische, als Paare spielen koennen, helfen nicht
export function wirksameTische(tische: number, spieler: number): number {
  return Math.max(0, Math.min(tische, Math.floor(spieler / 2)));
}

// Noch nicht angesetzte Partien, nur mit ihrem Race
export function kommendePartien(races: number[]): PrognosePartie[] {
  return races.map((raceTo) => ({ standA: null, standB: null, vorgabeA: 0, vorgabeB: 0, raceTo }));
}

export type PrognosePartie = {
  standA: number | null;
  standB: number | null;
  vorgabeA: number;
  vorgabeB: number;
  raceTo: number;
};

const beendet = (p: PrognosePartie) =>
  p.standA !== null && p.standB !== null && p.standA !== p.standB && Math.max(p.standA, p.standB) >= p.raceTo;

// Selbst gespielte Saetze (ohne Vorgabe)
export function saetzeGespielt(partien: PrognosePartie[]): number {
  return partien.reduce(
    (n, p) => n + Math.max(0, (p.standA ?? 0) - p.vorgabeA) + Math.max(0, (p.standB ?? 0) - p.vorgabeB),
    0
  );
}

// Noch zu erwartende Saetze bis zum letzten Spiel
export function saetzeRest(partien: PrognosePartie[]): number {
  return partien.reduce((n, p) => {
    if (beendet(p)) return n;
    const erwartet = Math.max(0, SAETZE_JE_RACE * p.raceTo - (p.vorgabeA + p.vorgabeB));
    const gespielt = Math.max(0, (p.standA ?? 0) - p.vorgabeA) + Math.max(0, (p.standB ?? 0) - p.vorgabeB);
    return n + Math.max(0, erwartet - gespielt);
  }, 0);
}

export type Prognose =
  | { art: 'keine' } // noch kein Ergebnis und kein Vereinswert
  | { art: 'vor-start'; dauer: number; partien: number; verein: Vereinstempo } // nur aus dem Vereinswert
  | { art: 'zu-frueh'; beginn: number } // noch keine Schaetzung moeglich
  | { art: 'schaetzung'; beginn: number; ende: number; verein?: Vereinstempo; nachVerein?: boolean }
  | { art: 'beendet'; beginn: number; ende: number };

// beginn: erstes Ergebnis (ms), ende: letztes Spiel beendet (ms) oder null.
// verein: null, wenn es keine Tische gibt; dann zaehlt nur das gemessene Tempo.
export function prognose(
  partien: PrognosePartie[],
  beginn: number | null,
  ende: number | null,
  verein: Vereinstempo | null = null,
  jetzt = Date.now()
): Prognose {
  if (beginn === null) {
    if (!verein || partien.length === 0) return { art: 'keine' };
    return {
      art: 'vor-start',
      dauer: (saetzeRest(partien) / vereinsSaetzeJeMinute(verein)) * 60000,
      partien: partien.length,
      verein
    };
  }
  if (partien.length > 0 && partien.every(beendet) && ende !== null) return { art: 'beendet', beginn, ende };
  const minuten = (jetzt - beginn) / 60000;
  const gespielt = saetzeGespielt(partien);
  const tempo = minuten > 0 ? gespielt / minuten : 0;
  if (!verein) {
    if (minuten < PROGNOSE_MIN_MINUTEN || gespielt < PROGNOSE_MIN_SAETZE || tempo <= 0) return { art: 'zu-frueh', beginn };
    return { art: 'schaetzung', beginn, ende: jetzt + (saetzeRest(partien) / tempo) * 60000 };
  }
  const anteil = Math.max(0, Math.min(1, gespielt / PROGNOSE_VOLL_SAETZE, minuten / PROGNOSE_VOLL_MINUTEN));
  const gemischt = anteil * tempo + (1 - anteil) * vereinsSaetzeJeMinute(verein);
  return { art: 'schaetzung', beginn, ende: jetzt + (saetzeRest(partien) / gemischt) * 60000, verein, nachVerein: anteil < 0.5 };
}

// Vorschlag fuer den Vereinswert aus den am Tablet gemessenen Partien: Minuten
// je gespieltem Satz, umgerechnet auf eine Partie bei Race to 3. Das ist reine
// Spielzeit, Wechsel zwischen den Partien sind nicht enthalten.
export type GemessenePartie = {
  begonnen: string | null;
  beendet: string | null;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
};

export function gemesseneMinutenJePartie(partien: GemessenePartie[]): number | null {
  let anzahl = 0;
  let minuten = 0;
  let saetze = 0;
  for (const p of partien) {
    const dauer = spieldauer(p);
    const gespielt = Math.max(0, (p.ergebnis_a ?? 0) - p.vorgabe_a) + Math.max(0, (p.ergebnis_b ?? 0) - p.vorgabe_b);
    if (dauer === null || gespielt === 0) continue;
    anzahl += 1;
    minuten += dauer;
    saetze += gespielt;
  }
  if (anzahl < MESSUNG_MIN_PARTIEN) return null;
  return Math.round((minuten / saetze) * SAETZE_JE_RACE * PROGNOSE_RACE_BASIS);
}

const uhrzeit = (ms: number) =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function dauerHM(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
}

export function prognoseText(p: Prognose, jetzt = Date.now()): string {
  if (p.art === 'keine') return '';
  if (p.art === 'vor-start') return `Geschätzte Dauer: ca. ${dauerHM(p.dauer)}`;
  if (p.art === 'beendet')
    return `Turnier beendet: ${uhrzeit(p.ende)} Uhr · Dauer ${dauerHM(p.ende - p.beginn)} (Beginn ${uhrzeit(p.beginn)} Uhr)`;
  if (p.art === 'zu-frueh') return `Turnierende: noch keine Schätzung · Beginn ${uhrzeit(p.beginn)} Uhr`;
  const folgetag = new Date(p.ende).toDateString() !== new Date(jetzt).toDateString();
  return `ca. Turnierende: ${uhrzeit(p.ende)} Uhr${folgetag ? ' (am Folgetag)' : ''} · Beginn ${uhrzeit(p.beginn)} Uhr`;
}

// Zweite Zeile unter der Schaetzung: worauf sie beruht
export function prognoseZusatz(p: Prognose): string {
  const wert = (v: Vereinstempo) => `${v.minutenJePartie} Min. je Partie bei Race to ${PROGNOSE_RACE_BASIS}`;
  if (p.art === 'vor-start') return `${p.partien} Partien, ${p.verein.tische} ${p.verein.tische === 1 ? 'Tisch' : 'Tische'}, ${wert(p.verein)}`;
  if (p.art === 'schaetzung' && p.verein) return p.nachVerein ? `Noch nach Vereinswert (${wert(p.verein)})` : 'Aus dem bisherigen Tempo';
  return '';
}
