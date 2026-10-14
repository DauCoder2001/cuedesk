// Abend-Dateien der alten Excel-Serien (B&W Verden: "2 Gruppen Turnier -
// Jeder gegen Jeden") lesen. Gearbeitet wird auf einem Zellraster
// (Zeile, Spalte ab 0), das ExcelSerie.tsx mit SheetJS aus dem Blatt baut;
// so bleibt das Lesen ohne Bibliothek testbar.
//
// Beide bekannten Layouts haben dieselben Teile, nur an anderer Stelle:
//  - je Gruppe eine Kreuztabelle: Zeile "Teilnehmer Gruppe N", darunter die
//    Namen; weiter oben eine Kopfzeile mit denselben Namen. Im Schnittpunkt
//    steht das eigene Ergebnis, zwei Spalten weiter das des Gegners.
//  - "Ausspielen der Plaetze" (aelter: "Auspielung"): Paare in Nachbarzeilen,
//    Name, eine Spalte weiter das Ergebnis, drei Spalten weiter der Platz.
//  - Endplatzierung: "1. Platz", "2. Platz" ... und rechts daneben der Name.

export type Zelle = string | number | boolean | null | undefined;
export type Raster = Zelle[][];

export type AbendSpiel = {
  a: string;
  b: string;
  ergA: number;
  ergB: number;
  phase: 'gruppe' | 'phase3';
  gruppe: string | null; // 'A', 'B' bei Gruppenspielen
  paarung: number | null; // Platzierungsspiele: 1, 2, ... von oben
};

export type Abend = {
  gruppen: { name: string; spieler: string[] }[];
  spiele: AbendSpiel[];
  platzierung: { platz: number; name: string }[];
  raceTo: number | null;
  warnungen: string[];
};

const text = (z: Zelle): string => (typeof z === 'string' ? z.trim().replace(/\s+/g, ' ') : '');
const zahl = (z: Zelle): number | null => {
  if (typeof z === 'number' && Number.isFinite(z)) return z;
  if (typeof z === 'string' && /^\d+$/.test(z.trim())) return Number(z.trim());
  return null;
};
const zelle = (r: Raster, z: number, s: number): Zelle => r[z]?.[s];
// "Freilos" fuellt eine ungerade Gruppe auf und ist kein Spieler
export const istFreilos = (name: string): boolean => /^freilos$/i.test(name.trim());
// Ein Name: Text, der nicht nur aus Ziffern oder Satzzeichen besteht
const istName = (z: Zelle): boolean => /[A-Za-zÄÖÜäöüß]/.test(text(z)) && !istFreilos(text(z));

function finde(r: Raster, muster: RegExp): { z: number; s: number; treffer: RegExpMatchArray }[] {
  const liste: { z: number; s: number; treffer: RegExpMatchArray }[] = [];
  r.forEach((zeile, z) =>
    zeile?.forEach((wert, s) => {
      const t = text(wert).match(muster);
      if (t) liste.push({ z, s, treffer: t });
    })
  );
  return liste;
}

