// Gruppen mit KO: Groesse des KO-Feldes, Setzliste, Turnierbaum, Phase 3 und
// Endtabelle. Uebertragen aus dem Turnierplan KO v74 (Turnier light), reine
// Rechnung ohne Datenbank, abgesichert durch test/ko.test.ts.
//
// Spieler sind hier beliebige Kennungen (in CueDesk Personen-IDs). Wo v74 bei
// voelliger Gleichheit nach der Startnummer ordnet, liefert die Seite diese
// Ordnung mit.

import { spielBeendet } from './turnier';
import type { Stand } from './turnier';

export const KO_GRUPPEN = ['A', 'B', 'C', 'D'];
export const KO_MIN = 8;
export const KO_MAX = 32;
const FELDGROESSEN = [4, 8, 16];

export type KoRunde = 'R16' | 'QF' | 'SF' | 'FIN' | 'BRO';
export const KO_RUNDEN_NAME: Record<KoRunde, string> = {
  R16: 'Achtelfinale',
  QF: 'Viertelfinale',
  SF: 'Halbfinale',
  FIN: 'Finale',
  BRO: 'Spiel um Platz 3'
};

// ---------- Einstellungen ----------

// Bis 15 Teilnehmer zwei Gruppen, ab 16 vier (v74 defaultGroupCount)
export function standardGruppenzahl(anzahl: number): number {
  return anzahl <= 15 ? 2 : 4;
}

// Bei zwei Gruppen kommen vier weiter, bei vier Gruppen zwei (v74 defaultQual)
export function standardWeiter(gruppenzahl: number): number {
  return gruppenzahl === 2 ? 4 : 2;
}

// Zulaessige Werte fuer "Weiter je Gruppe": KO-Feld mit 4, 8 oder 16 Spielern
// und in jeder Gruppe scheidet mindestens einer aus (v74 qualOptions)
export function weiterOptionen(anzahl: number, gruppenzahl: number): number[] {
  const kleinste = Math.floor(anzahl / gruppenzahl);
  return FELDGROESSEN.filter((feld) => feld % gruppenzahl === 0 && feld / gruppenzahl < kleinste).map(
    (feld) => feld / gruppenzahl
  );
}

// Passt der Wert nicht mehr, gilt die Vorbelegung, sonst der groesste (v74 fillQualSelect)
export function weiterPassend(anzahl: number, gruppenzahl: number, gewuenscht: number | undefined): number | null {
  const werte = weiterOptionen(anzahl, gruppenzahl);
  if (werte.length === 0) return null;
  if (gewuenscht !== undefined && werte.includes(gewuenscht)) return gewuenscht;
  const standard = standardWeiter(gruppenzahl);
  return werte.includes(standard) ? standard : werte[werte.length - 1];
}

// ---------- Turnierbaum ----------

export type KoSpiel = {
  id: string;
  runde: KoRunde;
  name: string;
  kurz: string;
  quelle?: { spiel: string; nimmt: 'w' | 'l' }[]; // leer: Erstrundenspiel aus der Setzliste
};

// Aufbau des Baums je nach Feldgroesse (v74 buildKoMatches)
export function koSpiele(feld: number): KoSpiel[] {
  const liste: KoSpiel[] = [];
  const sieger = (spiel: string) => ({ spiel, nimmt: 'w' as const });
  if (feld === 16) {
    for (let i = 1; i <= 8; i += 1) liste.push({ id: `af${i}`, runde: 'R16', name: `Achtelfinale ${i}`, kurz: `AF${i}` });
    for (let i = 1; i <= 4; i += 1) {
      liste.push({
        id: `qf${i}`,
        runde: 'QF',
        name: `Viertelfinale ${i}`,
        kurz: `VF${i}`,
        quelle: [sieger(`af${2 * i - 1}`), sieger(`af${2 * i}`)]
      });
    }
  } else if (feld === 8) {
    for (let i = 1; i <= 4; i += 1) liste.push({ id: `qf${i}`, runde: 'QF', name: `Viertelfinale ${i}`, kurz: `VF${i}` });
  }
  for (let i = 1; i <= 2; i += 1) {
    const hf: KoSpiel = { id: `sf${i}`, runde: 'SF', name: `Halbfinale ${i}`, kurz: `HF${i}` };
    if (feld >= 8) hf.quelle = [sieger(`qf${2 * i - 1}`), sieger(`qf${2 * i}`)];
    liste.push(hf);
  }
  liste.push({ id: 'fin', runde: 'FIN', name: 'Finale', kurz: 'Finale', quelle: [sieger('sf1'), sieger('sf2')] });
  liste.push({
    id: 'bro',
    runde: 'BRO',
    name: 'Spiel um Platz 3',
    kurz: 'Platz 3',
    quelle: [
      { spiel: 'sf1', nimmt: 'l' },
      { spiel: 'sf2', nimmt: 'l' }
    ]
  });
  return liste;
}

