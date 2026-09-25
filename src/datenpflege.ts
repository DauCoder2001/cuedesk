// Datenpflege (docs/Mandanten.md, Phase 3): Export eines Vereins,
// Loeschen mit Frist, Aufraeumen mit Vorschau.
import type { Verein } from './datenbank.types';

// Arten fuer aufraeumen(); vorgewaehlt sind die, bei denen nichts verloren
// geht, was noch jemand braucht.
export const AUFRAEUMEN_ARTEN = [
  { art: 'kopplungen', text: 'Abgelaufene Kopplungscodes (älter als 15 Minuten)', vorgewaehlt: true },
  { art: 'tablet_konten', text: 'Tablet-Anmeldungen ohne Gerät (entfernte Tablets, abgebrochene Kopplungen)', vorgewaehlt: true },
  { art: 'tablets_alt', text: 'Tablets, die sich seit 90 Tagen nicht gemeldet haben', vorgewaehlt: false },
  { art: 'einladungen', text: 'Einladungen, 30 Tage nicht angenommen', vorgewaehlt: true },
  { art: 'tischstaende', text: 'Tischstände, 14 Tage unverändert', vorgewaehlt: true },
  { art: 'aenderungen', text: 'Änderungsprotokoll älter als 2 Jahre', vorgewaehlt: false },
  { art: 'aenderungen_verwaist', text: 'Änderungsprotokoll von Vereinen, die es nicht mehr gibt', vorgewaehlt: true },
  { art: 'ereignisse', text: 'Meldungen der Sicherung älter als 1 Jahr', vorgewaehlt: true }
] as const;

export type AufraeumenArt = (typeof AUFRAEUMEN_ARTEN)[number]['art'];
export type AufraeumenZahlen = Partial<Record<AufraeumenArt, number>>;

// Wie weit ein Verein auf dem Weg zum Loeschen ist
export type LoeschStand = 'aktiv' | 'export_fehlt' | 'bereit' | 'vorgemerkt';

export function loeschStand(v: Pick<Verein, 'aktiv' | 'gesperrt_am' | 'export_am' | 'loeschen_ab'>): LoeschStand {
  if (v.aktiv) return 'aktiv';
  if (v.loeschen_ab) return 'vorgemerkt';
  // Wie in verein_loeschen_vormerken: der Export muss nach der Sperre liegen
  if (!v.export_am || (v.gesperrt_am && v.export_am < v.gesperrt_am)) return 'export_fehlt';
  return 'bereit';
}

export function exportDateiname(slug: string, datum: Date): string {
  const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
  return `cuedesk-${slug}-${tag}.json`;
}

export const datumText = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
