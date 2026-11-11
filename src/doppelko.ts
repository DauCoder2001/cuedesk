// Doppel-KO nach BLVN-STO Pool 3.3: Wer verliert, rutscht von der
// Gewinnerrunde in die Verliererrunde; erst die zweite Niederlage scheidet
// aus. Bleiben in beiden Runden zusammen 4 (bis 23 Spieler) bzw. 8 (ab 24)
// uebrig, geht es im einfachen KO weiter, Platz 3 wird immer ausgespielt.
// Reine Rechnung ohne Datenbank, abgesichert durch test/doppelko.test.ts.
//
// Spieler sind beliebige Kennungen (in CueDesk Personen-IDs). Der Baum hat
// 8, 16, 32 oder 64 Startplaetze; was fehlt, sind Freilose. Sie liegen bei den
// besten Setzplaetzen, deshalb trifft in der ersten Runde nie Freilos auf
// Freilos.

import { spielBeendet } from './turnier';
import type { Stand } from './turnier';

export const DKO_MIN = 8;
export const DKO_MAX = 64;

// Abschnitt fuer Race und Anzeige: Gewinnerrunde, Verliererrunde,
// Viertelfinale, Halbfinale (mit Platz 3), Finale
export type DkoArt = 'G' | 'V' | 'VF' | 'HF' | 'FIN';
export const DKO_ART_NAME: Record<DkoArt, string> = {
  G: 'Gewinnerrunde',
  V: 'Verliererrunde',
  VF: 'Viertelfinale',
  HF: 'Halbfinale / Platz 3',
  FIN: 'Finale'
};

export type DkoQuelle = { start: number } | { spiel: string; nimmt: 'w' | 'l' };

export type DkoSpiel = {
  id: string; // g1-1, v2-3, vf1, hf1, fin, p3
  art: DkoArt;
  runde: number; // Runde innerhalb von Gewinner- bzw. Verliererrunde, sonst 1
  nr: number; // Spiel innerhalb der Runde
  name: string; // "Gewinnerrunde 1 · Spiel 2"
  kurz: string; // "G1-2"
  quelle: [DkoQuelle, DkoQuelle];
};

// Startplaetze des Baums: kleinste Zweierpotenz ab der Teilnehmerzahl, mindestens 8
export function dkoGroesse(anzahl: number): number {
  let n = 8;
  while (n < anzahl) n *= 2;
  return n;
}

// Wie viele ins einfache KO kommen (STO 3.3: ab 24 Teilnehmern die letzten 8)
export function dkoEndrunde(anzahl: number): 4 | 8 {
  return anzahl >= 24 ? 8 : 4;
}

// Setzplaetze in Baumreihenfolge: 1 gegen 8, 4 gegen 5, 2 gegen 7, 3 gegen 6 ...
// (Beste weit auseinander, der Beste gegen den Schwaechsten). Zurueck kommt je
// Startplatz der Setzrang ab 1.
export function setzReihenfolge(groesse: number): number[] {
  let liste = [1, 2];
  while (liste.length < groesse) {
    const n = liste.length * 2;
    liste = liste.flatMap((s) => [s, n + 1 - s]);
  }
  return liste;
}

const zahl = (x: number) => Math.round(Math.log2(x));