function gruppeLesen(r: Raster, z0: number, s0: number, kennung: string, warnungen: string[]) {
  // Namen unter der Beschriftung, bis zur ersten leeren Zeile
  const zeilen: { z: number; name: string }[] = [];
  for (let z = z0 + 1; z <= z0 + 16; z++) {
    if (istFreilos(text(zelle(r, z, s0)))) continue;
    if (!istName(zelle(r, z, s0))) {
      if (zeilen.length > 0) break;
      continue;
    }
    zeilen.push({ z, name: text(zelle(r, z, s0)) });
  }
  const namen = zeilen.map((x) => x.name);
  // Kopfzeile darueber: enthaelt die Namen in eigenen Spalten. Rechts daneben
  // steht oft ein Spielplan mit denselben Namen; gewaehlt wird die Zeile, in
  // deren Schnittpunkten mit den Namenszeilen die meisten Zahlen stehen.
  let kopf: Map<string, number> | null = null;
  let besteTreffer = 0;
  for (let z = z0 - 1; z >= Math.max(0, z0 - 12); z--) {
    const zeile = r[z] ?? [];
    // je Name die Kandidaten-Spalten dieser Zeile
    const kandidaten = new Map<string, number[]>();
    zeile.forEach((wert, s) => {
      const n = text(wert);
      if (namen.includes(n)) kandidaten.set(n, [...(kandidaten.get(n) ?? []), s]);
    });
    if (kandidaten.size !== namen.length) continue;
    const spalten = new Map<string, number>();
    for (const [n, liste] of kandidaten) {
      // die Spalte mit den meisten Zahlen darunter
      const wertung = (s: number) => zeilen.filter((x) => x.name !== n && zahl(zelle(r, x.z, s)) !== null).length;
      spalten.set(n, [...liste].sort((a, b) => wertung(b) - wertung(a))[0]);
    }
    let treffer = 0;
    for (const x of zeilen) for (const [n, s] of spalten) if (n !== x.name && zahl(zelle(r, x.z, s)) !== null) treffer++;
    if (treffer > besteTreffer) {
      besteTreffer = treffer;
      kopf = spalten;
    }
  }
  const spiele: AbendSpiel[] = [];
  if (namen.length === 0) return { namen, spiele };
  if (!kopf) {
    warnungen.push(`Gruppe ${kennung}: Kopfzeile der Kreuztabelle nicht gefunden, Gruppenspiele fehlen.`);
    return { namen, spiele };
  }
  for (let i = 0; i < zeilen.length; i++) {
    for (let j = i + 1; j < zeilen.length; j++) {
      const sj = kopf.get(zeilen[j].name)!;
      const si = kopf.get(zeilen[i].name)!;
      const ergA = zahl(zelle(r, zeilen[i].z, sj));
      const ergB = zahl(zelle(r, zeilen[i].z, sj + 2));
      if (ergA === null || ergB === null || (ergA === 0 && ergB === 0)) continue;
      // Gegenprobe aus der Zeile des Gegners
      const probeA = zahl(zelle(r, zeilen[j].z, si + 2));
      const probeB = zahl(zelle(r, zeilen[j].z, si));
      if (probeA !== null && probeB !== null && (probeA !== ergA || probeB !== ergB)) {
        warnungen.push(`Gruppe ${kennung}: ${zeilen[i].name} gegen ${zeilen[j].name} steht unterschiedlich in der Tabelle.`);
      }
      spiele.push({ a: zeilen[i].name, b: zeilen[j].name, ergA, ergB, phase: 'gruppe', gruppe: kennung, paarung: null });
    }
  }
  return { namen, spiele };
}

function platzierungsspieleLesen(r: Raster, warnungen: string[]): AbendSpiel[] {
  const kopf = finde(r, /^Aus?spiel(en|ung) der Pl/i)[0];
  if (!kopf) return [];
  const eintraege: { z: number; name: string; erg: number | null }[] = [];
  for (let z = kopf.z + 1; z <= kopf.z + 40; z++) {
    if (istName(zelle(r, z, kopf.s))) {
      eintraege.push({ z, name: text(zelle(r, z, kopf.s)), erg: zahl(zelle(r, z, kopf.s + 1)) });
    }
  }
  // Paare stehen in Nachbarzeilen. Ein einzelner Name ist kein Spiel: bei
  // ungleich grossen Gruppen bekommt der Ueberzaehlige seinen Platz ohne
  // Gegner, bei nur einer Gruppe steht hier die Liste der Gruppenplaetze.
  const spiele: AbendSpiel[] = [];
  for (let k = 0; k < eintraege.length; k++) {
    const x = eintraege[k];
    const y = eintraege[k + 1];
    if (!y || y.z !== x.z + 1) continue;
    k += 1;
    if (x.erg === null || y.erg === null) {
      if (x.erg !== null || y.erg !== null) warnungen.push(`Platzierungsspiel ${x.name} gegen ${y.name} ohne vollständiges Ergebnis, ausgelassen.`);
      continue;
    }
    if (x.erg === 0 && y.erg === 0) continue;
    spiele.push({ a: x.name, b: y.name, ergA: x.erg, ergB: y.erg, phase: 'phase3', gruppe: null, paarung: spiele.length + 1 });
  }
  return spiele;
}

