import type { supabase } from './supabase';

// Die Tablets bedienen nur ein Turnier zugleich: das neueste laufende von
// heute oder gestern, beim Liga-Spieltag alle laufenden Begegnungen gemeinsam
// (turnierLaden in scoreboards/js/anbindung.ts). Vor dem Start oder Wieder-
// oeffnen prueft CueDesk deshalb, ob schon ein anderes Turnier laeuft.

type MitLiga = { id: string; modus: string | null; einstellungen: unknown };
type LigaVerweis = { art?: string; begegnung?: number; partner?: string; haupt?: string };

// Gestern als Datum (YYYY-MM-DD), so wie die Anbindung rechnet
export function gesternIso(jetzt = Date.now()): string {
  return new Date(jetzt - 86400000).toISOString().slice(0, 10);
}

// Laeuft ein Turnier mit diesem Datum, sehen es die Tablets nicht mehr
export function fuerTabletsZuAlt(datum: string, jetzt = Date.now()): boolean {
  return datum < gesternIso(jetzt);
}

// Gemeinsamer Schluessel aller Begegnungen eines Liga-Spieltags (wie
// spieltagSchluessel in scoreboards/js/turnier-plan.ts), sonst null
export function spieltagVon(t: MitLiga): string | null {
  const liga = t.modus === 'liga' ? ((t.einstellungen ?? {}) as { liga?: LigaVerweis }).liga : undefined;
  if (!liga) return null;
  if (liga.art === 'doppel') return liga.haupt ?? null;
  return (liga.begegnung ?? 1) === 1 ? t.id : liga.partner ?? null;
}

// Ein anderes laufendes Turnier, das an den Tablets im Weg waere; Begegnungen
// desselben Spieltags zaehlen nicht
export function andererImWeg<T extends MitLiga>(t: MitLiga, laufende: T[]): T | null {
  const eigen = spieltagVon(t);
  return laufende.find((x) => x.id !== t.id && (!eigen || spieltagVon(x) !== eigen)) ?? null;
}

export const laeuftSchonText = (name: string) =>
  `Gerade läuft „${name}“. Die Tablets können nur ein Turnier zugleich bedienen. Erst „${name}“ abschließen.`;

// Name des Turniers, das schon laeuft, oder null. Ein Turnier mit altem Datum
// erreicht die Tablets ohnehin nicht (etwa zum Korrigieren wieder geoeffnet).
export async function andererLaufender(
  db: typeof supabase,
  t: MitLiga & { verein_id: string; datum: string }
): Promise<string | null> {
  if (fuerTabletsZuAlt(t.datum)) return null;
  const { data } = await db
    .from('turniere')
    .select('id, name, modus, einstellungen')
    .eq('verein_id', t.verein_id)
    .eq('status', 'laeuft')
    .gte('datum', gesternIso());
  return andererImWeg(t, data ?? [])?.name ?? null;
}
