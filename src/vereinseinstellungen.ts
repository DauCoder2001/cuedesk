// Einstellungen eines Vereins (vereine.einstellungen), gepflegt auf der Seite
// "System". Gespeichert wird nur, was vom Standard abweicht; gelesen wird immer
// ueber vereinsEinstellungen(), das fehlende oder unbrauchbare Werte mit den
// bisherigen festen Werten auffuellt. So verhalten sich Vereine ohne
// Einstellungen genau wie vorher.

import type { Disziplin, TurnierModus } from './datenbank.types';
import type { LigaKennung } from './liga';

export type VereinsEinstellungen = {
  turnier: {
    raceTo: number;
    disziplin: Disziplin;
    modus: TurnierModus;
    vorgabe: boolean;
    staerke: number | null; // null: Wert aus den Rating-Einstellungen
    obergrenze: number; // 0 = ohne Grenze
    ratingWerten: boolean;
    art: string | null; // vorgewaehlte Turnierart, null: keine
    // Modus am Turniertag: Vorschlag nach Teilnehmerzahl (src/modus-wahl.ts)
    einzelBis: number; // bis hier Einzelgruppe
    zweiBis: number; // bis hier Zwei Gruppen, darueber Gruppen mit KO
  };
  // Turnierarten des Vereins, z. B. "Liga-Spiel", "Vereinsmeisterschaft".
  // Nur eine Bezeichnung - Spiel, Rating und Scoreboard bleiben unberuehrt.
  turnierarten: string[];
  liga: {
    liga: LigaKennung;
    mannschaftRang: number | null; // Nummer im Mannschaftspass, null: erste der Saison
  };
  saisonbeginn: number; // Monat 1 bis 12
  // Chat fuer Zuschauer (Stufe 24); der Verein schaltet ihn bewusst ein
  chat: boolean;
};

export const STANDARD_EINSTELLUNGEN: VereinsEinstellungen = {
  turnier: {
    raceTo: 5,
    disziplin: '9-ball',
    modus: 'einzelgruppe',
    vorgabe: true,
    staerke: null,
    obergrenze: 0,
    ratingWerten: true,
    art: null,
    einzelBis: 7,
    zweiBis: 15
  },
  turnierarten: [],
  liga: { liga: 'kreisliga', mannschaftRang: null },
  saisonbeginn: 7,
  chat: false
};

const DISZIPLINEN: Disziplin[] = ['8-ball', '9-ball', '10-ball'];
const MODI: TurnierModus[] = ['einzelgruppe', 'zwei-gruppen', 'gruppen-ko', 'liga'];
const LIGEN: LigaKennung[] = ['kreisklasse', 'kreisliga', 'bezirksliga', 'landesliga', 'spass'];

const ganzeZahl = (wert: unknown, von: number, bis: number): number | null =>
  typeof wert === 'number' && Number.isInteger(wert) && wert >= von && wert <= bis ? wert : null;

function auswahl<T>(wert: unknown, erlaubt: T[], standard: T): T {
  return erlaubt.includes(wert as T) ? (wert as T) : standard;
}

export const TURNIERART_LAENGE = 40;
const TURNIERARTEN_HOECHSTENS = 30;

// Liste der Turnierarten: nur Text, getrimmt, ohne Leere und Doppelte
function artenLesen(roh: unknown): string[] {
  if (!Array.isArray(roh)) return [];
  const liste: string[] = [];
  for (const eintrag of roh) {
    if (typeof eintrag !== 'string') continue;
    const name = eintrag.trim().slice(0, TURNIERART_LAENGE);
    if (name && !liste.some((x) => x.toLowerCase() === name.toLowerCase())) liste.push(name);
  }
  return liste.slice(0, TURNIERARTEN_HOECHSTENS);
}

// Neue Turnierart pruefen: Fehlertext oder null
export function turnierartFehler(liste: string[], name: string): string | null {
  const n = name.trim();
  if (!n) return 'Bitte einen Namen für die Turnierart eingeben.';
  if (n.length > TURNIERART_LAENGE) return `Höchstens ${TURNIERART_LAENGE} Zeichen.`;
  if (liste.some((x) => x.toLowerCase() === n.toLowerCase())) return `„${n}“ gibt es schon.`;
  if (liste.length >= TURNIERARTEN_HOECHSTENS) return `Höchstens ${TURNIERARTEN_HOECHSTENS} Turnierarten.`;
  return null;
}

// Liest die gespeicherten Einstellungen; alles Fehlende kommt vom Standard
export function vereinsEinstellungen(roh: unknown): VereinsEinstellungen {
  const e = (roh && typeof roh === 'object' ? roh : {}) as Record<string, Record<string, unknown> | unknown>;
  const t = (e.turnier && typeof e.turnier === 'object' ? e.turnier : {}) as Record<string, unknown>;
  const l = (e.liga && typeof e.liga === 'object' ? e.liga : {}) as Record<string, unknown>;
  const s = STANDARD_EINSTELLUNGEN;
  const turnierarten = artenLesen(e.turnierarten);
  // Grenzen fuer den Modus-Vorschlag: Einzelgruppe 3-12, Zwei Gruppen 4-16 (und
  // groesser als die Einzelgruppen-Grenze)
  const einzelBis = ganzeZahl(t.einzelBis, 3, 12) ?? s.turnier.einzelBis;
  const zweiRoh = ganzeZahl(t.zweiBis, 4, 16) ?? s.turnier.zweiBis;
  const zweiBis = zweiRoh > einzelBis ? zweiRoh : Math.max(einzelBis + 1, s.turnier.zweiBis);
  return {
    turnier: {
      raceTo: ganzeZahl(t.raceTo, 1, 25) ?? s.turnier.raceTo,
      disziplin: auswahl(t.disziplin, DISZIPLINEN, s.turnier.disziplin),
      modus: auswahl(t.modus, MODI, s.turnier.modus),
      vorgabe: typeof t.vorgabe === 'boolean' ? t.vorgabe : s.turnier.vorgabe,
      staerke: ganzeZahl(t.staerke, 0, 100),
      obergrenze: ganzeZahl(t.obergrenze, 0, 24) ?? s.turnier.obergrenze,
      ratingWerten: typeof t.ratingWerten === 'boolean' ? t.ratingWerten : s.turnier.ratingWerten,
      art: typeof t.art === 'string' && turnierarten.includes(t.art) ? t.art : null,
      einzelBis,
      zweiBis
    },
    turnierarten,
    liga: {
      liga: auswahl(l.liga, LIGEN, s.liga.liga),
      mannschaftRang: ganzeZahl(l.mannschaftRang, 1, 20)
    },
    saisonbeginn: ganzeZahl(e.saisonbeginn, 1, 12) ?? s.saisonbeginn,
    chat: e.chat === true
  };
}

// Kuerzel fuer das Kaestchen oben links, wenn es kein Logo gibt
export function vereinsKuerzel(kurzname: string | null | undefined, name: string | null | undefined): string {
  const quelle = (kurzname ?? '').trim() || (name ?? '').trim() || 'CueDesk';
  return quelle.slice(0, 2).toUpperCase();
}
