// Stammdaten aus einem CueDesk-Export (verein_export, format "cuedesk-export")
// fuer "Altdaten uebernehmen": Spieler mit ihren vertraulichen Angaben,
// Mannschaften mit Kader und Tische. Turniere, Partien, Rating, Konten,
// Einladungen und Geraete bleiben bewusst draussen - sie gehoeren zur
// Datenbank, aus der exportiert wurde (z. B. Testbetrieb).
//
// Die Freigabe "Name oeffentlich" wird nicht uebernommen: Sie braucht einen
// Nachweis (einwilligung_setzen) und steht nicht im Export.

import type { PersonenStatus } from './datenbank.types';
import { personName } from './namen';

export const EXPORT_FORMAT = 'cuedesk-export';

type Zeile = Record<string, unknown>;

export type ExportPerson = {
  altId: string;
  vorname: string;
  nachname: string;
  anzeigename: string | null;
  kuerzel: string | null;
  status: PersonenStatus;
  rating_ausgeblendet: boolean;
  // personen_intern; null, wenn der Export keine Zeile dazu hat
  intern: {
    eintritt: string | null;
    austritt: string | null;
    minderjaehrig: boolean;
    rating_startwert: number | null;
    notiz: string | null;
    passnummer: string | null;
    dbu_nummer: string | null;
  } | null;
};

export type ExportKaderEintrag = {
  personAltId: string;
  stammspieler: boolean;
  kapitaen: boolean;
  berechtigt_ab: string | null;
  position: number | null;
};

export type ExportMannschaft = {
  altId: string;
  name: string;
  saison: string;
  liga: string | null;
  staffel: string | null;
  rang: number;
  aktiv: boolean;
  notiz: string | null;
  kader: ExportKaderEintrag[];
};

export type ExportTisch = { nummer: number; bezeichnung: string | null; aktiv: boolean };

export type ExportStammdaten = {
  vereinName: string;
  erstellt: string | null;
  personen: ExportPerson[];
  mannschaften: ExportMannschaft[];
  tische: ExportTisch[];
  // anonymisierte Spieler (nur Platzhalter-Namen) werden nicht angeboten
  anonymisiert: number;
  // Was im Export steht, aber nicht uebernommen wird
  ausgelassen: { turniere: number; partien: number; ratingStand: number; konten: number; geraete: number };
  // Spieler mit erteilter Einwilligung "Name oeffentlich" (letzter Eintrag,
  // nur Exporte ab 13.10.2026) - werden in der Ziel-Datenbank neu erfasst
  einwilligungen: { mitNachweis: number; ohneNachweis: number };
};

export function istCuedeskExport(inhalt: unknown): boolean {
  return typeof inhalt === 'object' && inhalt !== null && (inhalt as Zeile).format === EXPORT_FORMAT;
}

const text = (wert: unknown): string | null => (typeof wert === 'string' && wert.trim() !== '' ? wert : null);
const zahl = (wert: unknown): number | null => (typeof wert === 'number' && Number.isFinite(wert) ? wert : null);
const liste = (wert: unknown): Zeile[] => (Array.isArray(wert) ? (wert as Zeile[]) : []);
const STATUS: PersonenStatus[] = ['mitglied', 'gast', 'ausgetreten'];

