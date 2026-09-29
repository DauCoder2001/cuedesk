// Ranglisten des Vereins: Siegquote je Disziplin, Bestenliste 14.1, Titel aus
// Turniersiegen und die Platzierungen in den Vereinsserien. Reine Rechnung
// ohne Datenbank, abgesichert durch test/ranglisten.test.ts.
//
// Gaeste stehen in keiner Rangliste (Konzept, Abschnitt "Gaeste"). Wer in
// eine Rangliste gehoert, entscheidet die Seite ueber die Liste "mitglieder".

import { serienwertung } from './serien';
import type { SerienEinstellungen, SerienTurnier } from './serien';
import type { StatPartie } from './statistik-141';
import type { PoolPartie } from './statistik-pool';

// ---------- Siegquote ----------

export type QuotenZeile = {
  person: string;
  partien: number;
  siege: number;
  niederlagen: number;
  eigene: number; // Racks
  fremde: number;
  siegquote: number;
  rackquote: number;
};

// Siegquote aus den Partieergebnissen. Gezaehlt werden nur entschiedene
// Partien zwischen zwei Gelisteten; wer die Mindestzahl nicht erreicht, faellt
// heraus. Reihenfolge: Siegquote, dann Rackquote, dann Partien.
export function siegquoten(partien: PoolPartie[], mitglieder: Set<string>, mindestens = 5): QuotenZeile[] {
  const karte = new Map<string, QuotenZeile>();
  const zeile = (person: string) => {
    const vorhanden = karte.get(person);
    if (vorhanden) return vorhanden;
    const neu: QuotenZeile = {
      person,
      partien: 0,
      siege: 0,
      niederlagen: 0,
      eigene: 0,
      fremde: 0,
      siegquote: 0,
      rackquote: 0
    };
    karte.set(person, neu);
    return neu;
  };

  partien.forEach((p) => {
    if (p.status !== 'beendet') return;
    if (!mitglieder.has(p.spieler_a) || !mitglieder.has(p.spieler_b)) return;
    const a = p.ergebnis_a;
    const b = p.ergebnis_b;
    if (a === null || b === null || a === b) return;
    const za = zeile(p.spieler_a);
    const zb = zeile(p.spieler_b);
    za.partien += 1;
    zb.partien += 1;
    za.eigene += a;
    za.fremde += b;
    zb.eigene += b;
    zb.fremde += a;
    if (a > b) {
      za.siege += 1;
      zb.niederlagen += 1;
    } else {
      zb.siege += 1;
      za.niederlagen += 1;
    }
  });

  return [...karte.values()]
    .filter((z) => z.partien >= mindestens)
    .map((z) => ({
      ...z,
      siegquote: z.siege / z.partien,
      rackquote: z.eigene + z.fremde > 0 ? z.eigene / (z.eigene + z.fremde) : 0
    }))
    .sort((x, y) => y.siegquote - x.siegquote || y.rackquote - x.rackquote || y.partien - x.partien);
}

// ---------- Titel ----------

export type TitelZeile = { person: string; teilnahmen: number; siege: number; podest: number };

// Turniersiege und Podestplaetze aus den Endplatzierungen beendeter Turniere
export function titel(
  teilnahmen: { turnier_id: string; person_id: string; endplatz: number | null }[],
  beendeteTurniere: Set<string>,
  mitglieder: Set<string>
): TitelZeile[] {
  const karte = new Map<string, TitelZeile>();
  teilnahmen.forEach((t) => {
    if (!beendeteTurniere.has(t.turnier_id) || !mitglieder.has(t.person_id) || t.endplatz === null) return;
    const z = karte.get(t.person_id) ?? { person: t.person_id, teilnahmen: 0, siege: 0, podest: 0 };
    z.teilnahmen += 1;
    if (t.endplatz === 1) z.siege += 1;
    if (t.endplatz <= 3) z.podest += 1;
    karte.set(t.person_id, z);
  });
  return [...karte.values()].sort((a, b) => b.siege - a.siege || b.podest - a.podest || b.teilnahmen - a.teilnahmen);
}

// ---------- Serien ----------

export type SerienPlatz = { platz: number; punkte: number; turniere: number };
export type SerienUebersicht = {
  serien: { id: string; name: string; saison: string | null }[];
  zeilen: { person: string; plaetze: Record<string, SerienPlatz>; besterPlatz: number }[];
};