// Folgespiele eines Spiels (fuer die Sperre: steht dort ein Ergebnis, ist
// dieses Spiel nicht mehr aenderbar)
export function folgespiele(feld: number, id: string): string[] {
  return koSpiele(feld)
    .filter((s) => s.quelle?.some((q) => q.spiel === id))
    .map((s) => s.id);
}

// Bezeichnungen der Startplaetze, z.B. A1 ... B4 oder G1E ... G4Z (v74 seedSlotLabels)
export function startplatzNamen(gruppenzahl: number, weiter: number): string[] {
  const aus: string[] = [];
  if (gruppenzahl === 2) {
    ['A', 'B'].forEach((g) => {
      for (let p = 1; p <= weiter; p += 1) aus.push(`${g}${p}`);
    });
    return aus;
  }
  const kurz = ['E', 'Z', 'D', 'V'];
  for (let p = 0; p < weiter; p += 1) {
    for (let i = 1; i <= 4; i += 1) aus.push(`G${i}${kurz[p] ?? p + 1}`);
  }
  return aus;
}

// Erstrundenspiele nach Setzlistenrang: der Beste gegen den Schwaechsten (v74 bracketOrder)
function baumReihenfolge(feld: number): [number, number][] {
  if (feld === 4) return [[1, 4], [2, 3]];
  if (feld === 8) return [[1, 8], [4, 5], [2, 7], [3, 6]];
  return [[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]];
}

// Erstrundenpaarungen als Positionen der Setzliste (v74 qfSlotPairs und
// standardBracketPairs). Option 2 (ueber Kreuz) gibt es nur bei zwei Gruppen
// und einem Feld mit acht Spielern.
export function erstrundenPaare(gruppenzahl: number, option: number, weiter: number): [number, number][] {
  if (gruppenzahl * weiter === 8) {
    if (gruppenzahl === 2) {
      if (option === 2) return [[0, 7], [1, 6], [4, 3], [5, 2]];
      return [[0, 7], [5, 2], [4, 3], [1, 6]];
    }
    if (option === 2) return [[0, 7], [1, 6], [2, 5], [3, 4]];
    return [[0, 5], [1, 4], [2, 7], [3, 6]];
  }
  const rangZuPlatz = (r: number) => {
    const p = Math.floor((r - 1) / gruppenzahl);
    const i = (r - 1) % gruppenzahl;
    return gruppenzahl === 2 ? i * weiter + p : p * 4 + i;
  };
  return baumReihenfolge(gruppenzahl * weiter).map(([a, b]) => [rangZuPlatz(a), rangZuPlatz(b)]);
}

// Setzliste aus den Gruppentabellen: bei zwei Gruppen erst A, dann B; bei vier
// Gruppen erst alle Gruppenersten, dann alle Zweiten (v74 buildDefaultSeeds)
export function setzliste<T>(reihung: Record<string, T[]>, gruppenzahl: number, weiter: number): T[] {
  const gruppen = KO_GRUPPEN.slice(0, gruppenzahl);
  const aus: T[] = [];
  if (gruppenzahl === 2) {
    gruppen.forEach((g) => {
      for (let p = 0; p < weiter; p += 1) aus.push(reihung[g][p]);
    });
  } else {
    for (let p = 0; p < weiter; p += 1) gruppen.forEach((g) => aus.push(reihung[g][p]));
  }
  return aus;
}

export type KoFest<T> = {
  seeds: T[];
  option: number;
  gruppenzahl: number;
  weiter: number;
  reihung: Record<string, T[]>; // Gruppenreihenfolge beim Start der KO-Runde
};

export type KoStandSpiel<T> = {
  spiel: KoSpiel;
  p1: T | null;
  p2: T | null;
  l1: string; // Herkunft, z.B. "A1" oder "Sieger VF1"
  l2: string;
  s1: Stand;
  s2: Stand;
  race: number;
  bereit: boolean;
  fertig: boolean;
  sieger: T | null;
  verlierer: T | null;
};

