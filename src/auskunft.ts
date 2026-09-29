// Auskunft fuer einen einzelnen Spieler (Art. 15 und 20 DSGVO). Die Daten
// liefert die Datenbankfunktion person_auskunft (Stufe 21); hier entstehen
// daraus ein PDF zum Lesen und der Dateiname. Reine Rechnung, abgesichert durch
// test/auskunft.test.ts; Abruf und Download in src/seiten/AuskunftKnoepfe.tsx.

import { absatz, bauen, neuesDokument, neueSeite, PDF_BREITE, PDF_RAND, tabelle, text, ueberschrift } from './pdf';
import type { PdfDokument } from './pdf';
import { umbrechen } from './ausschreibung';
import { rundeText } from './archiv';

type Wert = string | number | boolean | null;
type Satz = Record<string, Wert | undefined>;

export type Auskunft = {
  erstellt_am: string;
  verein: string;
  person: Satz & { vorname: string; nachname: string };
  vertraulich: Satz | null;
  konten: { email: string | null; anzeigename: string | null; erstellt_am: string; angemeldet_am: string | null; passwort_festgelegt: boolean; rollen: string[] }[];
  turniere: { name: string; datum: string; disziplin: string; modus: string; status: string; startnummer: number | null; gruppe: string | null; endplatz: number | null }[];
  anmeldungen: { turnier: string; datum: string; angemeldet_am: string; abgemeldet_am: string | null }[];
  mannschaften: { name: string; saison: string; liga: string | null; staffel: string | null; stammspieler: boolean; kapitaen: boolean; berechtigt_ab: string | null }[];
  partien: {
    datum: string;
    turnier: string | null;
    disziplin: string;
    phase: string | null;
    gruppe: string | null;
    gegner: string | null;
    eigene: number | null;
    gegner_ergebnis: number | null;
    vorgabe_eigen: number;
    vorgabe_gegner: number;
    status: string;
  }[];
  aufnahmen_141: unknown[];
  rating: { stichtag: string; disziplin: string; wert: number; racks: number; quelle: string }[];
  aenderungen: { zeitpunkt: string; tabelle: string; aktion: string; vorher: Satz | null; nachher: Satz | null }[];
  aenderungen_durch_konto: Record<string, number>;
};

const DISZIPLIN: Record<string, string> = {
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball',
  'multi-ball': 'Multi-Ball',
  '14-1': '14.1',
  gesamt: 'gesamt'
};
const ROLLE: Record<string, string> = {
  vereinsadmin: 'Vereins-Administrator',
  sportwart: 'Sportwart',
  turnierleiter: 'Turnierleiter',
  mitglied: 'Mitglied'
};
const STATUS: Record<string, string> = { mitglied: 'Mitglied', gast: 'Gast', ausgetreten: 'Ausgetreten' };
const BEREICH: Record<string, string> = {
  personen: 'Angaben zur Person',
  personen_intern: 'Vertrauliche Angaben',
  benutzer_personen: 'Verknüpfung mit Konto',
  einladungen: 'Einladung',
  turnier_anmeldungen: 'Turnier-Anmeldung',
  mannschaft_spieler: 'Kader',
  turnier_teilnehmer: 'Turnierteilnahmen',
  partien: 'Partien',
  turniere: 'Turniere'
};
const FELD: Record<string, string> = {
  vorname: 'Vorname',
  nachname: 'Nachname',
  anzeigename: 'Anzeigename',
  kuerzel: 'Kürzel',
  status: 'Status',
  name_oeffentlich: 'Name öffentlich',
  rating_ausgeblendet: 'Rating ausgeblendet',
  eintritt: 'Eintritt',
  austritt: 'Austritt',
  minderjaehrig: 'Minderjährig',
  rating_startwert: 'Rating-Startwert',
  passnummer: 'Pass-Nr.',
  dbu_nummer: 'DBU-Nr.',
  notiz: 'Notiz',
  stammspieler: 'Stammspieler',
  kapitaen: 'Kapitän',
  abgemeldet_am: 'abgemeldet am',
  angenommen_am: 'angenommen am',
  rollen: 'Rollen',
  email: 'E-Mail'
};
// Technische Felder, die in der Liste der Aenderungen nichts sagen
const TECHNISCH = new Set(['id', 'verein_id', 'person_id', 'benutzer_id', 'erstellt_am', 'geaendert_am', 'turnier_id', 'mannschaft_id']);