// Platzierung jeder Person in jeder Serie. Gerechnet wird je Serie wie auf der
// Seite "Serien" (Streicher und Bonus gelten dort je Spieler).
export function serienUebersicht(
  serien: { id: string; name: string; saison: string | null; streicher: number; bonus: number }[],
  turniereJeSerie: Record<string, SerienTurnier[]>,
  mitglieder: Set<string>
): SerienUebersicht {
  const benutzte: SerienUebersicht['serien'] = [];
  const zeilen = new Map<string, { person: string; plaetze: Record<string, SerienPlatz>; besterPlatz: number }>();

  serien.forEach((s) => {
    const turniere = turniereJeSerie[s.id] ?? [];
    if (turniere.length === 0) return;
    benutzte.push({ id: s.id, name: s.name, saison: s.saison });
    const einstellungen: SerienEinstellungen = { streicher: s.streicher, bonus: s.bonus };
    serienwertung(turniere, einstellungen).forEach((sp) => {
      if (!mitglieder.has(sp.spieler)) return;
      const z = zeilen.get(sp.spieler) ?? { person: sp.spieler, plaetze: {}, besterPlatz: 99 };
      z.plaetze[s.id] = { platz: sp.platz, punkte: sp.summe, turniere: sp.gespielt };
      z.besterPlatz = Math.min(z.besterPlatz, sp.platz);
      zeilen.set(sp.spieler, z);
    });
  });

  return {
    serien: benutzte,
    zeilen: [...zeilen.values()].sort(
      (a, b) =>
        a.besterPlatz - b.besterPlatz ||
        Object.values(b.plaetze).reduce((n, p) => n + p.punkte, 0) - Object.values(a.plaetze).reduce((n, p) => n + p.punkte, 0)
    )
  };
}

// ---------- Bestenliste 14.1 ----------

export type Beste141Zeile = {
  person: string;
  partien: number;
  aufnahmen: number;
  gd: number | null; // Generaldurchschnitt
  hs: number; // hoechste Serie
};

// Kennzahlen einer 14.1-Partie (Tabelle partien_141, fuer alle Mitglieder
// lesbar; das Aufnahme-Protokoll sieht ein Mitglied nur fuer eigene Partien)
export type Kennzahl141 = {
  partie_id: string;
  aufnahmen_a: number;
  aufnahmen_b: number;
  hoechstserie_a: number;
  hoechstserie_b: number;
};

// Bestenliste aus Ergebnis und Kennzahlen je Partie: GD = Punkte je Aufnahme.
// Partien ohne Kennzahlen zaehlen nicht. Wer zu wenige Aufnahmen hat, steht
// nicht in der Liste.
export function bestenliste141(
  personen: string[],
  partien: Pick<StatPartie, 'id' | 'spieler_a' | 'spieler_b' | 'ergebnis_a' | 'ergebnis_b'>[],
  kennzahlen: Kennzahl141[],
  mindestAufnahmen = 20
): Beste141Zeile[] {
  const jePartie = new Map(kennzahlen.map((k) => [k.partie_id, k]));
  const summen = new Map(personen.map((p) => [p, { partien: 0, aufnahmen: 0, punkte: 0, hs: 0 }]));
  partien.forEach((p) => {
    const k = jePartie.get(p.id);
    if (!k) return;
    const seiten = [
      { person: p.spieler_a, punkte: p.ergebnis_a ?? 0, aufnahmen: k.aufnahmen_a, hs: k.hoechstserie_a },
      { person: p.spieler_b, punkte: p.ergebnis_b ?? 0, aufnahmen: k.aufnahmen_b, hs: k.hoechstserie_b }
    ];
    seiten.forEach((s) => {
      const z = summen.get(s.person);
      if (!z) return;
      z.partien += 1;
      z.aufnahmen += s.aufnahmen;
      z.punkte += s.punkte;
      z.hs = Math.max(z.hs, s.hs);
    });
  });
  return [...summen.entries()]
    .map(([person, z]) => ({
      person,
      partien: z.partien,
      aufnahmen: z.aufnahmen,
      gd: z.aufnahmen > 0 ? z.punkte / z.aufnahmen : null,
      hs: z.hs
    }))
    .filter((z) => z.aufnahmen >= mindestAufnahmen)
    .sort((a, b) => (b.gd ?? -1) - (a.gd ?? -1) || b.hs - a.hs);
}