// Baum aufloesen: wer spielt wo, wer ist weiter (v74 resolveKO). staende
// liefert je Spiel den Stand aus Sicht von p1 und p2.
export function koAufloesen<T>(
  ko: KoFest<T>,
  staende: (spiel: string, p1: T, p2: T) => { s1: Stand; s2: Stand },
  raceFuer: (runde: KoRunde) => number
): Record<string, KoStandSpiel<T>> {
  const paare = erstrundenPaare(ko.gruppenzahl, ko.option, ko.weiter);
  const namen = startplatzNamen(ko.gruppenzahl, ko.weiter);
  const res: Record<string, KoStandSpiel<T>> = {};
  let erste = 0;
  koSpiele(ko.gruppenzahl * ko.weiter).forEach((s) => {
    let p1: T | null = null;
    let p2: T | null = null;
    let l1 = '';
    let l2 = '';
    if (!s.quelle) {
      const [x, y] = paare[erste];
      erste += 1;
      p1 = ko.seeds[x] ?? null;
      p2 = ko.seeds[y] ?? null;
      l1 = namen[x];
      l2 = namen[y];
    } else {
      const [qa, qb] = s.quelle;
      const a = res[qa.spiel];
      const b = res[qb.spiel];
      p1 = qa.nimmt === 'w' ? a.sieger : a.verlierer;
      p2 = qb.nimmt === 'w' ? b.sieger : b.verlierer;
      l1 = `${qa.nimmt === 'w' ? 'Sieger' : 'Verlierer'} ${a.spiel.kurz}`;
      l2 = `${qb.nimmt === 'w' ? 'Sieger' : 'Verlierer'} ${b.spiel.kurz}`;
    }
    const race = raceFuer(s.runde);
    const bereit = p1 !== null && p2 !== null;
    const { s1, s2 } = bereit ? staende(s.id, p1 as T, p2 as T) : { s1: null, s2: null };
    const fertig = bereit && spielBeendet(s1, s2, race);
    res[s.id] = {
      spiel: s,
      p1: bereit ? p1 : null,
      p2: bereit ? p2 : null,
      l1,
      l2,
      s1,
      s2,
      race,
      bereit,
      fertig,
      sieger: fertig ? ((s1 as number) > (s2 as number) ? p1 : p2) : null,
      verlierer: fertig ? ((s1 as number) > (s2 as number) ? p2 : p1) : null
    };
  });
  return res;
}

// ---------- Gruppenleistung, Phase 3, Endtabelle ----------

export type Leistung = { gruppe: string; platz: number; punkte: number; diff: number; gewonnen: number };

const OHNE: Leistung = { gruppe: '', platz: 99, punkte: 0, diff: 0, gewonnen: 0 };

// Sortierung nach Gruppenplatz, Punkten, Satzdifferenz und gewonnenen Saetzen;
// KO-Ergebnisse zaehlen nicht (v74 sortByGroupPerformance)
export function nachGruppenleistung<T>(liste: T[], leistung: Map<T, Leistung>, ordnung: (x: T) => number): T[] {
  return [...liste].sort((a, b) => {
    const x = leistung.get(a) ?? OHNE;
    const y = leistung.get(b) ?? OHNE;
    return x.platz - y.platz || y.punkte - x.punkte || y.diff - x.diff || y.gewonnen - x.gewonnen || ordnung(a) - ordnung(b);
  });
}

function gleichGut<T>(a: T, b: T, leistung: Map<T, Leistung>): boolean {
  const x = leistung.get(a) ?? OHNE;
  const y = leistung.get(b) ?? OHNE;
  return x.platz === y.platz && x.punkte === y.punkte && x.diff === y.diff && x.gewonnen === y.gewonnen;
}

export type EndZeileKo<T> = { platz: number; wer: T | null; wie: string; offen: boolean; zeigePlatz: boolean };

// Dichte Plaetze: Gleichgute teilen sich einen Platz (v74 denseGroupRows)
function dichtePlaetze<T>(sortiert: T[], leistung: Map<T, Leistung>, start: number, wie: string): EndZeileKo<T>[] {
  let platz = start;
  return sortiert.map((wer, k) => {
    const neu = k === 0 || !gleichGut(sortiert[k - 1], wer, leistung);
    if (k > 0 && neu) platz += 1;
    return { platz, wer, wie, offen: false, zeigePlatz: neu };
  });
}

// Wer die KO-Runde nicht erreicht hat, in Gruppenreihenfolge (v74 nichtQualifizierte)
export function nichtQualifiziert<T>(gruppen: T[][], seeds: T[]): T[] {
  const imKo = new Set(seeds);
  return gruppen.flat().filter((x) => !imKo.has(x));
}

// Phase 3: Reihung nach Gruppenleistung, dann paarweise; bei ungerader Zahl
// bleibt der Letzte ohne Gegner (v74 startPhase3, phase3Paare, phase3Solo)
export function phase3Paare<T>(reihung: T[]): { paare: [T, T][]; solo: T | null } {
  const paare: [T, T][] = [];
  for (let i = 0; i + 1 < reihung.length; i += 2) paare.push([reihung[i], reihung[i + 1]]);
  return { paare, solo: reihung.length % 2 === 1 ? reihung[reihung.length - 1] : null };
}

