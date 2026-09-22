// Geschaetztes Turnierende, uebernommen aus dem Turnierplan v57.
//
// Gemessen wird das Tempo in Saetzen je Minute seit dem ersten Ergebnis.
// Zusammen mit den noch erwarteten Saetzen ergibt sich die Restdauer. Die Zahl
// der Tische steckt bereits im gemessenen Tempo. Pausen verschieben die
// Schaetzung nach hinten, das laesst sich nicht herausrechnen.

export const SAETZE_JE_RACE = 1.6; // ein Race to R dauert im Mittel etwa 1,6 x R Saetze
export const PROGNOSE_MIN_SAETZE = 8; // darunter ist die Datenbasis zu duenn
export const PROGNOSE_MIN_MINUTEN = 10;

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
  | { art: 'keine' } // noch kein Ergebnis
  | { art: 'zu-frueh'; beginn: number } // noch keine Schaetzung moeglich
  | { art: 'schaetzung'; beginn: number; ende: number }
  | { art: 'beendet'; beginn: number; ende: number };

// beginn: erstes Ergebnis (ms), ende: letztes Spiel beendet (ms) oder null
export function prognose(
  partien: PrognosePartie[],
  beginn: number | null,
  ende: number | null,
  jetzt = Date.now()
): Prognose {
  if (beginn === null) return { art: 'keine' };
  if (partien.length > 0 && partien.every(beendet) && ende !== null) return { art: 'beendet', beginn, ende };
  const minuten = (jetzt - beginn) / 60000;
  const gespielt = saetzeGespielt(partien);
  const tempo = minuten > 0 ? gespielt / minuten : 0;
  if (minuten < PROGNOSE_MIN_MINUTEN || gespielt < PROGNOSE_MIN_SAETZE || tempo <= 0) return { art: 'zu-frueh', beginn };
  return { art: 'schaetzung', beginn, ende: jetzt + (saetzeRest(partien) / tempo) * 60000 };
}

const uhrzeit = (ms: number) =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function dauerHM(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
}

export function prognoseText(p: Prognose, jetzt = Date.now()): string {
  if (p.art === 'keine') return '';
  if (p.art === 'beendet')
    return `Turnier beendet: ${uhrzeit(p.ende)} Uhr · Dauer ${dauerHM(p.ende - p.beginn)} (Beginn ${uhrzeit(p.beginn)} Uhr)`;
  if (p.art === 'zu-frueh') return `Turnierende: noch keine Schätzung · Beginn ${uhrzeit(p.beginn)} Uhr`;
  const folgetag = new Date(p.ende).toDateString() !== new Date(jetzt).toDateString();
  return `ca. Turnierende: ${uhrzeit(p.ende)} Uhr${folgetag ? ' (am Folgetag)' : ''} · Beginn ${uhrzeit(p.beginn)} Uhr`;
}