function platzierungLesen(r: Raster) {
  // Die Spalte mit den meisten "n. Platz" ist die Endplatzierung
  const marken = finde(r, /^(\d+)\.\s*Platz$/);
  const proSpalte = new Map<number, typeof marken>();
  marken.forEach((m) => proSpalte.set(m.s, [...(proSpalte.get(m.s) ?? []), m]));
  const spalte = [...proSpalte.values()].sort((x, y) => y.length - x.length)[0] ?? [];
  const liste: { platz: number; name: string }[] = [];
  for (const m of spalte) {
    for (let s = m.s + 1; s <= m.s + 6; s++) {
      if (istName(zelle(r, m.z, s))) {
        liste.push({ platz: Number(m.treffer[1]), name: text(zelle(r, m.z, s)) });
        break;
      }
    }
  }
  return liste.sort((x, y) => x.platz - y.platz);
}

function gruppenplatzLesen(r: Raster, z0: number, s0: number, namen: string[]) {
  const kopf = (r[z0] ?? []).findIndex((wert, s) => s > s0 && /^Platz$/i.test(text(wert)));
  if (kopf < 0) return [];
  const liste: { platz: number; name: string }[] = [];
  for (let z = z0 + 1; z <= z0 + 16; z++) {
    const name = text(zelle(r, z, s0));
    const platz = zahl(zelle(r, z, kopf));
    if (namen.includes(name) && platz !== null && platz > 0) liste.push({ platz, name });
  }
  return liste.sort((x, y) => x.platz - y.platz);
}

export function abendLesen(r: Raster): Abend {
  const warnungen: string[] = [];
  const beschriftungen = finde(r, /^Teilnehmer Gruppe\s*(\d+)$/i);
  const gruppen: Abend['gruppen'] = [];
  const spiele: AbendSpiel[] = [];
  for (const b of beschriftungen) {
    const kennung = String.fromCharCode(64 + Number(b.treffer[1])); // 1 -> A
    const g = gruppeLesen(r, b.z, b.s, kennung, warnungen);
    if (g.namen.length === 0) continue;
    gruppen.push({ name: kennung, spieler: g.namen });
    spiele.push(...g.spiele);
  }
  spiele.push(...platzierungsspieleLesen(r, warnungen));
  let platzierung = platzierungLesen(r);
  // Nur eine Gruppe: keine Endplatzierung ausgefuellt, es gilt der Gruppenplatz
  // (Spalte "Platz" in der Zeile "Teilnehmer Gruppe 1")
  if (platzierung.length === 0 && beschriftungen.length > 0 && gruppen.length === 1) {
    platzierung = gruppenplatzLesen(r, beschriftungen[0].z, beschriftungen[0].s, gruppen[0].spieler);
    if (platzierung.length > 0) warnungen.push('Nur eine Gruppe: Endplatz = Platz in der Gruppe.');
  }
  const alle = gruppen.flatMap((g) => g.spieler);
  if (gruppen.length === 0) warnungen.push('Keine Gruppe gefunden ("Teilnehmer Gruppe 1").');
  if (platzierung.length === 0) warnungen.push('Keine Endplatzierung gefunden ("1. Platz").');
  const fehlend = alle.filter((n) => !platzierung.some((p) => p.name === n));
  if (platzierung.length > 0 && fehlend.length > 0) warnungen.push(`Ohne Endplatz: ${fehlend.join(', ')}.`);
  const fremd = platzierung.filter((p) => !alle.includes(p.name)).map((p) => p.name);
  if (gruppen.length > 0 && fremd.length > 0) warnungen.push(`In der Endplatzierung, aber in keiner Gruppe: ${fremd.join(', ')}.`);
  const hoechste = spiele.flatMap((s) => [s.ergA, s.ergB]);
  return { gruppen, spiele, platzierung, raceTo: hoechste.length ? Math.max(...hoechste) : null, warnungen };
}

