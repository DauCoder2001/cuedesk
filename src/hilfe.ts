// Hilfe fuer die Anwender (Seite "Hilfe", Knopf "?" oben rechts). Die Texte
// stehen als Markdown in hilfe/*.md und werden beim Bau eingebettet
// (src/hilfe-texte.ts). Hier nur Rechnung ohne Datenbank: Kopf lesen, Text in
// Bloecke zerlegen, Themen nach Rolle und Seite waehlen, suchen, Handout und
// Handbuch als PDF. Abgesichert durch test/hilfe.test.ts.
//
// Erlaubtes Markdown: ## und ### Ueberschriften, Absaetze, "- " Listen,
// "1. " Listen, **fett**, `Code`, [Text](Adresse).

import { bauen, fliesstext, neuesDokument, platz, ueberschrift } from './pdf';

export type Teil = { art: 'text' | 'fett' | 'code'; text: string } | { art: 'link'; text: string; ziel: string };
export type Block =
  | { art: 'h2'; teile: Teil[] }
  | { art: 'h3'; teile: Teil[] }
  | { art: 'p'; teile: Teil[] }
  | { art: 'ul'; punkte: Teil[][] }
  | { art: 'ol'; punkte: Teil[][] };

export type Thema = {
  id: string;
  titel: string;
  rollen: string[]; // 'alle', 'mitglied', 'turnierleiter', 'sportwart', 'vereinsadmin', 'superadmin'
  seiten: string[]; // Bereiche aus src/App.tsx, fuer die Kontexthilfe
  reihenfolge: number;
  // Zusaetzliches Dokument zum Thema, Kopfzeile "anhang: Knopftext | datei.pdf";
  // die Datei liegt in public/hilfe/
  anhang?: { text: string; datei: string };
  bloecke: Block[];
  roh: string; // Text ohne Kopf, fuer die Suche
};

// ---------- Lesen ----------

