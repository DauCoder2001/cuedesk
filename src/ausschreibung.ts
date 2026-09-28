// Ausschreibung eines Turniers: Angaben in turniere.einstellungen.ausschreibung,
// daraus der Text zum Teilen (WhatsApp, E-Mail) und ein Aushang als PDF.
// Zeiten gelten in der Zeitzone des Browsers; der Meldeschluss wird mit
// Zeitzone gespeichert (ISO), damit die Datenbank ihn pruefen kann.

import { bauen, linie, neuesDokument, PDF_BREITE, PDF_RAND, text, textbreite } from './pdf';

export type Ausschreibung = {
  uhrzeit?: string; // Beginn, "19:00"
  meldeschluss?: string; // ISO mit Zeitzone
  startgeld?: string; // frei, z. B. "5 €"
  hoechstens?: number; // Hoechstzahl der Teilnehmer
  hinweis?: string;
  offen?: boolean; // Anmeldung fuer Mitglieder offen (Teil 2)
};

export type AusschreibungDaten = {
  verein: string;
  name: string;
  datum: string; // ISO-Datum des Turniers
  art?: string; // Turnierart
  spielweise: string; // z. B. "9-Ball · Gruppen mit KO · Race to 5 · mit Vorgabe"
  ausschreibung: Ausschreibung;
  link?: string; // Anmeldelink (Teil 2)
};

export const UHRZEIT = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Vorschlag wie in Pool-TS: eine Stunde vor Beginn
export function meldeschlussVorschlag(datum: string, uhrzeit: string): string | null {
  if (!UHRZEIT.test(uhrzeit)) return null;
  const beginn = new Date(`${datum}T${uhrzeit.padStart(5, '0')}:00`);
  return new Date(beginn.getTime() - 60 * 60 * 1000).toISOString();
}

// Wert fuer <input type="datetime-local"> und zurueck
export function alsEingabe(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
export function ausEingabe(wert: string): string | undefined {
  if (!wert) return undefined;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const tagLang = (datum: string) =>
  new Date(`${datum}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

// "18:00 Uhr" am Turniertag, sonst "Do., 08.10. 18:00 Uhr"
export function meldeschlussText(iso: string, turnierDatum: string): string {
  const d = new Date(iso);
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const z = (n: number) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  if (tag === turnierDatum) return `${uhr} Uhr`;
  const kurz = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${kurz} ${uhr} Uhr`;
}

// Die Zeilen der Ausschreibung, ohne Titel; gemeinsam fuer Text und Aushang
export function ausschreibungZeilen(d: AusschreibungDaten): string[] {
  const a = d.ausschreibung;
  const zeilen: string[] = [];
  if (d.art && !d.name.toLowerCase().includes(d.art.toLowerCase())) zeilen.push(d.art);
  zeilen.push(`${tagLang(d.datum)}${a.uhrzeit ? `, Beginn ${a.uhrzeit} Uhr` : ''}`);
  zeilen.push(d.spielweise);
  if (a.meldeschluss) zeilen.push(`Meldeschluss: ${meldeschlussText(a.meldeschluss, d.datum)}`);
  if (a.startgeld?.trim()) zeilen.push(`Startgeld: ${a.startgeld.trim()}`);
  if (a.hoechstens && a.hoechstens > 0) zeilen.push(`Höchstens ${a.hoechstens} Teilnehmer`);
  return zeilen;
}

// Text fuer WhatsApp und E-Mail. *Sternchen* macht in WhatsApp fett.
export function ausschreibungText(d: AusschreibungDaten): string {
  const teile = [`*${d.name}*`, ...ausschreibungZeilen(d)];
  if (d.ausschreibung.hinweis?.trim()) teile.push('', d.ausschreibung.hinweis.trim());
  teile.push('');
  teile.push(d.link ? `Anmelden: ${d.link}` : 'Wer ist dabei? Bitte bis zum Meldeschluss melden.');
  teile.push('Gut Stoß!');
  return teile.join('\n');
}

// Lange Zeilen fuer den Aushang umbrechen
export function umbrechen(inhalt: string, breite: number, groesse: number, fett: boolean): string[] {
  const zeilen: string[] = [];
  for (const absatz of inhalt.split('\n')) {
    let zeile = '';
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (zeile && textbreite(probe, groesse, fett) > breite) {
        zeilen.push(zeile);
        zeile = wort;
      } else zeile = probe;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

// Aushang: eine A4-Seite mit den Angaben und Zeilen zum Eintragen
export function aushangPdf(d: AusschreibungDaten): Uint8Array {
  const dok = neuesDokument();
  const breite = PDF_BREITE - 2 * PDF_RAND;
  text(dok, d.verein, PDF_RAND, breite, 11, false, 'links', 0.35);
  dok.y -= 34;
  for (const z of umbrechen(d.name, breite, 26, true)) {
    text(dok, z, PDF_RAND, breite, 26, true);
    dok.y -= 32;
  }
  dok.y -= 4;
  for (const z of ausschreibungZeilen(d)) {
    for (const teil of umbrechen(z, breite, 14, false)) {
      text(dok, teil, PDF_RAND, breite, 14, false);
      dok.y -= 21;
    }
  }
  if (d.ausschreibung.hinweis?.trim()) {
    dok.y -= 6;
    for (const teil of umbrechen(d.ausschreibung.hinweis.trim(), breite, 12, false)) {
      text(dok, teil, PDF_RAND, breite, 12, false, 'links', 0.25);
      dok.y -= 17;
    }
  }
  dok.y -= 18;
  text(dok, 'Eintragen', PDF_RAND, breite, 14, true);
  dok.y -= 10;
  // So viele Zeilen, wie auf die Seite passen, hoechstens die Hoechstzahl
  const zeilenhoehe = 26;
  const passen = Math.floor((dok.y - PDF_RAND - 20) / zeilenhoehe);
  const anzahl = Math.max(1, Math.min(passen, d.ausschreibung.hoechstens || passen));
  for (let i = 1; i <= anzahl; i++) {
    dok.y -= zeilenhoehe;
    text(dok, `${i}.`, PDF_RAND, 24, 11, false, 'rechts', 0.35);
    linie(dok, PDF_RAND + 32, dok.y - 3, PDF_BREITE - PDF_RAND, dok.y - 3, 0.5, 0.6);
  }
  return bauen(dok, `Ausschreibung ${d.name}`);
}

export function aushangDateiname(name: string, datum: string): string {
  const sauber = name
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `Ausschreibung_${datum}_${sauber || 'Turnier'}.pdf`;
}