export function datumText(iso: string | null | undefined, mitZeit = false): string {
  if (!iso) return '–';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const tag = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return mitZeit ? `${tag} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : tag;
}

function wertText(w: Wert | undefined): string {
  if (w === null || w === undefined || w === '') return '–';
  if (typeof w === 'boolean') return w ? 'ja' : 'nein';
  if (typeof w === 'string' && /^\d{4}-\d{2}-\d{2}/.test(w)) return datumText(w, w.length > 10);
  return String(w);
}

// Was sich in einem Eintrag des Aenderungsprotokolls geaendert hat
export function aenderungText(e: Auskunft['aenderungen'][number]): string {
  if (e.aktion === 'insert') return 'angelegt';
  if (e.aktion === 'delete') return 'gelöscht';
  const vorher = e.vorher ?? {};
  const nachher = e.nachher ?? {};
  const teile = Object.keys(nachher)
    .filter((k) => !TECHNISCH.has(k) && JSON.stringify(vorher[k]) !== JSON.stringify(nachher[k]))
    // "von ... auf ...": ein Pfeil ist in der PDF-Standardschrift nicht darstellbar
    .map((k) => `${FELD[k] ?? k}: von ${wertText(vorher[k])} auf ${wertText(nachher[k])}`);
  return teile.length ? teile.join('; ') : 'ohne sichtbare Änderung';
}

// Neuester Rating-Wert je Disziplin
export function aktuellesRating(rating: Auskunft['rating']): Auskunft['rating'] {
  const neueste = new Map<string, Auskunft['rating'][number]>();
  rating.forEach((r) => {
    const bisher = neueste.get(r.disziplin);
    if (!bisher || r.stichtag > bisher.stichtag) neueste.set(r.disziplin, r);
  });
  return [...neueste.values()].sort((a, b) => a.disziplin.localeCompare(b.disziplin));
}

// Voller Name fuer Kopf und Dateiname; der Anzeigename steht in der Tabelle
export function auskunftName(a: Auskunft): string {
  const p = a.person;
  return `${p.vorname} ${p.nachname}`.trim() || (typeof p.anzeigename === 'string' ? p.anzeigename : '');
}

export function auskunftDateiname(a: Auskunft, endung: 'pdf' | 'json'): string {
  const sauber = auskunftName(a)
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `Auskunft_${a.erstellt_am.slice(0, 10)}_${sauber || 'Spieler'}.${endung}`;
}

// Mehrzeiliger Absatz in normaler Schrift
function fliesstext(dok: PdfDokument, inhalt: string): void {
  const breite = PDF_BREITE - 2 * PDF_RAND;
  for (const zeile of umbrechen(inhalt, breite, 9, false)) {
    if (dok.y - 13 < PDF_RAND + 24) neueSeite(dok);
    text(dok, zeile, PDF_RAND, breite, 9, false);
    dok.y -= 13;
  }
  dok.y -= 4;
}

function leer(dok: PdfDokument, hinweis: string) {
  absatz(dok, hinweis);
}

export function auskunftPdf(a: Auskunft): Uint8Array {
  const dok = neuesDokument();
  const name = auskunftName(a);
  ueberschrift(dok, 'Auskunft über gespeicherte Daten', 16);
  absatz(dok, `${name} · ${a.verein} · erstellt am ${datumText(a.erstellt_am, true)}`);
  fliesstext(
    dok,
    'Diese Auskunft nach Art. 15 DSGVO enthält die Daten, die CueDesk zu dieser Person speichert. Dieselben Daten ' +
      'vollständig und maschinenlesbar enthält die JSON-Datei (Art. 20 DSGVO), dort auch jede einzelne 14.1-Aufnahme ' +
      'und den Verlauf des Ratings.'
  );

  const p = a.person;
  ueberschrift(dok, 'Angaben zur Person', 11);
  tabelle(dok, [{ text: 'Feld' }, { text: 'Wert' }], [
    ['Vorname', wertText(p.vorname)],
    ['Nachname', wertText(p.nachname)],
    ['Anzeigename', wertText(p.anzeigename)],
    ['Kürzel', wertText(p.kuerzel)],
    ['Status', STATUS[String(p.status)] ?? wertText(p.status)],
    ['Name darf öffentlich erscheinen', wertText(p.name_oeffentlich)],
    ['Im Rating ausgeblendet', wertText(p.rating_ausgeblendet)],
    ['Angelegt', wertText(p.erstellt_am)],
    ['Zuletzt geändert', wertText(p.geaendert_am)],
    ...(p.anonymisiert_am ? [['Anonymisiert', wertText(p.anonymisiert_am)]] : [])
  ]);

  ueberschrift(dok, 'Vertrauliche Angaben (nur für die Vereinsleitung sichtbar)', 11);
  if (a.vertraulich) {
    const v = a.vertraulich;
    tabelle(dok, [{ text: 'Feld' }, { text: 'Wert' }], [
      ['Eintritt', wertText(v.eintritt)],
      ['Austritt', wertText(v.austritt)],
      ['Minderjährig', wertText(v.minderjaehrig)],
      ['Rating-Startwert', wertText(v.rating_startwert)],
      ['Pass-Nr.', wertText(v.passnummer)],
      ['DBU-Nr.', wertText(v.dbu_nummer)],
      ['Notiz', wertText(v.notiz)]
    ]);
  } else leer(dok, 'Keine vertraulichen Angaben gespeichert.');

  ueberschrift(dok, 'Konto', 11);
  if (a.konten.length > 0) {
    tabelle(
      dok,
      [{ text: 'E-Mail' }, { text: 'Name' }, { text: 'Rollen' }, { text: 'Angelegt' }, { text: 'Letzte Anmeldung' }, { text: 'Passwort' }],
      a.konten.map((k) => [
        wertText(k.email),
        wertText(k.anzeigename),
        k.rollen.map((r) => ROLLE[r] ?? r).join(', ') || '–',
        datumText(k.erstellt_am),
        datumText(k.angemeldet_am, true),
        k.passwort_festgelegt ? 'festgelegt (nur als Hash)' : 'keins'
      ])
    );
  } else leer(dok, 'Mit dieser Person ist kein Konto verknüpft.');

  ueberschrift(dok, 'Überblick', 11);
  const aktuell = aktuellesRating(a.rating);
  tabelle(dok, [{ text: 'Bereich' }, { text: 'Anzahl oder Wert', align: 'rechts' }], [
    ['Partien', String(a.partien.length)],
    ['Turnierteilnahmen', String(a.turniere.length)],
    ['Turnier-Anmeldungen', String(a.anmeldungen.length)],
    ['Mannschaften', String(a.mannschaften.length)],
    ['14.1-Aufnahmen im Protokoll', String(a.aufnahmen_141.length)],
    ...aktuell.map((r) => [`Rating ${DISZIPLIN[r.disziplin] ?? r.disziplin} (Stand ${datumText(r.stichtag)})`, String(r.wert)])
  ]);

  if (a.turniere.length > 0) {
    ueberschrift(dok, 'Turniere', 11);
    tabelle(
      dok,
      [{ text: 'Datum' }, { text: 'Turnier' }, { text: 'Disziplin' }, { text: 'Startnr.', align: 'rechts' }, { text: 'Gruppe' }, { text: 'Platz', align: 'rechts' }],
      a.turniere.map((t) => [
        datumText(t.datum),
        t.name,
        DISZIPLIN[t.disziplin] ?? t.disziplin,
        wertText(t.startnummer),
        wertText(t.gruppe),
        t.endplatz ? `${t.endplatz}.` : '–'
      ])
    );
  }

  if (a.anmeldungen.length > 0) {
    ueberschrift(dok, 'Turnier-Anmeldungen', 11);
    tabelle(
      dok,
      [{ text: 'Turnier' }, { text: 'Datum' }, { text: 'Angemeldet' }, { text: 'Abgemeldet' }],
      a.anmeldungen.map((x) => [x.turnier, datumText(x.datum), datumText(x.angemeldet_am, true), datumText(x.abgemeldet_am, true)])
    );
  }

  if (a.mannschaften.length > 0) {
    ueberschrift(dok, 'Mannschaften', 11);
    tabelle(
      dok,
      [{ text: 'Saison' }, { text: 'Mannschaft' }, { text: 'Liga' }, { text: 'Stammspieler' }, { text: 'Kapitän' }, { text: 'Berechtigt ab' }],
      a.mannschaften.map((m) => [
        m.saison,
        m.name,
        [m.liga, m.staffel].filter(Boolean).join(' · ') || '–',
        wertText(m.stammspieler),
        wertText(m.kapitaen),
        datumText(m.berechtigt_ab)
      ])
    );
  }

  if (a.partien.length > 0) {
    ueberschrift(dok, 'Partien', 11);
    tabelle(
      dok,
      [
        { text: 'Datum' },
        { text: 'Turnier' },
        { text: 'Runde' },
        { text: 'Disziplin' },
        { text: 'Gegner' },
        { text: 'Ergebnis', align: 'mitte' },
        { text: 'Vorgabe', align: 'mitte' },
        { text: 'Stand' }
      ],
      a.partien.map((x) => [
        datumText(x.datum),
        x.turnier ?? 'Einzelspiel',
        x.turnier ? rundeText(x) : '–',
        DISZIPLIN[x.disziplin] ?? x.disziplin,
        x.gegner ?? '?',
        `${x.eigene ?? '–'} : ${x.gegner_ergebnis ?? '–'}`,
        x.vorgabe_eigen || x.vorgabe_gegner ? `${x.vorgabe_eigen} : ${x.vorgabe_gegner}` : '–',
        x.status
      ])
    );
  }

  ueberschrift(dok, 'Änderungsprotokoll', 11);
  if (a.aenderungen.length > 0) {
    tabelle(
      dok,
      [{ text: 'Zeitpunkt' }, { text: 'Bereich' }, { text: 'Änderung' }],
      a.aenderungen.map((e) => [datumText(e.zeitpunkt, true), BEREICH[e.tabelle] ?? e.tabelle, aenderungText(e)])
    );
  } else leer(dok, 'Keine Einträge zu dieser Person.');
  const durchKonto = Object.entries(a.aenderungen_durch_konto);
  if (durchKonto.length > 0) {
    fliesstext(
      dok,
      'Mit dem eigenen Konto vorgenommene Änderungen: ' +
        durchKonto.map(([t, n]) => `${BEREICH[t] ?? t} ${n}`).join(', ') +
        '. Die Einträge selbst betreffen meist auch andere Personen und stehen deshalb nicht einzeln hier.'
    );
  }

  ueberschrift(dok, 'Zweck, Empfänger, Speicherdauer und Rechte', 11);
  fliesstext(
    dok,
    `Verantwortlich für diese Daten ist der Verein ${a.verein}. Er nutzt sie für den Spielbetrieb: Turniere, Ligaspiele, ` +
      'Ergebnisse, Ranglisten und das Vereins-Rating. Der Betreiber von CueDesk verarbeitet sie in seinem Auftrag; ' +
      'Dienstleister sind Supabase (Datenbank in Frankfurt), IONOS (E-Mail) und GitHub (Webseite und verschlüsselte Sicherung).'
  );
  fliesstext(
    dok,
    'Ergebnisse bleiben, solange der Verein CueDesk nutzt. Auf Wunsch wird der Name durch einen Platzhalter ersetzt. ' +
      'Das Änderungsprotokoll wird nach 2 Jahren gelöscht, Sicherungen nach 12 Wochen.'
  );
  fliesstext(
    dok,
    'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie ' +
      'auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Einzelheiten stehen in der Datenschutzerklärung von CueDesk.'
  );

  return bauen(dok, `Auskunft ${name}`);
}
