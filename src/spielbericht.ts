// Spielberichte des Verbands einlesen.
//
// Der BLVN veroeffentlicht jede Begegnung unter
// https://billard-niedersachsen.de/sb_spielbericht.php?p=... Die Seite zeigt
// eine Tabelle je Begegnung: acht Partien mit Disziplin, beiden Spielern,
// Ergebnis und Matchpunkt, bei 14.1 zusaetzlich Punkte, Aufnahmen und
// Hoechstserien.
//
// Hier steht nur die Auswertung des Textes. Das Holen der Seite uebernimmt die
// Funktion "spielbericht" bei Supabase (der Browser darf fremde Seiten nicht
// selbst lesen). Geprueft wird in test/spielbericht.test.ts.

import type { LigaDisziplin } from './liga';

const DISZIPLIN: Record<string, LigaDisziplin> = {
  '14/1e': '14-1',
  '14.1': '14-1',
  '8-ball': '8-ball',
  '9-ball': '9-ball',
  '10-ball': '10-ball'
};

export type BerichtPartie = {
  nr: number; // 1 bis 8 wie im Bericht
  runde: 'hin' | 'rueck';
  paarung: number; // 1 bis 4 innerhalb der Runde
  disziplin: LigaDisziplin;
  heim: string;
  gast: string;
  ergebnis: [number, number] | null; // Saetze, bei 14.1 der Partiepunkt
  punkte?: [number, number]; // nur 14.1
  aufnahmen?: number;
  hoechstserien?: [number, number];
};

export type Spielbericht = {
  heimMannschaft: string;
  gastMannschaft: string;
  datum: string | null; // ISO, aus TT.MM.JJJJ
  nummer: string | null; // Partie-Nr. des Verbands
  partien: BerichtPartie[];
  endstand: [number, number] | null;
};