// Endplatzierung: 1/2 aus dem Finale, 3/4 aus dem Spiel um Platz 3, danach die
// Verlierer der Runden von hinten nach vorn nach Gruppenleistung, zuletzt die
// Nichtqualifizierten, aus Phase 3 oder nach Gruppenleistung (v74 computeFinalTable)
export function endtabelleKo<T>(
  ko: KoFest<T>,
  baum: Record<string, KoStandSpiel<T>>,
  leistung: Map<T, Leistung>,
  gruppen: T[][],
  ordnung: (x: T) => number,
  phase3: { reihung: T[]; abPlatz: number; staende: { s1: Stand; s2: Stand }[]; race: number } | null
): EndZeileKo<T>[] {
  const zeilen: EndZeileKo<T>[] = [];
  const paar = (m: KoStandSpiel<T>, wieSieger: string, wieVerlierer: string, p1: number, p2: number) => {
    if (m.fertig) {
      zeilen.push({ platz: p1, wer: m.sieger, wie: wieSieger, offen: false, zeigePlatz: true });
      zeilen.push({ platz: p2, wer: m.verlierer, wie: wieVerlierer, offen: false, zeigePlatz: true });
    } else if (m.bereit) {
      zeilen.push({ platz: p1, wer: m.p1, wie: `${m.spiel.name} läuft`, offen: true, zeigePlatz: true });
      zeilen.push({ platz: p2, wer: m.p2, wie: `${m.spiel.name} läuft`, offen: true, zeigePlatz: true });
    } else {
      zeilen.push({ platz: p1, wer: null, wie: `${m.spiel.name} offen`, offen: true, zeigePlatz: true });
      zeilen.push({ platz: p2, wer: null, wie: `${m.spiel.name} offen`, offen: true, zeigePlatz: true });
    }
  };
  paar(baum.fin, 'Sieger Finale', 'Finale', 1, 2);
  paar(baum.bro, 'Sieger Spiel um Platz 3', 'Spiel um Platz 3', 3, 4);

  const feld = ko.gruppenzahl * ko.weiter;
  const runden: { ids: string[]; start: number; wie: string; offen: string }[] = [];
  if (feld >= 8) runden.push({ ids: ['qf1', 'qf2', 'qf3', 'qf4'], start: 5, wie: 'Viertelfinale (Gruppenwertung)', offen: 'Viertelfinale offen' });
  if (feld === 16) {
    runden.push({
      ids: ['af1', 'af2', 'af3', 'af4', 'af5', 'af6', 'af7', 'af8'],
      start: 9,
      wie: 'Achtelfinale (Gruppenwertung)',
      offen: 'Achtelfinale offen'
    });
  }
  runden.forEach((rd) => {
    const verlierer = rd.ids.map((id) => baum[id].verlierer).filter((x): x is T => x !== null);
    const offene = rd.ids.filter((id) => !baum[id].fertig).length;
    const dicht = dichtePlaetze(nachGruppenleistung(verlierer, leistung, ordnung), leistung, rd.start, rd.wie);
    zeilen.push(...dicht);
    const naechster = dicht.length ? dicht[dicht.length - 1].platz + 1 : rd.start;
    for (let k = 0; k < offene; k += 1) zeilen.push({ platz: naechster + k, wer: null, wie: rd.offen, offen: true, zeigePlatz: true });
  });

  if (phase3) {
    const { paare, solo } = phase3Paare(phase3.reihung);
    paare.forEach(([a, b], i) => {
      const { s1, s2 } = phase3.staende[i] ?? { s1: null, s2: null };
      const platz = phase3.abPlatz + 2 * i;
      if (spielBeendet(s1, s2, phase3.race)) {
        const aGewinnt = (s1 as number) > (s2 as number);
        zeilen.push({ platz, wer: aGewinnt ? a : b, wie: 'Sieger Phase 3', offen: false, zeigePlatz: true });
        zeilen.push({ platz: platz + 1, wer: aGewinnt ? b : a, wie: 'Phase 3', offen: false, zeigePlatz: true });
      } else {
        zeilen.push({ platz, wer: a, wie: 'Phase 3 läuft', offen: true, zeigePlatz: true });
        zeilen.push({ platz: platz + 1, wer: b, wie: 'Phase 3 läuft', offen: true, zeigePlatz: true });
      }
    });
    if (solo !== null) {
      zeilen.push({
        platz: phase3.abPlatz + phase3.reihung.length - 1,
        wer: solo,
        wie: 'Phase 3, kein Gegner',
        offen: false,
        zeigePlatz: true
      });
    }
  } else {
    const rest = nichtQualifiziert(gruppen, ko.seeds);
    zeilen.push(...dichtePlaetze(nachGruppenleistung(rest, leistung, ordnung), leistung, feld + 1, 'Gruppenphase'));
  }
  return zeilen;
}
