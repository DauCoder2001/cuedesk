// Turnier-Datei: ein oder mehrere beendete Turniere als JSON, damit sie
// zwischen CueDesk und TurnierPilot wandern koennen (docs/Turnier-Datei.md).
// Spieler stehen nur mit ihren Namen darin; beim Einlesen werden sie
// zugeordnet. Reine Rechenarbeit ohne Datenbank (test/turnier-datei.test.ts).

import type { Disziplin, TurnierModus } from './datenbank.types';
import { rundeText } from './archiv';

export const DATEI_FORMAT = 'billard-turnierdatei';
export const DATEI_VERSION = 1;

export type DateiPartie = {
  a: string;
  b: string;
  satzA: number;
  satzB: number;
  vorgabeA?: number;
  vorgabeB?: number;
  raceTo?: number | null;
  phase?: string;
  werten?: boolean;
  grund?: string | null;
};

export type DateiTurnier = {
  // Herkunft des Turniers: "cuedesk:<id>" oder "turnierpilot:<id>". Bleibt beim
  // Weiterreichen erhalten, so wird ein Turnier auch nach Hin und Zurueck erkannt.
  kennung: string;
  name: string;
  datum: string;
  disziplin: string;
  modus: string;
  teilnehmer: string[];
  ranking: { platz: number; name: string }[];
  partien: DateiPartie[];
};

export type TurnierDatei = {
  format: typeof DATEI_FORMAT;
  formatVersion: number;
  programm: string;
  erstellt: string;
  turniere: DateiTurnier[];
};

// Modi, die beide Programme kennen
export const DATEI_MODI: TurnierModus[] = ['einzelgruppe', 'zwei-gruppen', 'gruppen-ko'];

const DISZIPLIN_ALS_TEXT: Record<Disziplin, string> = {
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball',
  'multi-ball': 'Multi-Ball',
  '14-1': '14.1'
};

const DISZIPLIN_AUS_TEXT: Record<string, Disziplin> = {
  '8-ball': '8-ball',
  '9-ball': '9-ball',
  '10-ball': '10-ball',
  'multi-ball': 'multi-ball',
  '14.1': '14-1',
  '14-1': '14-1'
};

export function disziplinText(d: Disziplin): string {
  return DISZIPLIN_ALS_TEXT[d] ?? d;
}

export function disziplinAusText(text: string): Disziplin | null {
  return DISZIPLIN_AUS_TEXT[text.trim().toLowerCase()] ?? null;
}

// Kennung beim Herunterladen: Ein eingelesenes Turnier behaelt seine
// Herkunft. Altbestand aus Turnier light traegt die Kennung ohne Vorsilbe.
export function kennungVon(t: { id: string; quelle: string | null; alt_id: string | null }): string {
  const alt = t.alt_id ?? '';
  if (t.quelle === 'import' && alt && !alt.startsWith('excel:')) {
    return alt.startsWith('cuedesk:') || alt.startsWith('turnierpilot:') ? alt : `turnierpilot:${alt}`;
  }
  return `cuedesk:${t.id}`;
}

// alt_id-Werte, unter denen ein Turnier mit dieser Kennung schon in CueDesk steht
export function altIdsZu(kennung: string): string[] {
  return kennung.startsWith('turnierpilot:') ? [kennung, kennung.slice('turnierpilot:'.length)] : [kennung];
}

// Eigene CueDesk-Turniere kommen als "cuedesk:<id>" zurueck
export function eigeneId(kennung: string): string | null {
  return kennung.startsWith('cuedesk:') ? kennung.slice('cuedesk:'.length) : null;
}

// Phase als Klartext wie in TurnierPilot ("Gruppe A", "Halbfinale", "Platzierung")
export function phaseText(phase: string | null, gruppe: string | null): string {
  if (phase === 'phase2' || phase === 'phase3') return 'Platzierung';
  return rundeText({ phase, gruppe });
}

const KO_KUERZEL: [string, string][] = [
  ['achtelfinale', 'af'],
  ['viertelfinale', 'qf'],
  ['halbfinale', 'sf'],
  ['finale', 'fin'],
  ['spiel um platz 3', 'bro']
];

