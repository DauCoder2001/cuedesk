// Welche Partien sind in den Rating-Wert eines Spielers eingegangen? Fuer die
// Liste "Partien" auf der Seite Rating. Dieselbe Auswahl wie bei der Berechnung
// (supabase/functions/rating): Partien aus der Ansicht rating_partien (ohne
// Einzelspiele, 14.1, nicht gewertete Turniere und Partien, Gaeste nur in der
// Liga), ohne 0:0, im Zeitfenster laut auswahl() - fuer "Gesamt" ueber alle
// Disziplinen, sonst nur die gewaehlte.

import { auswahl, GESAMT, STANDARD_EINSTELLUNGEN } from './rating';
import type { RatingEinstellungen, RatingPartie } from './rating';

export type GewertetePartie = RatingPartie & { id: string };

export function gewertetePartien(
  partien: GewertetePartie[],
  personId: string,
  ansicht: string,
  stichtag: string,
  einstellungen?: Partial<RatingEinstellungen>
): GewertetePartie[] {
  const einst: RatingEinstellungen = { ...STANDARD_EINSTELLUNGEN, ...einstellungen };
  einst.rueckgriff = Math.max(einst.zeitraum, einst.rueckgriff);
  const gueltig = partien.filter((p) => p.wa + p.wb > 0 && p.a !== p.b);
  const relevant = ansicht === GESAMT ? gueltig : gueltig.filter((p) => p.disziplin === ansicht);
  return (auswahl(relevant, stichtag, einst).benutzt as GewertetePartie[]).filter(
    (p) => p.a === personId || p.b === personId
  );
}