export function stammdatenAuswerten(inhalt: unknown): ExportStammdaten {
  if (!istCuedeskExport(inhalt)) throw new Error('Das ist kein CueDesk-Export.');
  const datei = inhalt as Zeile;
  if (datei.version !== 1) throw new Error(`Unbekannte Version des CueDesk-Exports (${String(datei.version)}).`);
  const daten = (datei.daten ?? {}) as Zeile;
  const verein = (datei.verein ?? {}) as Zeile;

  const intern = new Map(liste(daten.personen_intern).map((z) => [String(z.person_id), z]));
  let anonymisiert = 0;
  const personen: ExportPerson[] = [];
  for (const p of liste(daten.personen)) {
    if (p.anonymisiert_am) {
      anonymisiert += 1;
      continue;
    }
    const i = intern.get(String(p.id));
    const startwert = zahl(i?.rating_startwert);
    personen.push({
      altId: String(p.id),
      vorname: text(p.vorname) ?? '',
      nachname: text(p.nachname) ?? '',
      anzeigename: text(p.anzeigename),
      kuerzel: text(p.kuerzel),
      status: STATUS.includes(p.status as PersonenStatus) ? (p.status as PersonenStatus) : 'mitglied',
      rating_ausgeblendet: p.rating_ausgeblendet === true,
      intern: i
        ? {
            eintritt: text(i.eintritt),
            austritt: text(i.austritt),
            minderjaehrig: i.minderjaehrig === true,
            rating_startwert: startwert !== null && startwert >= 100 && startwert <= 1000 ? startwert : null,
            notiz: text(i.notiz),
            passnummer: text(i.passnummer),
            dbu_nummer: text(i.dbu_nummer)
          }
        : null
    });
  }
  personen.sort((a, b) => personName(a).localeCompare(personName(b), 'de'));
  const bekannt = new Set(personen.map((p) => p.altId));

  const kader = liste(daten.mannschaft_spieler);
  const mannschaften: ExportMannschaft[] = liste(daten.mannschaften).map((m) => ({
    altId: String(m.id),
    name: text(m.name) ?? 'Mannschaft',
    saison: text(m.saison) ?? '',
    liga: text(m.liga),
    staffel: text(m.staffel),
    rang: zahl(m.rang) ?? 1,
    aktiv: m.aktiv !== false,
    notiz: text(m.notiz),
    kader: kader
      .filter((k) => String(k.mannschaft_id) === String(m.id) && bekannt.has(String(k.person_id)))
      .map((k) => ({
        personAltId: String(k.person_id),
        stammspieler: k.stammspieler === true,
        kapitaen: k.kapitaen === true,
        berechtigt_ab: text(k.berechtigt_ab),
        position: zahl(k.position)
      }))
  }));

  const tische: ExportTisch[] = liste(daten.tische)
    .filter((t) => (zahl(t.nummer) ?? 0) > 0)
    .map((t) => ({ nummer: zahl(t.nummer)!, bezeichnung: text(t.bezeichnung), aktiv: t.aktiv !== false }))
    .sort((a, b) => a.nummer - b.nummer);

  // Letzter Eintrag je angebotenem Spieler (Art "name_oeffentlich")
  const letzte = new Map<string, Zeile>();
  for (const e of liste(daten.einwilligungen)) {
    if (e.art !== 'name_oeffentlich' || !bekannt.has(String(e.person_id))) continue;
    const bisher = letzte.get(String(e.person_id));
    if (!bisher || String(e.am) >= String(bisher.am)) letzte.set(String(e.person_id), e);
  }
  const erteilt = [...letzte.values()].filter((e) => e.vorgang === 'erteilt');
  const einwilligungen = {
    mitNachweis: erteilt.filter((e) => e.weg !== 'uebernommen').length,
    ohneNachweis: erteilt.filter((e) => e.weg === 'uebernommen').length
  };

  return {
    vereinName: text(verein.name) ?? '',
    einwilligungen,
    erstellt: text(datei.erstellt),
    personen,
    mannschaften,
    tische,
    anonymisiert,
    ausgelassen: {
      turniere: liste(daten.turniere).length,
      partien: liste(daten.partien).length + liste(daten.partien_141).length,
      ratingStand: liste(daten.rating_stand).length,
      konten: liste(daten.konten).length,
      geraete: liste(daten.geraete).length
    }
  };
}

// Vorschlag fuer die Zuordnung: gleicher Name wie ein vorhandener Spieler ->
// dieser; Gast -> nicht uebernehmen (meist Gegner aus Liga-Spielen); sonst neu.
export type Zuordnung = 'neu' | 'weglassen' | string;

export function zuordnungVorschlagen(
  personen: ExportPerson[],
  vorhanden: { id: string; vorname: string; nachname: string }[]
): Record<string, Zuordnung> {
  const nachName = new Map(vorhanden.map((p) => [personName(p).toLowerCase(), p.id]));
  const vorschlag: Record<string, Zuordnung> = {};
  for (const p of personen) {
    vorschlag[p.altId] = nachName.get(personName(p).toLowerCase()) ?? (p.status === 'gast' ? 'weglassen' : 'neu');
  }
  return vorschlag;
}
