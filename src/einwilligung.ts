// Einwilligungen (Stufe 22): Wortlaut der Namensanzeige und Auswertung des
// Verlaufs aus der Tabelle "einwilligungen". Es gilt der juengste Eintrag je
// Art. Gesetzt wird nur ueber die Datenbankfunktion einwilligung_setzen.
// Abgesichert durch test/einwilligung.test.ts.

import type { Einwilligung, EinwilligungArt, EinwilligungWeg } from './datenbank.types';

// Aendert sich der Wortlaut, bekommt er eine neue Fassung; gespeichert wird
// die Fassung, der jemand selbst zugestimmt hat.
export const NAMENSANZEIGE_FASSUNG = 'N1 vom 29.09.2026';

// Die Namensanzeige betrifft die oeffentlichen Seiten. Vom 30.09.2026 an gab
// es keine und sie war ausgeblendet; seit dem oeffentlichen Live-Link
// (Stufe 32, 08.10.2026) wieder an: in "Mein Konto" und auf der Seite
// "Spieler". Der Link zeigt den Namen nur mit Nachweis (selbst, schriftlich,
// Erziehungsberechtigte), alte uebernommene Haken gelten dort nicht.
export const NAMENSANZEIGE_AKTIV = true;
export const NAMENSANZEIGE_TEXT =
  'Ich bin einverstanden, dass mein Name in öffentlichen Ansichten von CueDesk erscheint, zum Beispiel auf einer ' +
  'Zuschauerseite oder bei Ergebnissen und Ranglisten, die ohne Anmeldung sichtbar sind. Ohne Einwilligung steht dort ' +
  'nur mein Kürzel. Ich kann die Einwilligung jederzeit unter „Mein Konto“ widerrufen.';

export const WEG_TEXT: Record<EinwilligungWeg, string> = {
  selbst: 'selbst in CueDesk',
  schriftlich: 'schriftlich, Nachweis beim Verein',
  erziehungsberechtigte: 'Erziehungsberechtigte, schriftlich',
  uebernommen: 'übernommen, ohne Nachweis'
};

export const ART_TEXT: Record<EinwilligungArt, string> = {
  name_oeffentlich: 'Namensanzeige',
  konto_minderjaehrig: 'Konto (Minderjährige)'
};

export type EinwilligungStand = {
  gilt: boolean;
  letzte: Einwilligung | null;
  ohneNachweis: boolean; // bisheriger Haken, von der Vereinsleitung noch nicht bestaetigt
};

export function einwilligungStand(liste: Einwilligung[], art: EinwilligungArt): EinwilligungStand {
  const letzte =
    liste
      .filter((e) => e.art === art)
      .sort((a, b) => b.am.localeCompare(a.am))[0] ?? null;
  return {
    gilt: letzte?.vorgang === 'erteilt',
    letzte,
    ohneNachweis: letzte?.vorgang === 'erteilt' && letzte.weg === 'uebernommen'
  };
}

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function standText(s: EinwilligungStand): string {
  if (!s.letzte) return 'keine Einwilligung';
  if (s.ohneNachweis) return 'übernommen, ohne Nachweis';
  const wann = datum(s.letzte.am);
  return s.gilt
    ? `eingewilligt am ${wann} (${WEG_TEXT[s.letzte.weg]})`
    : `widerrufen am ${wann} (${WEG_TEXT[s.letzte.weg]})`;
}