const datumIso = (text: string): string | null => {
  const t = /(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
  return t ? `${t[3]}-${t[2]}-${t[1]}` : null;
};

// Eine Partiezeile, so wie sie im Bericht steht:
// "2\t8-Ball\tName Heim\t4:3\tName Gast\t1:0"
const PARTIE = /^(\d{1,2})\t([^\t]+)\t([^\t]*)\t(\d+)\s*:\s*(\d+)\t([^\t]*)\t(\d+)\s*:\s*(\d+)/;
// Zusatzzeile bei 14.1
const ZUSATZ = /Punkte:\s*(\d+)\s*:\s*(\d+)\s+Aufn\.:\s*(\d+)\s+HS:\s*(\d+)\s*\/\s*(\d+)/;

// Der Text der Berichtsseite (Zellen durch Tabulatoren getrennt, wie ihn
// spielberichtText() aus dem HTML baut).
export function spielberichtLesen(text: string): Spielbericht | null {
  const zeilen = text.split('\n').map((z) => z.replace(/\s+$/, ''));
  const kopf = zeilen.findIndex((z) => z.startsWith('Partie-Nr.'));
  if (kopf < 0) return null;

  // Zwischen Kopf und erster Runde stehen Nummer, Mannschaften und Datum -
  // je nach Seite in einer Zeile oder ueber mehrere verteilt, und die
  // Mannschaften stehen dort mehrfach. Deshalb alle Zellen einsammeln.
  const bisRunde = zeilen.findIndex((z, i) => i > kopf && /Runde\s*1/.test(z));
  const zellen = zeilen
    .slice(kopf + 1, bisRunde < 0 ? kopf + 12 : bisRunde)
    .flatMap((z) => z.split('\t'))
    .map((z) => z.trim())
    .filter(Boolean);
  const istNummer = (z: string) => /^\d+$/.test(z);
  const istDatum = (z: string) => /^\d{2}\.\d{2}\.\d{4}$/.test(z);
  const nummer = zellen.find(istNummer) ?? null;
  const datum = zellen.find(istDatum) ?? null;
  const namen = [...new Set(zellen.filter((z) => z !== ':' && !istNummer(z) && !istDatum(z)))];
  if (namen.length < 2) return null;

  const partien: BerichtPartie[] = [];
  let endstand: [number, number] | null = null;

  zeilen.forEach((zeile, i) => {
    const t = PARTIE.exec(zeile);
    if (t) {
      const disziplin = DISZIPLIN[t[2].trim().toLowerCase()] ?? DISZIPLIN[t[2].trim()];
      if (!disziplin) return;
      const nr = Number(t[1]);
      if (nr < 1 || nr > 8) return;
      const heim = t[3].trim();
      const gast = t[6].trim();
      const a = Number(t[4]);
      const b = Number(t[5]);
      const partie: BerichtPartie = {
        nr,
        runde: nr <= 4 ? 'hin' : 'rueck',
        paarung: nr <= 4 ? nr : nr - 4,
        disziplin,
        heim,
        gast,
        // Ohne Spieler und ohne Punkte ist die Partie noch nicht gespielt
        ergebnis: !heim && !gast && a === 0 && b === 0 ? null : [a, b]
      };
      if (disziplin === '14-1') {
        const z = ZUSATZ.exec(zeilen[i + 1] ?? '');
        if (z) {
          partie.punkte = [Number(z[1]), Number(z[2])];
          partie.aufnahmen = Number(z[3]);
          partie.hoechstserien = [Number(z[4]), Number(z[5])];
          // Bei 14.1 zaehlt der Punktestand, nicht der Matchpunkt
          partie.ergebnis = partie.punkte;
        } else if (a === 0 && b === 0) {
          partie.ergebnis = null;
        }
      }
      partien.push(partie);
      return;
    }
    const e = /^Endstand:\s*\t?\s*(\d+)\s*:\s*(\d+)/.exec(zeile);
    if (e) endstand = [Number(e[1]), Number(e[2])];
  });

  if (partien.length === 0) return null;
  return {
    heimMannschaft: namen[0],
    gastMannschaft: namen[1],
    datum: datum ? datumIso(datum) : null,
    nummer,
    partien: partien.sort((x, y) => x.nr - y.nr),
    endstand
  };
}

// Aus dem HTML der Berichtsseite denselben Text bauen, den der Browser
// anzeigen wuerde: je Tabellenzeile die Zellen durch Tabulatoren getrennt.
export function spielberichtText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const zeilen: string[] = [];
  doc.querySelectorAll('tr').forEach((tr) => {
    const zellen = [...tr.querySelectorAll('th, td')].map((z) => (z.textContent ?? '').replace(/\s+/g, ' ').trim());
    if (zellen.some((z) => z)) zeilen.push(zellen.join('\t'));
  });
  return zeilen.join('\n');
}

// ---------- Zuordnung zu unseren Personen ----------

const schluessel = (text: string) =>
  text
    .replace(/\s*\([^()]*\)\s*$/, '')
    .toLowerCase()
    .replace(/[^a-zäöüß ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export type NamePerson = { id: string; vorname: string; nachname: string; anzeigename: string | null };

// Sucht die Person zu einem Namen aus dem Bericht. Verglichen wird ohne
// Vereinszusatz, Gross- und Kleinschreibung; gefunden wird nur, wenn genau
// eine Person passt.
export function personZuName(name: string, personen: NamePerson[]): NamePerson | null {
  const gesucht = schluessel(name);
  if (!gesucht) return null;
  const treffer = personen.filter((p) => {
    const voll = `${p.vorname} ${p.nachname}`.trim();
    return schluessel(voll) === gesucht || (p.anzeigename ? schluessel(p.anzeigename) === gesucht : false);
  });
  return treffer.length === 1 ? treffer[0] : null;
}

// Vor- und Nachname aus dem Bericht trennen ("Max Mustermann")
export function nameTeilen(name: string): { vorname: string; nachname: string } {
  const teile = name.trim().replace(/\s+/g, ' ').split(' ');
  if (teile.length === 1) return { vorname: teile[0], nachname: '' };
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] };
}
