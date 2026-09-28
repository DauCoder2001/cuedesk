// Mannschaftspass des Landesverbands (Club-Cloud.de, z. B. BLVN) als PDF
// einlesen. Die PDF wird nur im Browser gelesen, hochgeladen wird sie nicht.
//
// Club-Cloud erzeugt die PDF mit FPDF: jede Tabellenzelle ist ein Rechteck
// ("x y b -h re B") mit einem Text darin ("BT x y Td (Text) Tj"). Aus den
// Rechtecken ergeben sich Zeilen und Spalten, aus dem Titel Verein und Saison.

import { LIGEN } from './liga';
import type { LigaKennung } from './liga';

export type PdfText = {
  seite: number;
  x: number; // linker Rand der Zelle, sonst Textanfang
  y: number; // Oberkante der Zelle, sonst Grundlinie
  zelle: boolean; // steht in einer Tabellenzelle
  text: string;
};

export type PassSpieler = {
  vorname: string;
  nachname: string;
  passnummer: string | null;
  dbu_nummer: string | null;
  berechtigt_ab: string | null; // ISO-Datum
  kapitaen: boolean;
  position: number; // Reihenfolge in der Mannschaft, ab 1
};

export type PassMannschaft = {
  nummer: number; // Spalte "Team"
  ligaText: string; // Ueberschrift ohne Spiellokal, z. B. "Kreisklasse OH / A"
  liga: LigaKennung | null;
  staffel: string | null;
  spieler: PassSpieler[];
};

export type Mannschaftspass = {
  verein: string; // wie im Titel, z. B. "PBC Bassum"
  saison: string; // "2026/27"
  mannschaften: PassMannschaft[];
};

export const KEIN_PASS =
  'In der Datei wurde kein Mannschaftspass gefunden. Eingelesen werden kann der „PDF-Mannschaftspass“ aus Club-Cloud (z. B. BLVN), keine eingescannten Dokumente.';

// ---------- PDF: Texte aus den Seiteninhalten ----------

// Klammertext einer PDF-Zeichenkette entschluesseln: \( \) \\ und \ddd
function zeichenkette(roh: string): string {
  return roh.replace(/\\([0-7]{1,3}|.)/g, (_, z: string) => {
    if (/^[0-7]+$/.test(z)) return String.fromCharCode(parseInt(z, 8));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[z] ?? z;
  });
}