// Der ganze Baum fuer eine Teilnehmerzahl
export function dkoSpiele(anzahl: number): DkoSpiel[] {
  const groesse = dkoGroesse(anzahl);
  const ende = dkoEndrunde(anzahl);
  const halb = ende / 2; // so viele bleiben in Gewinner- und Verliererrunde uebrig
  const gRunden = zahl(groesse) - zahl(halb);
  const liste: DkoSpiel[] = [];
  const sieger = (spiel: string): DkoQuelle => ({ spiel, nimmt: 'w' });
  const verlierer = (spiel: string): DkoQuelle => ({ spiel, nimmt: 'l' });
  const neu = (id: string, art: DkoArt, runde: number, nr: number, name: string, kurz: string, quelle: [DkoQuelle, DkoQuelle]) =>
    liste.push({ id, art, runde, nr, name, kurz, quelle });

  // Gewinnerrunde: Runde 1 aus den Startplaetzen, dann Sieger gegen Sieger
  const g = (r: number, i: number) => `g${r}-${i}`;
  for (let r = 1; r <= gRunden; r += 1) {
    const spiele = groesse / 2 ** r;
    for (let i = 1; i <= spiele; i += 1) {
      const quelle: [DkoQuelle, DkoQuelle] =
        r === 1 ? [{ start: 2 * i - 2 }, { start: 2 * i - 1 }] : [sieger(g(r - 1, 2 * i - 1)), sieger(g(r - 1, 2 * i))];
      neu(g(r, i), 'G', r, i, `Gewinnerrunde ${r} · Spiel ${i}`, `G${r}-${i}`, quelle);
    }
  }

  // Verliererrunde: Runde 1 paart die Verlierer der Gewinnerrunde 1. Danach
  // abwechselnd: Einstieg (Uebrige gegen die Verlierer der naechsten
  // Gewinnerrunde, ueber Kreuz, damit sich niemand gleich wiedersieht) und,
  // ausser zuletzt, eine Runde unter sich.
  const v = (r: number, i: number) => `v${r}-${i}`;
  let vr = 1;
  let uebrig: string[] = [];
  for (let i = 1; i <= groesse / 4; i += 1) {
    neu(v(1, i), 'V', 1, i, `Verliererrunde 1 · Spiel ${i}`, `V1-${i}`, [verlierer(g(1, 2 * i - 1)), verlierer(g(1, 2 * i))]);
    uebrig.push(v(1, i));
  }
  for (let k = 2; k <= gRunden; k += 1) {
    vr += 1;
    const spiele = groesse / 2 ** k;
    const einstieg: string[] = [];
    for (let i = 1; i <= spiele; i += 1) {
      neu(v(vr, i), 'V', vr, i, `Verliererrunde ${vr} · Spiel ${i}`, `V${vr}-${i}`, [
        sieger(uebrig[i - 1]),
        verlierer(g(k, spiele + 1 - i))
      ]);
      einstieg.push(v(vr, i));
    }
    uebrig = einstieg;
    if (k < gRunden) {
      vr += 1;
      const unter: string[] = [];
      for (let i = 1; i <= spiele / 2; i += 1) {
        neu(v(vr, i), 'V', vr, i, `Verliererrunde ${vr} · Spiel ${i}`, `V${vr}-${i}`, [sieger(uebrig[2 * i - 2]), sieger(uebrig[2 * i - 1])]);
        unter.push(v(vr, i));
      }
      uebrig = unter;
    }
  }

  // Einfaches KO: Sieger der letzten Gewinnerrunde i gegen Uebrigen i der
  // Verliererrunde (der hat gegen einen anderen verloren)
  const gLetzte = Array.from({ length: halb }, (_, i) => g(gRunden, i + 1));
  if (ende === 8) {
    for (let i = 1; i <= 4; i += 1) neu(`vf${i}`, 'VF', 1, i, `Viertelfinale ${i}`, `VF${i}`, [sieger(gLetzte[i - 1]), sieger(uebrig[i - 1])]);
    neu('hf1', 'HF', 1, 1, 'Halbfinale 1', 'HF1', [sieger('vf1'), sieger('vf2')]);
    neu('hf2', 'HF', 1, 2, 'Halbfinale 2', 'HF2', [sieger('vf3'), sieger('vf4')]);
  } else {
    neu('hf1', 'HF', 1, 1, 'Halbfinale 1', 'HF1', [sieger(gLetzte[0]), sieger(uebrig[0])]);
    neu('hf2', 'HF', 1, 2, 'Halbfinale 2', 'HF2', [sieger(gLetzte[1]), sieger(uebrig[1])]);
  }
  neu('fin', 'FIN', 1, 1, 'Finale', 'Finale', [sieger('hf1'), sieger('hf2')]);
  neu('p3', 'HF', 1, 3, 'Spiel um Platz 3', 'Platz 3', [verlierer('hf1'), verlierer('hf2')]);
  return liste;
}

