// "Spieltag ändern" (Liga-Ansicht): Grunddaten eines Spieltags in
// Vorbereitung nachtraeglich korrigieren, fuer alle Begegnungen zugleich.
// Reine Rechnung, getestet in test/spieltag-aendern.test.ts; gespeichert wird
// in src/seiten/SpieltagAendern.tsx.

import { LIGEN } from './liga';
import type { LigaKennung } from './liga';
import type { TurnierEinstellungen } from './seiten/Turniere';

export type SpieltagEingabe = {
  name: string; // ohne den Zusatz der weiteren Begegnungen
  datum: string;
  liga: LigaKennung;
  spieltag: number;
  heim: boolean; // Heimrecht der 1. Begegnung
  gegner: string;
  eigene: string;
  mannschaft_id: string | null;
};

type Teil = { id: string; name: string; einstellungen: unknown };

const ligaVon = (t: { einstellungen: unknown }) => ((t.einstellungen ?? {}) as TurnierEinstellungen).liga;

// Zusatz im Namen der weiteren Begegnungen (" · 2. Begegnung", " · Doppel")
const ZUSATZ = / · ([12]\. Begegnung|Doppel)$/;

// Liga wechseln geht nur, solange nirgends eine Aufstellung oder Partie steht:
// davon haengen Spiele und Ausspielziele ab. Die Spass-Liga hat eigene Ziele
// und das Doppel; sie bleibt, wie sie ist.
export function ligaAenderbar(teile: Teil[], partienAnzahl: number): boolean {
  if (partienAnzahl > 0) return false;
  return teile.every((t) => {
    const liga = ligaVon(t);
    return liga && liga.liga !== 'spass' && Object.keys(liga.aufstellung ?? {}).length === 0;
  });
}

// Neue Werte je Begegnung. Die 2. Begegnung behaelt das getauschte Heimrecht,
// das Doppel spielt mit dem Heimrecht der 1.; die Namen behalten ihren Zusatz.
export function spieltagAenderung(
  teile: Teil[],
  e: SpieltagEingabe
): { id: string; name: string; datum: string; einstellungen: TurnierEinstellungen }[] {
  return teile.map((t) => {
    const einstellungen = (t.einstellungen ?? {}) as TurnierEinstellungen;
    const liga = einstellungen.liga!;
    const zweite = liga.art !== 'doppel' && (liga.begegnung ?? 1) === 2;
    const ligaNeu = liga.liga !== e.liga;
    return {
      id: t.id,
      name: `${e.name.trim()}${ZUSATZ.exec(t.name)?.[0] ?? ''}`,
      datum: e.datum,
      einstellungen: {
        ...einstellungen,
        liga: {
          ...liga,
          liga: e.liga,
          spieltag: e.spieltag,
          heim: zweite ? !e.heim : e.heim,
          gegner: e.gegner.trim(),
          eigene: e.eigene.trim(),
          mannschaft_id: e.mannschaft_id,
          ziele: ligaNeu ? LIGEN[e.liga].ziele : liga.ziele
        }
      }
    };
  });
}

// Grundwerte fuer das Formular aus der 1. Begegnung
export function spieltagEingabe(erste: { name: string; datum: string; einstellungen: unknown }): SpieltagEingabe {
  const liga = ligaVon(erste)!;
  return {
    name: erste.name.replace(ZUSATZ, ''),
    datum: erste.datum,
    liga: liga.liga,
    spieltag: liga.spieltag,
    heim: liga.heim,
    gegner: liga.gegner,
    eigene: liga.eigene,
    mannschaft_id: liga.mannschaft_id ?? null
  };
}