// Texte eines Seiteninhalts. Ein Text direkt nach einem Rechteck gehoert zu
// dieser Zelle und bekommt deren Lage.
export function inhaltTexte(inhalt: string, seite: number): PdfText[] {
  const muster =
    /(?:(-?[\d.]+) (-?[\d.]+) -?[\d.]+ -?[\d.]+ re B q [\d.]+ g )?BT (-?[\d.]+) (-?[\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj/g;
  const texte: PdfText[] = [];
  for (const m of inhalt.matchAll(muster)) {
    const zelle = m[1] !== undefined;
    texte.push({
      seite,
      x: Number(zelle ? m[1] : m[3]),
      y: Number(zelle ? m[2] : m[4]),
      zelle,
      text: zeichenkette(m[5]).trim()
    });
  }
  return texte;
}

async function entpacken(daten: Uint8Array): Promise<Uint8Array> {
  const strom = new Blob([daten as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(strom).arrayBuffer());
}

// Alle Texte der PDF, Seite fuer Seite (je Inhaltsstrom eine Seite)
export async function pdfTexte(bytes: Uint8Array): Promise<PdfText[]> {
  const latin = new TextDecoder('latin1');
  const roh = latin.decode(bytes);
  const texte: PdfText[] = [];
  let seite = 0;
  let pos = 0;
  const suche = /(?<!end)stream\r?\n/g;
  for (;;) {
    suche.lastIndex = pos;
    const treffer = suche.exec(roh);
    if (!treffer) break;
    const start = treffer.index + treffer[0].length;
    const ende = roh.indexOf('endstream', start);
    if (ende < 0) break;
    pos = ende + 9;
    // Beschreibung des Stroms: vom Objektanfang bis zum Wort "stream"
    const woerterbuch = roh.slice(Math.max(0, roh.lastIndexOf(' obj', treffer.index)), treffer.index);
    if (/\/Subtype\s*\/Image/.test(woerterbuch)) continue;
    // Laenge aus /Length; sonst bis "endstream" ohne den Zeilenumbruch davor
    const laenge = /\/Length (\d+)(?!\s+\d+\s+R)/.exec(woerterbuch);
    let bis = ende;
    if (laenge && start + Number(laenge[1]) <= ende) bis = start + Number(laenge[1]);
    else while (bis > start && (roh[bis - 1] === '\n' || roh[bis - 1] === '\r')) bis--;
    let daten = bytes.subarray(start, bis);
    if (/\/FlateDecode/.test(woerterbuch)) {
      try {
        daten = await entpacken(daten);
      } catch {
        continue;
      }
    }
    const inhalt = latin.decode(daten);
    if (!/\bTj\b/.test(inhalt)) continue;
    seite++;
    texte.push(...inhaltTexte(inhalt, seite));
  }
  return texte;
}

// ---------- Mannschaftspass aus den Texten ----------

const SPALTEN: [string, RegExp][] = [
  ['team', /^Team$/i],
  ['name', /^Name/i],
  ['pass', /^Pass/i],
  ['dbu', /^DBU/i],
  ['berechtigt', /^Berechtigt/i],
  ['kapitaen', /^Kapit/i]
];

// "Kreisklasse OH / A" -> Liga kreisklasse, Staffel "OH / A"
export function ligaTeilen(text: string): { liga: LigaKennung | null; staffel: string | null } {
  const sauber = text.trim();
  for (const [kennung, eintrag] of Object.entries(LIGEN) as [LigaKennung, (typeof LIGEN)[LigaKennung]][]) {
    if (sauber.toLowerCase().startsWith(eintrag.name.toLowerCase())) {
      const rest = sauber.slice(eintrag.name.length).trim();
      return { liga: kennung, staffel: rest || null };
    }
  }
  return { liga: null, staffel: sauber || null };
}

const isoDatum = (text: string): string | null => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function mannschaftspassLesen(texte: PdfText[]): Mannschaftspass | null {
  // Zeilen: gleiche Seite und gleiche Hoehe, von oben nach unten
  const zeilen = new Map<string, PdfText[]>();
  for (const t of texte) {
    const schluessel = `${t.seite}|${t.y.toFixed(1)}`;
    zeilen.set(schluessel, [...(zeilen.get(schluessel) ?? []), t]);
  }
  const reihenfolge = [...zeilen.values()]
    .map((z) => z.sort((a, b) => a.x - b.x))
    .sort((a, b) => a[0].seite - b[0].seite || b[0].y - a[0].y);

  let verein: string | null = null;
  let saison: string | null = null;
  let spalten: { schluessel: string; x: number }[] = [];
  let ligaText = '';
  const mannschaften = new Map<number, PassMannschaft>();

  for (const zeile of reihenfolge) {
    const titel = zeile
      .map((t) => /Mannschaftspass\s+(.+?)\s*\((\d{4})\/(\d{4})\)/.exec(t.text))
      .find(Boolean);
    if (titel) {
      verein = titel[1].trim();
      saison = `${titel[2]}/${titel[3].slice(2)}`;
      continue;
    }
    const zellen = zeile.filter((t) => t.zelle);
    if (zellen.length === 0) continue;

    // Kopfzeile der Tabelle
    const kopf = zellen.map((t) => SPALTEN.find(([, muster]) => muster.test(t.text))?.[0]);
    if (kopf.includes('team') && kopf.includes('name')) {
      spalten = zellen.flatMap((t, i) => (kopf[i] ? [{ schluessel: kopf[i] as string, x: t.x }] : []));
      continue;
    }
    // Ueberschrift einer Mannschaft: eine einzelne Zelle ueber die ganze Breite
    if (zellen.length === 1 && !/^\d+$/.test(zellen[0].text)) {
      ligaText = zellen[0].text.replace(/\s*\([^()]*\)\s*$/, '').trim();
      continue;
    }
    if (spalten.length === 0) continue;

    // Spielerzeile: jeder Text in die Spalte mit dem naechsten linken Rand
    const werte: Record<string, string> = {};
    for (const t of zellen) {
      const spalte = spalten.reduce((beste, s) => (Math.abs(s.x - t.x) < Math.abs(beste.x - t.x) ? s : beste));
      if (Math.abs(spalte.x - t.x) < 3) werte[spalte.schluessel] = t.text;
    }
    const nummer = Number(werte.team);
    if (!Number.isInteger(nummer) || nummer < 1 || !werte.name) continue;
    const [nachname, ...rest] = werte.name.split(',');
    let mannschaft = mannschaften.get(nummer);
    if (!mannschaft) {
      mannschaft = { nummer, ligaText, ...ligaTeilen(ligaText), spieler: [] };
      mannschaften.set(nummer, mannschaft);
    }
    mannschaft.spieler.push({
      vorname: rest.join(',').trim(),
      nachname: nachname.trim(),
      passnummer: werte.pass?.trim() || null,
      dbu_nummer: werte.dbu?.trim() || null,
      berechtigt_ab: werte.berechtigt ? isoDatum(werte.berechtigt) : null,
      kapitaen: Boolean(werte.kapitaen?.trim()),
      position: mannschaft.spieler.length + 1
    });
  }

  if (!verein || !saison || mannschaften.size === 0) return null;
  return { verein, saison, mannschaften: [...mannschaften.values()].sort((a, b) => a.nummer - b.nummer) };
}

// ---------- Abgleich mit den Spielern des Vereins ----------

export type Treffer =
  | { art: 'dbu' | 'pass'; person_id: string } // sicher erkannt
  | { art: 'name' | 'aehnlich'; person_id: string } // nur ueber den Namen, zu pruefen
  | { art: 'neu' };

type VorhandenePerson = {
  id: string;
  vorname: string;
  nachname: string;
  passnummer: string | null;
  dbu_nummer: string | null;
};

const klein = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

// Erst die DBU-Nr., dann die Pass-Nr., dann der Name. "Heiner W." gilt als
// aehnlich zu "Heiner Wessel". Wer schon eine andere DBU-Nr. hat, ist es nicht.
export function spielerAbgleichen(spieler: PassSpieler, personen: VorhandenePerson[]): Treffer {
  if (spieler.dbu_nummer) {
    const p = personen.find((x) => x.dbu_nummer?.trim() === spieler.dbu_nummer);
    if (p) return { art: 'dbu', person_id: p.id };
  }
  if (spieler.passnummer) {
    const p = personen.find((x) => x.passnummer?.trim() === spieler.passnummer);
    if (p) return { art: 'pass', person_id: p.id };
  }
  const frei = personen.filter((x) => !x.dbu_nummer || !spieler.dbu_nummer || x.dbu_nummer.trim() === spieler.dbu_nummer);
  const gleich = frei.find(
    (x) => klein(x.vorname) === klein(spieler.vorname) && klein(x.nachname) === klein(spieler.nachname)
  );
  if (gleich) return { art: 'name', person_id: gleich.id };
  const kurz = frei.find((x) => {
    const nach = klein(x.nachname).replace(/\.$/, '');
    return (
      klein(x.vorname) === klein(spieler.vorname) &&
      nach.length > 0 &&
      nach.length <= 2 &&
      klein(spieler.nachname).startsWith(nach)
    );
  });
  if (kurz) return { art: 'aehnlich', person_id: kurz.id };
  return { art: 'neu' };
}