// Datum aus dem Dateinamen: "2026-04-24_..." oder "2026-06_12_..." ->
// ISO-Datum; "Fr Serie_1.Liga_Juni 2026" -> nur Monat (Tag fehlt).
const MONATE = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];

export function datumAusDateiname(name: string): { datum: string | null; monat: string | null } {
  const voll = name.match(/(20\d{2})-(\d{2})[-_](\d{2})/);
  if (voll) return { datum: `${voll[1]}-${voll[2]}-${voll[3]}`, monat: `${voll[1]}-${voll[2]}` };
  const klein = name.toLowerCase().replace(/ä/g, 'ae');
  // "Juni 2026" oder "April 26"
  const jahrText = klein.match(/20\d{2}/)?.[0] ?? klein.match(/(?:^|[^\d])(\d{2})(?:[^\d]|$)/)?.[1] ?? null;
  const jahr = jahrText && jahrText.length === 2 ? `20${jahrText}` : jahrText;
  const nr = MONATE.findIndex((m) => klein.includes(m));
  if (nr >= 0 && jahr) return { datum: null, monat: `${jahr}-${String(nr + 1).padStart(2, '0')}` };
  return { datum: null, monat: null };
}

// Alle Namen eines Abends (Gruppen, Endplatzierung, Spiele)
export function namenDesAbends(a: Abend): string[] {
  return [
    ...new Set([...a.gruppen.flatMap((g) => g.spieler), ...a.platzierung.map((p) => p.name), ...a.spiele.flatMap((s) => [s.a, s.b])])
  ];
}

// Zuordnung der Excel-Namen ("Röbi", "Sebastian W.") zu vorhandenen
// Spielern: Anzeigename, voller Name, "Vorname N." oder ein eindeutiger
// Vorname. Sonst neu anlegen (als Gast; in der Vorschau aenderbar).
export type NamensWahl = 'neu-gast' | 'neu-mitglied' | 'weglassen' | string;
type Kandidat = { id: string; vorname: string; nachname: string; anzeigename: string | null };

export function namenVorschlagen(namen: string[], personen: Kandidat[]): Record<string, NamensWahl> {
  const klein = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const formen = (p: Kandidat) => {
    const liste = [`${p.vorname} ${p.nachname}`, p.anzeigename ?? ''];
    if (p.nachname) liste.push(`${p.vorname} ${p.nachname.charAt(0)}.`);
    return liste.map(klein).filter(Boolean);
  };
  const vorschlag: Record<string, NamensWahl> = {};
  for (const name of namen) {
    const n = klein(name);
    const genau = personen.filter((p) => formen(p).includes(n));
    const vorname = personen.filter((p) => klein(p.vorname) === n);
    vorschlag[name] = genau.length === 1 ? genau[0].id : genau.length === 0 && vorname.length === 1 ? vorname[0].id : 'neu-gast';
  }
  return vorschlag;
}

// Alle Freitage eines Monats ("2026-06" -> ["2026-06-05", ...]) als
// Schnellauswahl fuer Freitagsserien ohne Tag im Dateinamen
export function freitageImMonat(monat: string): string[] {
  const [jahr, m] = monat.split('-').map(Number);
  if (!jahr || !m) return [];
  const liste: string[] = [];
  for (let tag = 1; tag <= 31; tag++) {
    const d = new Date(Date.UTC(jahr, m - 1, tag));
    if (d.getUTCMonth() !== m - 1) break;
    if (d.getUTCDay() === 5) liste.push(`${monat}-${String(tag).padStart(2, '0')}`);
  }
  return liste;
}

// Disziplin aus dem Dateinamen, falls die Serie keine festlegt
export function disziplinAusDateiname(name: string): '8-ball' | '9-ball' | '10-ball' | null {
  const klein = name.toLowerCase().replace(/[\s_-]/g, '');
  if (klein.includes('10ball')) return '10-ball';
  if (klein.includes('9ball')) return '9-ball';
  if (klein.includes('8ball')) return '8-ball';
  return null;
}
