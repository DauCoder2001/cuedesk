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
  };
  liga: {
    liga: LigaKennung;
    mannschaftRang: number | null; // Nummer im Mannschaftspass, null: erste der Saison
  };
  saisonbeginn: number; // Monat 1 bis 12
};

export const STANDARD_EINSTELLUNGEN: VereinsEinstellungen = {
  turnier: {
    raceTo: 5,
    disziplin: '9-ball',
    modus: 'einzelgruppe',
    vorgabe: true,
    staerke: null,
    obergrenze: 0,
    ratingWerten: true
  },
  liga: { liga: 'kreisliga', mannschaftRang: null },
  saisonbeginn: 7
};

const DISZIPLINEN: Disziplin[] = ['8-ball', '9-ball', '10-ball'];
const MODI: TurnierModus[] = ['einzelgruppe', 'zwei-gruppen', 'gruppen-ko', 'liga'];
const LIGEN: LigaKennung[] = ['kreisklasse', 'kreisliga', 'bezirksliga', 'landesliga', 'spass'];

const ganzeZahl = (wert: unknown, von: number, bis: number): number | null =>
  typeof wert === 'number' && Number.isInteger(wert) && wert >= von && wert <= bis ? wert : null;

function auswahl<T>(wert: unknown, erlaubt: T[], standard: T): T {
  return erlaubt.includes(wert as T) ? (wert as T) : standard;
}

// Liest die gespeicherten Einstellungen; alles Fehlende kommt vom Standard
export function vereinsEinstellungen(roh: unknown): VereinsEinstellungen {
  const e = (roh && typeof roh === 'object' ? roh : {}) as Record<string, Record<string, unknown> | unknown>;
  const t = (e.turnier && typeof e.turnier === 'object' ? e.turnier : {}) as Record<string, unknown>;
  const l = (e.liga && typeof e.liga === 'object' ? e.liga : {}) as Record<string, unknown>;
  const s = STANDARD_EINSTELLUNGEN;
  return {
    turnier: {
      raceTo: ganzeZahl(t.raceTo, 1, 25) ?? s.turnier.raceTo,
      disziplin: auswahl(t.disziplin, DISZIPLINEN, s.turnier.disziplin),
      modus: auswahl(t.modus, MODI, s.turnier.modus),
      vorgabe: typeof t.vorgabe === 'boolean' ? t.vorgabe : s.turnier.vorgabe,
      staerke: ganzeZahl(t.staerke, 0, 100),
      obergrenze: ganzeZahl(t.obergrenze, 0, 24) ?? s.turnier.obergrenze,
      ratingWerten: typeof t.ratingWerten === 'boolean' ? t.ratingWerten : s.turnier.ratingWerten
    },
    liga: {
      liga: auswahl(l.liga, LIGEN, s.liga.liga),
      mannschaftRang: ganzeZahl(l.mannschaftRang, 1, 20)
    },
    saisonbeginn: ganzeZahl(e.saisonbeginn, 1, 12) ?? s.saisonbeginn
  };
}

// Kuerzel fuer das Kaestchen oben links, wenn es kein Logo gibt
export function vereinsKuerzel(kurzname: string | null | undefined, name: string | null | undefined): string {
  const quelle = (kurzname ?? '').trim() || (name ?? '').trim() || 'CueDesk';
  return quelle.slice(0, 2).toUpperCase();
}
