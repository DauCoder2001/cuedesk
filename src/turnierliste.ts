// Filter der Turnierliste: Name (Teil, ohne Gross/Klein), Jahr, Disziplin,
// Modus und Stand. Gefiltert wird nach den Texten, die in der Liste stehen,
// damit Auswahl und Anzeige immer zusammenpassen. '' heisst jeweils "alle".

export type ListenZeile = { name: string; datum: string; disziplin: string; modus: string; stand: string };

export type ListenFilter = { suche: string; jahr: string; disziplin: string; modus: string; stand: string };

export const KEIN_FILTER: ListenFilter = { suche: '', jahr: '', disziplin: '', modus: '', stand: '' };

export const filterAktiv = (f: ListenFilter) => Object.values(f).some((w) => w.trim() !== '');

export function passt(z: ListenZeile, f: ListenFilter): boolean {
  const suche = f.suche.trim().toLocaleLowerCase('de');
  return (
    (!suche || z.name.toLocaleLowerCase('de').includes(suche)) &&
    (!f.jahr || z.datum.slice(0, 4) === f.jahr) &&
    (!f.disziplin || z.disziplin === f.disziplin) &&
    (!f.modus || z.modus === f.modus) &&
    (!f.stand || z.stand === f.stand)
  );
}

// Auswahl der Felder: nur Werte, die in der Liste vorkommen; Jahre neueste zuerst
export function auswahl(zeilen: ListenZeile[]) {
  const werte = (feld: keyof ListenZeile) => [...new Set(zeilen.map((z) => z[feld]))].sort((a, b) => a.localeCompare(b, 'de'));
  return {
    jahre: [...new Set(zeilen.map((z) => z.datum.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    disziplinen: werte('disziplin'),
    modi: werte('modus'),
    staende: werte('stand')
  };
}
