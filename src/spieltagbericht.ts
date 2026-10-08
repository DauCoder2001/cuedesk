// Spielbericht eines ganzen Liga-Spieltags als PDF (zum Drucken oder
// Weiterschicken): Gesamtstand aller Begegnungen, dann je Begegnung Hin-,
// Rueckrunde bzw. Doppel mit Aufstellung und Ergebnis. Die Daten stellt
// spieltagBerichtDaten aus Turnieren und Partien zusammen (getestet in
// test/spieltagbericht.test.ts), gezeichnet wird mit src/pdf.ts.

import { bauen, neuesDokument, PDF_BREITE, PDF_RAND, absatz, tabelle, text, ueberschrift } from './pdf';
import { doppelSpielplan, istDoppelBegegnung, spielplan } from './liga';
import { ligaStand, spieltagGesamt } from './zuschauen';
import type { Ausspielziele, DoppelPartie, LigaSpiel } from './liga';
import type { Partie, Turnier } from './datenbank.types';

export type BerichtPartie = { nr: number; disziplin: string; heim: string; gast: string; ergebnis: string };
export type BerichtBegegnung = {
  titel: string; // "1. Begegnung", "2. Begegnung · Doppel"
  heim: string;
  gast: string;
  partiepunkte: [number, number]; // Heim zuerst
  matchpunkte: [number, number] | null;
  runden: { name: string; partien: BerichtPartie[] }[];
};
export type SpieltagBericht = {
  titel: string;
  kopf: string;
  links: string; // Heimmannschaft der 1. Begegnung
  rechts: string;
  partiepunkte: [number, number];
  matchpunkte: [number, number];
  fertig: boolean;
  uebersicht: { titel: string; partiepunkte: [number, number]; matchpunkte: [number, number] | null }[];
  begegnungen: BerichtBegegnung[];
};

const DISZIPLIN: Record<string, string> = { '14-1': '14.1-endlos', '8-ball': '8-Ball', '9-ball': '9-Ball', '10-ball': '10-Ball' };

type Liga = { ziele?: Ausspielziele; doppelPlan?: DoppelPartie[]; art?: 'doppel' };
const ligaVon = (t: Turnier) => ((t.einstellungen ?? {}) as { liga?: Liga }).liga ?? {};

function disziplinText(s: LigaSpiel): string {
  const ziel = s.disziplin === '14-1' ? `${s.ziel} Pkt. / ${s.aufnahmen} Aufn.` : `Race to ${s.ziel}`;
  return `${DISZIPLIN[s.disziplin] ?? s.disziplin} ${ziel}`;
}

// begegnungen in Spielreihenfolge (1., Doppel, 3.); name: Person -> Anzeigename
export function spieltagBerichtDaten(
  begegnungen: Turnier[],
  partien: Partie[],
  vereinName: string,
  name: (id: string) => string,
  kopf: string
): SpieltagBericht | null {
  const gesamt = spieltagGesamt(begegnungen, partien, vereinName);
  if (!gesamt) return null;
  const seite = (erster: string, zweiter: string | null, doppel: boolean) =>
    doppel ? `${name(erster)} / ${zweiter ? name(zweiter) : 'Geist'}` : name(erster);
  const berichtBegegnungen = begegnungen.map((b, i): BerichtBegegnung => {
    const liga = ligaVon(b);
    const doppel = istDoppelBegegnung(b);
    const plan = doppel ? doppelSpielplan(liga.doppelPlan ?? []) : liga.ziele ? spielplan(liga.ziele) : [];
    const eigene = partien.filter((p) => p.turnier_id === b.id);
    const zeile = (s: LigaSpiel): BerichtPartie => {
      const p = eigene.find((x) => x.runde === (s.runde === 'hin' ? 1 : 2) && x.paarung === s.paarung);
      return {
        nr: s.nr,
        disziplin: disziplinText(s),
        heim: p ? seite(p.spieler_a, p.partner_a, doppel) : '',
        gast: p ? seite(p.spieler_b, p.partner_b, doppel) : '',
        ergebnis: p && p.status === 'beendet' && p.ergebnis_a !== null && p.ergebnis_b !== null ? `${p.ergebnis_a} : ${p.ergebnis_b}` : ''
      };
    };
    const runden = doppel
      ? [{ name: 'Doppel', partien: plan.map(zeile) }]
      : [
          { name: 'Hinrunde', partien: plan.filter((s) => s.runde === 'hin').map(zeile) },
          { name: 'Rückrunde', partien: plan.filter((s) => s.runde === 'rueck').map(zeile) }
        ];
    const s = ligaStand(b, partien, vereinName);
    return {
      titel: `${i + 1}. Begegnung${doppel ? ' · Doppel' : ''}`,
      heim: s.heim,
      gast: s.gast,
      partiepunkte: s.partiepunkte,
      matchpunkte: s.matchpunkte,
      runden
    };
  });
  return {
    titel: begegnungen[0].name,
    kopf,
    links: gesamt.links,
    rechts: gesamt.rechts,
    partiepunkte: gesamt.partiepunkte,
    matchpunkte: gesamt.matchpunkte,
    fertig: gesamt.fertig,
    uebersicht: gesamt.teile.map((t) => ({ titel: t.titel, partiepunkte: t.partiepunkte, matchpunkte: t.matchpunkte })),
    begegnungen: berichtBegegnungen
  };
}

