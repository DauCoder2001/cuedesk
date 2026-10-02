// Rollen eines Kontos in einem Verein. Die Rolle 'mitglied' heisst in der
// Oberflaeche "Lesezugang", damit sie nicht mit dem Spieler-Status
// "Mitglied" verwechselt wird; in der Datenbank bleibt sie 'mitglied'.

import type { Rolle } from './datenbank.types';

export const ROLLEN: { wert: Rolle; name: string; erklaerung: string }[] = [
  { wert: 'vereinsadmin', name: 'Vereins-Administrator', erklaerung: 'Konten, Rollen, Geräte, Löschen' },
  { wert: 'sportwart', name: 'Sportwart', erklaerung: 'Spieler, Serien, Rating' },
  { wert: 'turnierleiter', name: 'Turnierleiter', erklaerung: 'Turniere, Auslosung, Ergebnisse' },
  { wert: 'mitglied', name: 'Lesezugang', erklaerung: 'Live, Zuschauen, Chat, eigene Statistik, Ranglisten' }
];

export function rollenName(rolle: string): string {
  return ROLLEN.find((r) => r.wert === rolle)?.name ?? rolle;
}

export function rollenText(rollen: string[]): string {
  if (rollen.length === 0) return 'keine Rolle';
  return ROLLEN.filter((rolle) => rollen.includes(rolle.wert))
    .map((rolle) => rolle.name)
    .join(', ');
}

// Fuer die Kopfzeile: die hoechste Rolle im Verein
export function hoechsteRolle(rollen: string[]): string {
  const hoechste = ROLLEN.find((rolle) => rollen.includes(rolle.wert));
  return hoechste ? hoechste.name : '';
}