// ---------- Auslosung ----------

// Setzliste: Gesetzte in ihrer Reihenfolge, dann die uebrigen in der
// gelosten Reihenfolge. zufall liefert Zahlen in [0, 1).
export function dkoAuslosen<T>(teilnehmer: T[], gesetzt: T[], zufall: () => number = Math.random): T[] {
  const fest = gesetzt.filter((x) => teilnehmer.includes(x));
  const rest = teilnehmer.filter((x) => !fest.includes(x));
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(zufall() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...fest, ...rest];
}

// Startplaetze aus der Setzliste: je Platz der Spieler, null fuer ein Freilos
export function dkoStartplaetze<T>(setzliste: T[]): (T | null)[] {
  return setzReihenfolge(dkoGroesse(setzliste.length)).map((rang) => setzliste[rang - 1] ?? null);
}

// ---------- Aufloesung ----------

// Eine Seite eines Spiels: Spieler, Freilos (es kommt niemand) oder noch offen
export type DkoSeite<T> = { wer: T | null; frei: boolean };
const offen = <T>(): DkoSeite<T> => ({ wer: null, frei: false });
const frei = <T>(): DkoSeite<T> => ({ wer: null, frei: true });

export type DkoStandSpiel<T> = {
  spiel: DkoSpiel;
  a: DkoSeite<T>;
  b: DkoSeite<T>;
  l1: string; // Herkunft, z.B. "Startplatz 3", "Sieger G1-2", "Verlierer G2-1"
  l2: string;
  s1: Stand;
  s2: Stand;
  race: number;
  bereit: boolean; // beide Spieler stehen fest: wird gespielt
  freilos: boolean; // nur einer: kommt kampflos weiter
  entfaellt: boolean; // keiner
  fertig: boolean;
  sieger: DkoSeite<T>;
  verlierer: DkoSeite<T>;
};

// Baum aufloesen: wer spielt wo, wer ist weiter. staende liefert je Spiel den
// Stand aus Sicht der beiden Spieler und das Race der angelegten Partie.
export function dkoAufloesen<T>(
  anzahl: number,
  startplaetze: (T | null)[],
  staende: (spiel: string, a: T, b: T) => { s1: Stand; s2: Stand; race?: number | null },
  raceFuer: (art: DkoArt) => number
): Record<string, DkoStandSpiel<T>> {
  const res: Record<string, DkoStandSpiel<T>> = {};
  dkoSpiele(anzahl).forEach((s) => {
    const seite = (q: DkoQuelle): [DkoSeite<T>, string] => {
      if ('start' in q) {
        const wer = startplaetze[q.start] ?? null;
        return [wer === null ? frei<T>() : { wer, frei: false }, wer === null ? 'Freilos' : `Startplatz ${q.start + 1}`];
      }
      const m = res[q.spiel];
      return [q.nimmt === 'w' ? m.sieger : m.verlierer, `${q.nimmt === 'w' ? 'Sieger' : 'Verlierer'} ${m.spiel.kurz}`];
    };
    const [a, l1] = seite(s.quelle[0]);
    const [b, l2] = seite(s.quelle[1]);
    const bereit = a.wer !== null && b.wer !== null;
    const freilos = (a.wer !== null && b.frei) || (b.wer !== null && a.frei);
    const entfaellt = a.frei && b.frei;
    const stand = bereit ? staende(s.id, a.wer as T, b.wer as T) : { s1: null, s2: null, race: null };
    const race = stand.race ?? raceFuer(s.art);
    const gespielt = bereit && spielBeendet(stand.s1, stand.s2, race);
    const aGewinnt = gespielt && (stand.s1 as number) > (stand.s2 as number);
    res[s.id] = {
      spiel: s,
      a,
      b,
      l1,
      l2,
      s1: bereit ? stand.s1 : null,
      s2: bereit ? stand.s2 : null,
      race,
      bereit,
      freilos,
      entfaellt,
      fertig: gespielt || freilos || entfaellt,
      sieger: gespielt ? (aGewinnt ? a : b) : freilos ? (a.wer !== null ? a : b) : entfaellt ? frei<T>() : offen<T>(),
      verlierer: gespielt ? (aGewinnt ? b : a) : freilos || entfaellt ? frei<T>() : offen<T>()
    };
  });
  return res;
}