const paar = (x: [number, number] | null) => (x ? `${x[0]} : ${x[1]}` : '–');

export function spieltagBerichtPdf(b: SpieltagBericht): Uint8Array {
  const dok = neuesDokument();
  const breite = PDF_BREITE - 2 * PDF_RAND;
  text(dok, b.fertig ? 'Ergebnis des Spieltags' : 'Spieltag · Zwischenstand', PDF_RAND, breite, 15, true);
  dok.y -= 18;
  text(dok, b.titel, PDF_RAND, breite, 11, true);
  dok.y -= 16;
  absatz(dok, b.kopf);
  dok.y -= 6;
  text(dok, `${b.links}   ${paar(b.partiepunkte)}   ${b.rechts}`, PDF_RAND, breite, 13, true, 'mitte');
  dok.y -= 16;
  text(dok, `Partiepunkte · Matchpunkte ${paar(b.matchpunkte)}`, PDF_RAND, breite, 9, false, 'mitte', 0.35);
  dok.y -= 10;

  ueberschrift(dok, `Übersicht (aus Sicht von ${b.links})`, 11);
  tabelle(
    dok,
    [
      { text: 'Begegnung', align: 'links' },
      { text: 'Partiepunkte', align: 'mitte' },
      { text: 'Matchpunkte', align: 'mitte' }
    ],
    [
      ...b.uebersicht.map((u) => [u.titel, paar(u.partiepunkte), paar(u.matchpunkte)]),
      ['Spieltag gesamt', paar(b.partiepunkte), paar(b.matchpunkte)]
    ]
  );

  b.begegnungen.forEach((bg) => {
    ueberschrift(dok, `${bg.titel}: ${bg.heim} – ${bg.gast}  ${paar(bg.partiepunkte)}`, 11);
    absatz(dok, `Partiepunkte ${paar(bg.partiepunkte)} · Matchpunkte ${paar(bg.matchpunkte)} (Heim zuerst)`);
    bg.runden.forEach((r) => {
      if (bg.runden.length > 1) absatz(dok, r.name);
      tabelle(
        dok,
        [
          { text: 'Nr.', align: 'mitte' },
          { text: 'Disziplin', align: 'links' },
          { text: `${bg.heim} (Heim)`, align: 'links' },
          { text: `${bg.gast} (Gast)`, align: 'links' },
          { text: 'Ergebnis', align: 'mitte' }
        ],
        r.partien.map((p) => [String(p.nr), p.disziplin, p.heim, p.gast, p.ergebnis])
      );
    });
  });
  return bauen(dok, b.titel);
}

// "Spaß-Liga · 1. Spieltag" -> "Spielbericht_Spass-Liga_1_Spieltag_2026-10-08.pdf"
export function spieltagBerichtDateiname(titel: string, datum: string): string {
  const umlaute: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  const sauber = (titel || 'Spieltag')
    .replace(/[äöüÄÖÜß]/g, (z) => umlaute[z])
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `Spielbericht_${sauber}_${datum}.pdf`;
}
