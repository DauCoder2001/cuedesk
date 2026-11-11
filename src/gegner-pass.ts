// Gegnerische Mannschaft aus ihrem Mannschaftspass (PDF, src/mannschaftspass.ts)
// uebernehmen: die Mannschaft finden, die in Liga und Staffel zur eigenen
// passt, und ihre Spieler als Gaeste vorbereiten. Angelegt wird erst beim
// Speichern (src/seiten/GegnerPass.tsx, gegnerGaesteAnlegen).

import type { LigaKennung } from './liga';
import type { Mannschaftspass, PassMannschaft } from './mannschaftspass';

// Angezeigter Name eines Gastes (TV, Live, Tablets): Vorname und der erste
// Buchstabe des Nachnamens, z. B. "Max M."
export function gastAnzeigename(vorname: string, nachname: string): string {
  const v = vorname.trim();
  const n = nachname.trim();
  if (!n) return v;
  if (!v) return n;
  return `${v} ${n.charAt(0).toUpperCase()}.`;
}

const klein = (text: string | null | undefined) => (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Mannschaften des Passes, die zur eigenen passen: erst Liga und Staffel,
// sonst nur die Liga. Ohne Treffer bleibt die Liste leer; dann stehen im
// Auswahlfeld alle Mannschaften.
export function passendeMannschaften(
  pass: Mannschaftspass,
  liga: LigaKennung | null,
  staffel: string | null
): PassMannschaft[] {
  const inLiga = pass.mannschaften.filter((m) => liga !== null && m.liga === liga);
  const genau = inLiga.filter((m) => staffel && klein(m.staffel) === klein(staffel));
  return genau.length > 0 ? genau : inLiga;
}

// Name des Gegners wie in der Liga ueblich: Verein und Nummer im Pass
export function gegnerName(pass: Mannschaftspass, m: PassMannschaft): string {
  return `${pass.verein} ${m.nummer}`;
}