// ---------- Endtabelle ----------

export type DkoBilanz = { gewonnen: number; verloren: number }; // Saetze ueber das ganze Turnier
export type DkoEndZeile<T> = { platz: number; wer: T | null; wie: string; offen: boolean; zeigePlatz: boolean; quotient: number | null };

// Quotient gewonnene / verlorene Saetze mit 2 Nachkommastellen (STO 3.4);
// ohne verlorenen Satz zaehlt er als unendlich
export function quotient(b: DkoBilanz): number {
  if (b.verloren === 0) return b.gewonnen > 0 ? Number.POSITIVE_INFINITY : 0;
  return Math.round((b.gewonnen / b.verloren) * 100) / 100;
}

// Endplaetze: 1/2 aus dem Finale, 3/4 aus dem Spiel um Platz 3, dann die
// Verlierer des Viertelfinales (5-8) und der Verliererrunden von hinten nach
// vorn. Wer in derselben Runde ausscheidet, teilt sich den Platzbereich;
// innerhalb zaehlen Quotient, dann gewonnene Saetze (STO 3.4). Sind beide
// gleich, teilen sie sich den Platz (Stichkampf); ordnung haelt dann die
// Reihenfolge fest (Setzliste).
export function dkoEndtabelle<T>(
  baum: Record<string, DkoStandSpiel<T>>,
  bilanz: (wer: T) => DkoBilanz,
  ordnung: (wer: T) => number
): DkoEndZeile<T>[] {
  const zeilen: DkoEndZeile<T>[] = [];
  const paar = (m: DkoStandSpiel<T>, wieSieger: string, wieVerlierer: string, p1: number) => {
    if (m.fertig && m.bereit) {
      zeilen.push({ platz: p1, wer: m.sieger.wer, wie: wieSieger, offen: false, zeigePlatz: true, quotient: null });
      zeilen.push({ platz: p1 + 1, wer: m.verlierer.wer, wie: wieVerlierer, offen: false, zeigePlatz: true, quotient: null });
    } else {
      const wie = m.bereit ? `${m.spiel.name} läuft` : `${m.spiel.name} offen`;
      zeilen.push({ platz: p1, wer: m.a.wer, wie, offen: true, zeigePlatz: true, quotient: null });
      zeilen.push({ platz: p1 + 1, wer: m.b.wer, wie, offen: true, zeigePlatz: true, quotient: null });
    }
  };
  paar(baum.fin, 'Finale gewonnen', 'Finale verloren', 1);
  paar(baum.p3, 'Spiel um Platz 3 gewonnen', 'Spiel um Platz 3 verloren', 3);

  // Ausscheiderunden von hinten: Viertelfinale, dann Verliererrunden absteigend
  const spiele = Object.values(baum).map((m) => m.spiel);
  const vRunden = [...new Set(spiele.filter((s) => s.art === 'V').map((s) => s.runde))].sort((x, y) => y - x);
  const runden: { ids: string[]; wie: string }[] = [];
  if (baum.vf1) runden.push({ ids: ['vf1', 'vf2', 'vf3', 'vf4'], wie: 'Viertelfinale verloren' });
  vRunden.forEach((r) => runden.push({ ids: spiele.filter((s) => s.art === 'V' && s.runde === r).map((s) => s.id), wie: `Verliererrunde ${r} verloren` }));

  let platz = 5;
  runden.forEach((rd) => {
    const raus = rd.ids
      .map((id) => baum[id])
      .filter((m) => m.bereit && m.fertig && m.verlierer.wer !== null)
      .map((m) => m.verlierer.wer as T);
    const offenAnzahl = rd.ids.filter((id) => !baum[id].fertig).length;
    const schluessel = (x: T) => {
      const b = bilanz(x);
      return { q: quotient(b), g: b.gewonnen };
    };
    raus.sort((x, y) => {
      const a = schluessel(x);
      const b = schluessel(y);
      return b.q - a.q || b.g - a.g || ordnung(x) - ordnung(y);
    });
    const start = platz;
    raus.forEach((wer, k) => {
      const s = schluessel(wer);
      const vorher = k > 0 ? schluessel(raus[k - 1]) : null;
      const gleich = vorher !== null && vorher.q === s.q && vorher.g === s.g;
      const p = gleich ? zeilen[zeilen.length - 1].platz : start + k;
      zeilen.push({ platz: p, wer, wie: rd.wie, offen: false, zeigePlatz: !gleich, quotient: s.q });
    });
    for (let k = 0; k < offenAnzahl; k += 1) {
      zeilen.push({ platz: start + raus.length + k, wer: null, wie: `${rd.wie.replace('raus ', '')} offen`, offen: true, zeigePlatz: true, quotient: null });
    }
    platz = start + raus.length + offenAnzahl;
  });
  return zeilen;
}

