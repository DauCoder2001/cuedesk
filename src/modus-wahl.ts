// Modus am Turniertag festlegen: welche Modi zur Teilnehmerzahl passen, wie
// viele Spiele sie bringen und welcher vorgeschlagen wird. Die Grenzen fuer
// den Vorschlag stellt der Verein auf der Seite "System" ein.

import { zielGroessen } from './gruppen';
import { KO_GRUPPEN, KO_MAX, KO_MIN, koSpiele, standardGruppenzahl, weiterPassend } from './ko';

export type WaehlbarerModus = 'einzelgruppe' | 'zwei-gruppen' | 'gruppen-ko';

export type ModusOption = {
  modus: WaehlbarerModus;
  passt: boolean;
  spiele: number | null; // ohne freiwillige Platzierungsspiele
  grund: string | null; // warum nicht passend
};

export const EINZEL_MIN = 3;
export const EINZEL_MAX = 12;
export const ZWEI_MIN = 4;
export const ZWEI_MAX = 16;

const jederGegenJeden = (n: number) => (n * (n - 1)) / 2;

export function modusOptionen(anzahl: number): ModusOption[] {
  const einzel: ModusOption =
    anzahl >= EINZEL_MIN && anzahl <= EINZEL_MAX
      ? { modus: 'einzelgruppe', passt: true, spiele: jederGegenJeden(anzahl), grund: null }
      : { modus: 'einzelgruppe', passt: false, spiele: null, grund: `${EINZEL_MIN} bis ${EINZEL_MAX} Teilnehmer` };

  let zwei: ModusOption;
  if (anzahl >= ZWEI_MIN && anzahl <= ZWEI_MAX) {
    const g = zielGroessen(anzahl, ['A', 'B']);
    // Gruppenspiele plus Platzierungsduelle (A1-B1, A2-B2 ...)
    zwei = {
      modus: 'zwei-gruppen',
      passt: true,
      spiele: jederGegenJeden(g.A) + jederGegenJeden(g.B) + Math.min(g.A, g.B),
      grund: null
    };
  } else {
    zwei = { modus: 'zwei-gruppen', passt: false, spiele: null, grund: `${ZWEI_MIN} bis ${ZWEI_MAX} Teilnehmer` };
  }

  let ko: ModusOption;
  if (anzahl < KO_MIN || anzahl > KO_MAX) {
    ko = { modus: 'gruppen-ko', passt: false, spiele: null, grund: `${KO_MIN} bis ${KO_MAX} Teilnehmer` };
  } else {
    const gruppenzahl = standardGruppenzahl(anzahl);
    const weiter = weiterPassend(anzahl, gruppenzahl, undefined);
    if (weiter === null) {
      ko = { modus: 'gruppen-ko', passt: false, spiele: null, grund: 'kein passendes KO-Feld' };
    } else {
      const groessen = Object.values(zielGroessen(anzahl, KO_GRUPPEN.slice(0, gruppenzahl)));
      ko = {
        modus: 'gruppen-ko',
        passt: true,
        spiele: groessen.reduce((n, g) => n + jederGegenJeden(g), 0) + koSpiele(weiter * gruppenzahl).length,
        grund: null
      };
    }
  }
  return [einzel, zwei, ko];
}

// Vorschlag nach den Grenzen des Vereins; passt er nicht, der naechste passende
export function modusVorschlag(anzahl: number, grenzen: { einzelBis: number; zweiBis: number }): WaehlbarerModus | null {
  const optionen = modusOptionen(anzahl);
  const wunsch: WaehlbarerModus =
    anzahl <= grenzen.einzelBis ? 'einzelgruppe' : anzahl <= grenzen.zweiBis ? 'zwei-gruppen' : 'gruppen-ko';
  if (optionen.find((o) => o.modus === wunsch)?.passt) return wunsch;
  return optionen.find((o) => o.passt)?.modus ?? null;
}
