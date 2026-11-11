// Rangliste einer Serie als PDF, Inhalt wie der Ausdruck der Serienwertung
// v15 (buildPrintReport): Kopfzeile, Tabelle mit Platz, Spieler, Punkten und
// den Punkten je Turnier, Streichergebnisse in Klammern, dazu die Erklaerung.

import { absatz, bauen, neuesDokument, passtAuf, PDF_RAND, tabelle, text, ueberschrift } from './pdf';
import type { Spalte } from './pdf';
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

// Tabelle fuer einen Teil der Turniere; Platz, Spieler und Punkte stehen immer vorn
function serienTabelle(b: SerienBericht, turniere: SerienBericht['turniere']): { spalten: Spalte[]; zeilen: string[][] } {
  return {
    spalten: [
      { text: 'Platz', align: 'mitte' },
      { text: 'Spieler', align: 'links' },
      { text: 'Punkte', align: 'mitte' },
      ...turniere.map((t) => ({ text: datumKurz(t.datum), align: 'mitte' as const }))
    ],
    zeilen: b.spieler.map((sp) => [
      sp.zeigePlatz ? `${sp.platz}.` : '',
      b.anzeige(sp.spieler),
      String(sp.summe),
      ...turniere.map((t) => {
        const e = sp.ergebnisse[t.id];
        if (!e) return '–';
        return e.gestrichen ? `(${e.punkte})` : String(e.punkte);
      })
    ])
  };
}

// Turniere auf Bloecke verteilen: so wenige wie moeglich, gleich gross, und
// jeder passt in normaler Schrift auf die Seitenbreite
export function serienBloecke(b: SerienBericht, seitenbreite: number): SerienBericht['turniere'][] {
  const n = b.turniere.length;
  for (let anzahl = 1; anzahl <= Math.max(1, n); anzahl += 1) {
    const groesse = Math.ceil(n / anzahl);
    const bloecke = Array.from({ length: anzahl }, (_, i) => b.turniere.slice(i * groesse, (i + 1) * groesse)).filter((x) => x.length);
    if (bloecke.every((x) => { const t = serienTabelle(b, x); return passtAuf(t.spalten, t.zeilen, seitenbreite); })) return bloecke;
  }
  return [b.turniere];
}

export function serienPdf(b: SerienBericht): Uint8Array {
  // Wenige Turniere: hochkant wie bisher. Sonst A4 quer und, wenn auch das
  // nicht reicht, die Turniere auf mehrere Tabellen verteilt
  const ganz = serienTabelle(b, b.turniere);
  const quer = !passtAuf(ganz.spalten, ganz.zeilen);
  const dok = neuesDokument(quer);
  const bloecke = quer ? serienBloecke(b, dok.breite) : [b.turniere];
  const titel = `${b.name}${b.disziplin ? ` · ${b.disziplin}` : ''}`;
  text(dok, titel, PDF_RAND, dok.breite - 2 * PDF_RAND, 15, true);
  dok.y -= 18;
  const stand = `${String(b.stand.getDate()).padStart(2, '0')}.${String(b.stand.getMonth() + 1).padStart(2, '0')}.${b.stand.getFullYear()}`;
  absatz(
    dok,
    `${b.saison ? `Saison ${b.saison} · ` : ''}${b.turniere.length} Turniere · ${b.spieler.length} Spieler · Stand ${stand}` +
      (b.streicher > 0 ? ` · gewertet: beste ${b.streicher}` : '') +
      ` · ${b.bonus > 0 ? `Sieger-Bonus +${b.bonus}` : 'ohne Sieger-Bonus'}`
  );

  let ab = 1;
  bloecke.forEach((teil) => {
    if (bloecke.length > 1) {
      ueberschrift(dok, `Turniere ${ab} bis ${ab + teil.length - 1}`, 9);
      ab += teil.length;
    }
    const t = serienTabelle(b, teil);
    tabelle(dok, t.spalten, t.zeilen);
  });
  absatz(
    dok,
    'Punkte je Turnier: Sieger = Teilnehmerzahl, jeder Platz darunter einen weniger, Letzter 1 Punkt' +
      (b.bonus > 0 ? `, für Platz 1 zusätzlich ${b.bonus} Bonuspunkt${b.bonus === 1 ? '' : 'e'}.` : ', ohne Sieger-Bonus.') +
      (b.streicher > 0 ? ' Werte in Klammern sind Streichergebnisse und zählen nicht mit.' : '')
  );
  return bauen(dok, `Serienwertung ${b.name}${b.saison ? ` Saison ${b.saison}` : ''}`);
}

export function serienDateiname(name: string, saison: string | null): string {
  return `Serienwertung_${`${name}${saison ? `_${saison}` : ''}`.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;
}