// ---------- Spielplan ----------

// Abschnitt im Spielplan und Reihenfolge (stufe, auch partien.runde): erst
// Gewinnerrunde 1, dann Verliererrunde 1 und Gewinnerrunde 2 usw., zuletzt die
// Endrunde. Gleiche Namen wie am Tablet (scoreboards/js/turnier-plan.ts).
export function dkoAbschnitt(id: string): { titel: string; stufe: number } {
  const g = /^g(\d+)-\d+$/.exec(id);
  if (g) return { titel: `Gewinnerrunde ${g[1]}`, stufe: 2 * Number(g[1]) - 2 };
  const v = /^v(\d+)-\d+$/.exec(id);
  if (v) return { titel: `Verliererrunde ${v[1]}`, stufe: Number(v[1]) === 1 ? 1 : Number(v[1]) + 1 };
  if (id.startsWith('vf')) return { titel: 'Viertelfinale', stufe: 90 };
  if (id.startsWith('hf')) return { titel: 'Halbfinale', stufe: 91 };
  return { titel: 'Finale und Platz 3', stufe: 92 };
}

// Name eines Spiels: "Gewinnerrunde 1 · Spiel 2", "Halbfinale 1", "Finale"
export function dkoSpielName(id: string): string {
  const x = /^([gv])(\d+)-(\d+)$/.exec(id);
  if (x) return `${x[1] === 'g' ? 'Gewinnerrunde' : 'Verliererrunde'} ${x[2]} · Spiel ${x[3]}`;
  if (id.startsWith('vf')) return `Viertelfinale ${id.slice(2)}`;
  if (id.startsWith('hf')) return `Halbfinale ${id.slice(2)}`;
  return id === 'fin' ? 'Finale' : 'Spiel um Platz 3';
}

// Wie viele Spiele wirklich gespielt werden (ohne Freilose). Die Zahl haengt
// nur vom Aufbau ab, nicht von den Ergebnissen.
export function dkoSpielzahl(anzahl: number): number {
  return dkoSpielArten(anzahl).length;
}

// Dieselben Spiele mit ihrer Art, fuer das Race je Abschnitt
export function dkoSpielArten(anzahl: number): DkoArt[] {
  const plaetze = dkoStartplaetze(Array.from({ length: anzahl }, (_, i) => i));
  const stand = new Map<string, true>();
  for (let i = 0; i < 1000; i += 1) {
    const baum = dkoAufloesen(anzahl, plaetze, (id) => (stand.has(id) ? { s1: 1, s2: 0 } : { s1: null, s2: null }), () => 1);
    const offen = Object.values(baum).filter((m) => m.bereit && !m.fertig);
    if (offen.length === 0) return Object.values(baum).filter((m) => m.bereit).map((m) => m.spiel.art);
    offen.forEach((m) => stand.set(m.spiel.id, true));
  }
  return [];
}
