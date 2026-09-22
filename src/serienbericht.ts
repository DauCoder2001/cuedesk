// Rangliste einer Serie als PDF, Inhalt wie der Ausdruck der Serienwertung
// v15 (buildPrintReport): Kopfzeile, Tabelle mit Platz, Spieler, Punkten und
// den Punkten je Turnier, Streichergebnisse in Klammern, dazu die Erklaerung.

import { absatz, bauen, neuesDokument, PDF_BREITE, PDF_RAND, tabelle, text } from './pdf';
import type { SerienSpieler } from './serien';

export type SerienBericht = {
  name: string;
  saison: string | null;
  disziplin: string;
  streicher: number;
  bonus: number;
  stand: Date;
  turniere: { id: string; datum: string }[];
  spieler: SerienSpieler[];
  anzeige: (spieler: string) => string;
};

// "2026-09-05" wird zu "5.9." (v15 datumKurz)
export function datumKurz(iso: string): string {
  const t = iso.split('-');
  if (t.length !== 3) return iso;
  return `${Number(t[2])}.${Number(t[1])}.`;
}

export function serienPdf(b: SerienBericht): Uint8Array {
  const dok = neuesDokument();
  const titel = `${b.name}${b.disziplin ? ` · ${b.disziplin}` : ''}`;
  text(dok, titel, PDF_RAND, PDF_BREITE - 2 * PDF_RAND, 15, true);
  dok.y -= 18;
  const stand = `${String(b.stand.getDate()).padStart(2, '0')}.${String(b.stand.getMonth() + 1).padStart(2, '0')}.${b.stand.getFullYear()}`;
  absatz(
    dok,
    `${b.saison ? `Saison ${b.saison} · ` : ''}${b.turniere.length} Turniere · ${b.spieler.length} Spieler · Stand ${stand}` +
      (b.streicher > 0 ? ` · gewertet: beste ${b.streicher}` : '') +
      ` · ${b.bonus > 0 ? `Sieger-Bonus +${b.bonus}` : 'ohne Sieger-Bonus'}`
  );

  tabelle(
    dok,
    [
      { text: 'Platz', align: 'mitte' },
      { text: 'Spieler', align: 'links' },
      { text: 'Punkte', align: 'mitte' },
      ...b.turniere.map((t) => ({ text: datumKurz(t.datum), align: 'mitte' as const }))
    ],
    b.spieler.map((sp) => [
      sp.zeigePlatz ? `${sp.platz}.` : '',
      b.anzeige(sp.spieler),
      String(sp.summe),
      ...b.turniere.map((t) => {
        const e = sp.ergebnisse[t.id];
        if (!e) return '–';
        return e.gestrichen ? `(${e.punkte})` : String(e.punkte);
      })
    ])
  );
  absatz(
    dok,
    'Punkte je Turnier: Teilnehmerzahl + 1 - Platz' +
      (b.bonus > 0 ? `, für Platz 1 zusätzlich ${b.bonus} Bonuspunkt${b.bonus === 1 ? '' : 'e'}.` : ', ohne Sieger-Bonus.') +
      (b.streicher > 0 ? ' Werte in Klammern sind Streichergebnisse und zählen nicht mit.' : '')
  );
  return bauen(dok, `Serienwertung ${b.name}${b.saison ? ` Saison ${b.saison}` : ''}`);
}

export function serienDateiname(name: string, saison: string | null): string {
  return `Serienwertung_${`${name}${saison ? `_${saison}` : ''}`.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;
}
