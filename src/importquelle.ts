// Herkunft eines uebernommenen Turniers (quelle = 'import') fuer die Marke in
// Listen: Excel-Spieltage tragen alt_id "excel:<serie>:<datum>"
// (ExcelSerie.tsx), Turniere aus Turnier light ihre alte Kennung, Turnier-Dateien
// "turnierpilot:<id>" bzw. "cuedesk:<id>" (turnier-datei.ts).
export function importMarke(t: { quelle: string | null; alt_id: string | null }): string | null {
  if (t.quelle !== 'import') return null;
  if (t.alt_id?.startsWith('excel:')) return 'aus Excel';
  if (t.alt_id?.startsWith('turnierpilot:')) return 'aus TurnierPilot';
  if (t.alt_id?.startsWith('cuedesk:')) return 'aus Turnier-Datei';
  return t.alt_id ? 'aus Turnier light' : 'importiert';
}