const liste = (wert: string | undefined) =>
  (wert ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

// "turnier.md" + Inhalt -> Thema. Der Kopf steht zwischen zwei Zeilen "---".
export function themaLesen(dateiname: string, inhalt: string): Thema {
  const text = inhalt.replace(/\r\n/g, '\n');
  const kopf: Record<string, string> = {};
  let rumpf = text;
  const treffer = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (treffer) {
    treffer[1].split('\n').forEach((zeile) => {
      const i = zeile.indexOf(':');
      if (i > 0) kopf[zeile.slice(0, i).trim()] = zeile.slice(i + 1).trim();
    });
    rumpf = text.slice(treffer[0].length);
  }
  const id = dateiname.replace(/^.*\//, '').replace(/\.md$/, '');
  const [anhangText, anhangDatei] = (kopf.anhang ?? '').split('|').map((x) => x.trim());
  return {
    id,
    titel: kopf.titel || id,
    rollen: liste(kopf.rollen).length ? liste(kopf.rollen) : ['alle'],
    seiten: liste(kopf.seiten),
    reihenfolge: Number(kopf.reihenfolge) || 999,
    ...(anhangText && anhangDatei ? { anhang: { text: anhangText, datei: anhangDatei } } : {}),
    bloecke: bloecke(rumpf),
    roh: rumpf
  };
}

// Inline: **fett**, `Code`, [Text](Adresse); alles andere ist Text
export function teile(zeile: string): Teil[] {
  const aus: Teil[] = [];
  const muster = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let pos = 0;
  for (const m of zeile.matchAll(muster)) {
    if (m.index > pos) aus.push({ art: 'text', text: zeile.slice(pos, m.index) });
    if (m[1] !== undefined) aus.push({ art: 'fett', text: m[1] });
    else if (m[2] !== undefined) aus.push({ art: 'code', text: m[2] });
    else aus.push({ art: 'link', text: m[3], ziel: m[4] });
    pos = m.index + m[0].length;
  }
  if (pos < zeile.length) aus.push({ art: 'text', text: zeile.slice(pos) });
  return aus;
}

export function bloecke(markdown: string): Block[] {
  const aus: Block[] = [];
  let absatz: string[] = [];
  const absatzEnde = () => {
    if (absatz.length) aus.push({ art: 'p', teile: teile(absatz.join(' ')) });
    absatz = [];
  };
  for (const roh of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const zeile = roh.trim();
    const liste = /^(-|\d+\.)\s+(.*)$/.exec(zeile);
    if (!zeile) {
      absatzEnde();
    } else if (zeile.startsWith('### ')) {
      absatzEnde();
      aus.push({ art: 'h3', teile: teile(zeile.slice(4)) });
    } else if (zeile.startsWith('## ')) {
      absatzEnde();
      aus.push({ art: 'h2', teile: teile(zeile.slice(3)) });
    } else if (liste) {
      absatzEnde();
      const art = liste[1] === '-' ? 'ul' : 'ol';
      const letzter = aus[aus.length - 1];
      if (letzter && letzter.art === art) letzter.punkte.push(teile(liste[2]));
      else aus.push({ art, punkte: [teile(liste[2])] });
    } else if (/^\s{2,}\S/.test(roh) && aus.length && (aus[aus.length - 1].art === 'ul' || aus[aus.length - 1].art === 'ol')) {
      // eingerueckte Fortsetzung eines Listenpunkts
      const l = aus[aus.length - 1] as { punkte: Teil[][] };
      l.punkte[l.punkte.length - 1].push({ art: 'text', text: ' ' }, ...teile(zeile));
    } else {
      absatz.push(zeile);
    }
  }
  absatzEnde();
  return aus;
}

export const reinText = (t: Teil[]) => t.map((x) => x.text).join('');

// ---------- Auswahl ----------

export function nachReihenfolge(themen: Thema[]): Thema[] {
  return [...themen].sort((a, b) => a.reihenfolge - b.reihenfolge || a.titel.localeCompare(b.titel, 'de'));
}

// Eigene Themen (passend zu den Rollen) zuerst, der Rest unter "Alle Themen"
export function themenFuer(themen: Thema[], rollen: string[], istSuperAdmin: boolean): { eigene: Thema[]; weitere: Thema[] } {
  const passt = (t: Thema) =>
    t.rollen.includes('alle') ||
    t.rollen.some((r) => rollen.includes(r)) ||
    (istSuperAdmin && t.rollen.includes('superadmin'));
  const sortiert = nachReihenfolge(themen);
  return { eigene: sortiert.filter(passt), weitere: sortiert.filter((t) => !passt(t)) };
}

// Kontexthilfe: das Thema zur Seite, eigene Themen bevorzugt
export function themaZurSeite(themen: Thema[], bereich: string, eigene: Thema[] = []): Thema | null {
  return (
    nachReihenfolge(eigene).find((t) => t.seiten.includes(bereich)) ??
    nachReihenfolge(themen).find((t) => t.seiten.includes(bereich)) ??
    null
  );
}

export function suchen(themen: Thema[], begriff: string): Thema[] {
  const b = begriff.trim().toLowerCase();
  if (!b) return nachReihenfolge(themen);
  return nachReihenfolge(themen).filter((t) => t.titel.toLowerCase().includes(b) || t.roh.toLowerCase().includes(b));
}

// ---------- PDF ----------

// Zeichen, die die PDF-Schrift (WinAnsi) nicht kennt, ersetzen
export function pdfTauglich(text: string): string {
  return text
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/✕/g, 'x')
    .replace(/✓/g, 'OK')
    .replace(/[←-⯿\u{1f000}-\u{1faff}️]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function themaInsPdf(dok: ReturnType<typeof neuesDokument>, thema: Thema, mitNeuerSeite: boolean) {
  ueberschrift(dok, pdfTauglich(thema.titel), 16, mitNeuerSeite);
  for (const b of thema.bloecke) {
    if (b.art === 'h2') ueberschrift(dok, pdfTauglich(reinText(b.teile)), 12.5);
    else if (b.art === 'h3') ueberschrift(dok, pdfTauglich(reinText(b.teile)), 10.5);
    else if (b.art === 'p') {
      fliesstext(dok, pdfTauglich(reinText(b.teile)), 10);
      dok.y -= 4;
    } else if (b.art === 'ul' || b.art === 'ol') {
      b.punkte.forEach((p, i) => fliesstext(dok, pdfTauglich(reinText(p)), 10, { marke: b.art === 'ol' ? `${i + 1}.` : '•' }));
      dok.y -= 4;
    }
  }
}

function kopfzeile(dok: ReturnType<typeof neuesDokument>, vereinName: string) {
  platz(dok, 20);
  fliesstext(dok, pdfTauglich(`CueDesk-Hilfe · ${vereinName}`), 8.5);
  dok.y -= 2;
}

export function handoutPdf(thema: Thema, vereinName: string): Uint8Array<ArrayBuffer> {
  const dok = neuesDokument();
  kopfzeile(dok, vereinName);
  themaInsPdf(dok, thema, false);
  return bauen(dok, pdfTauglich(`CueDesk-Hilfe: ${thema.titel}`));
}

export function handbuchPdf(themen: Thema[], vereinName: string): Uint8Array<ArrayBuffer> {
  const dok = neuesDokument();
  kopfzeile(dok, vereinName);
  ueberschrift(dok, 'CueDesk – Benutzerhandbuch', 20);
  nachReihenfolge(themen).forEach((t, i) => fliesstext(dok, pdfTauglich(`${i + 1}. ${t.titel}`), 11));
  nachReihenfolge(themen).forEach((t) => themaInsPdf(dok, t, true));
  return bauen(dok, 'CueDesk – Benutzerhandbuch');
}

export const dateiName = (titel: string) =>
  `CueDesk-Hilfe_${titel.replace(/[^A-Za-z0-9äöüÄÖÜß]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
