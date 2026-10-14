// Bruecke zwischen SheetJS und excel-serie.ts: ein Blatt als Zellraster mit
// absoluten Koordinaten (Zeile, Spalte ab 0, A1 = [0][0]), auch wenn der
// benutzte Bereich erst bei B1 beginnt. SheetJS wird von aussen hereingereicht,
// damit es nur beim Einlesen geladen wird.

import type { WorkBook, WorkSheet } from 'xlsx';
import type { Raster } from './excel-serie';

type Werkzeuge = { decode_range: (ref: string) => { e: { r: number; c: number } }; encode_cell: (z: { r: number; c: number }) => string };

export function rasterAusBlatt(blatt: WorkSheet, werkzeuge: Werkzeuge): Raster {
  const ref = blatt['!ref'];
  if (!ref) return [];
  const ende = werkzeuge.decode_range(ref).e;
  const raster: Raster = [];
  for (let r = 0; r <= ende.r; r++) {
    const zeile: Raster[number] = [];
    for (let c = 0; c <= ende.c; c++) {
      const z = blatt[werkzeuge.encode_cell({ r, c })] as { v?: unknown } | undefined;
      const v = z?.v;
      zeile.push(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null);
    }
    raster.push(zeile);
  }
  return raster;
}

// Das Blatt mit dem Turnier: "2 Gruppen", sonst das erste mit "Teilnehmer Gruppe"
export function abendBlatt(mappe: WorkBook, werkzeuge: Werkzeuge): Raster | null {
  const namen = [...mappe.SheetNames].sort((a, b) => Number(b === '2 Gruppen') - Number(a === '2 Gruppen'));
  for (const name of namen) {
    const raster = rasterAusBlatt(mappe.Sheets[name], werkzeuge);
    if (raster.some((zeile) => zeile.some((z) => typeof z === 'string' && /Teilnehmer Gruppe/i.test(z)))) return raster;
  }
  return null;
}