// Klartext zurueck in phase/gruppe von CueDesk. KO-Runden werden je Runde
// durchgezaehlt (qf1, qf2, ...); dafuer zaehlt "zaehler" mit.
export function phaseAusText(text: string | undefined, zaehler: Map<string, number>): { phase: string | null; gruppe: string | null } {
  const t = (text ?? '').trim();
  const klein = t.toLowerCase();
  const gruppe = /^gruppe\s*([a-z])?$/i.exec(t);
  if (gruppe) return { phase: 'gruppe', gruppe: gruppe[1]?.toUpperCase() ?? null };
  if (klein === 'platzierung') return { phase: 'phase3', gruppe: null };
  const ko = KO_KUERZEL.find(([name]) => klein === name);
  if (ko) {
    if (ko[1] === 'fin' || ko[1] === 'bro') return { phase: 'ko', gruppe: ko[1] };
    const n = (zaehler.get(ko[1]) ?? 0) + 1;
    zaehler.set(ko[1], n);
    return { phase: 'ko', gruppe: `${ko[1]}${n}` };
  }
  return { phase: t || null, gruppe: null };
}

export function dateiBauen(programm: string, turniere: DateiTurnier[], jetzt = new Date()): TurnierDatei {
  return { format: DATEI_FORMAT, formatVersion: DATEI_VERSION, programm, erstellt: jetzt.toISOString(), turniere };
}

export function dateiname(turniere: DateiTurnier[]): string {
  const t = turniere[0];
  const name = turniere.length === 1 ? `${t.datum}_${t.name}` : `${turniere.length}_Turniere`;
  return `turnier_${name.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]+/g, '_')}.json`;
}

export function dateiHerunterladen(datei: TurnierDatei): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(datei, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname(datei.turniere);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function istTurnierDatei(roh: unknown): boolean {
  return typeof roh === 'object' && roh !== null && (roh as { format?: unknown }).format === DATEI_FORMAT;
}

const zahl = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number.NaN);
const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

// Prueft die Datei. Turniere mit Fehlern kommen nicht mit, sondern als Meldung.
export function dateiLesen(roh: unknown): { turniere: DateiTurnier[]; meldungen: string[] } {
  if (!istTurnierDatei(roh)) throw new Error('Das ist keine Turnier-Datei.');
  const d = roh as Partial<TurnierDatei>;
  if ((d.formatVersion ?? 0) > DATEI_VERSION) {
    throw new Error('Die Turnier-Datei stammt aus einer neueren Fassung. Bitte CueDesk aktualisieren.');
  }
  const turniere: DateiTurnier[] = [];
  const meldungen: string[] = [];
  for (const t of Array.isArray(d.turniere) ? d.turniere : []) {
    const name = text(t?.name) || 'ohne Namen';
    const datum = text(t?.datum);
    if (!text(t?.kennung) || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      meldungen.push(`„${name}“: Kennung oder Datum fehlt, nicht eingelesen.`);
      continue;
    }
    const partien = (Array.isArray(t.partien) ? t.partien : [])
      .map((p) => ({
        a: text(p?.a),
        b: text(p?.b),
        satzA: zahl(p?.satzA),
        satzB: zahl(p?.satzB),
        vorgabeA: Number.isFinite(zahl(p?.vorgabeA)) ? zahl(p?.vorgabeA) : 0,
        vorgabeB: Number.isFinite(zahl(p?.vorgabeB)) ? zahl(p?.vorgabeB) : 0,
        raceTo: Number.isFinite(zahl(p?.raceTo)) ? zahl(p?.raceTo) : null,
        phase: text(p?.phase),
        werten: p?.werten !== false,
        grund: text(p?.grund) || null
      }));
    const kaputt = partien.filter((p) => !p.a || !p.b || !Number.isFinite(p.satzA) || !Number.isFinite(p.satzB));
    if (kaputt.length > 0) meldungen.push(`„${name}“: ${kaputt.length} unvollständige Partien ausgelassen.`);
    turniere.push({
      kennung: text(t.kennung),
      name,
      datum,
      disziplin: text(t.disziplin),
      modus: text(t.modus),
      teilnehmer: (Array.isArray(t.teilnehmer) ? t.teilnehmer : []).map(text).filter(Boolean),
      ranking: (Array.isArray(t.ranking) ? t.ranking : [])
        .map((r) => ({ platz: zahl(r?.platz), name: text(r?.name) }))
        .filter((r) => Number.isFinite(r.platz) && r.name),
      partien: partien.filter((p) => !kaputt.includes(p))
    });
  }
  if (turniere.length === 0 && meldungen.length === 0) meldungen.push('Die Datei enthält kein Turnier.');
  return { turniere, meldungen };
}

// Alle Namen eines Turniers: Teilnehmer, Plaetze und Partien
export function namenVon(t: DateiTurnier): string[] {
  return [...new Set([...t.teilnehmer, ...t.ranking.map((r) => r.name), ...t.partien.flatMap((p) => [p.a, p.b])])];
}
