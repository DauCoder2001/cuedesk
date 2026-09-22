// Pool-Statistik einer Person aus den Partieergebnissen (Turnierpartien und
// Einzelspiele). Ein Rack-Protokoll gibt es bei Pool nicht, gerechnet wird
// deshalb nur aus Ergebnissen. Reine Rechnung ohne Datenbank, abgesichert
// durch test/statistik-pool.test.ts.
//
// "Gegen Erwartung" nutzt dieselbe Annahme wie das Vereins-Rating: 100 Punkte
// Unterschied bedeuten die doppelte Rack-Gewinnchance. Erwartet werden also
//
//   p = 1 / (1 + 2^((Rating Gegner - eigenes Rating) / 100))
//
// der selbst gespielten Racks. Die Vorgabe ist dabei herausgerechnet, sie
// gehoert nicht zur eigenen Leistung.

import { berechnen, GESAMT } from './rating';
import type { RatingEinstellungen, RatingPartie } from './rating';

export type PoolPartie = {
  id: string;
  datum: string;
  disziplin: string;
  status: 'beendet' | 'abgebrochen';
  turnier_id: string | null;
  spieler_a: string;
  spieler_b: string;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
  beendet: string | null;
};

export type Ausgang = 'sieg' | 'niederlage' | 'unentschieden' | 'abgebrochen';

export type PoolZeile = {
  partie: PoolPartie;
  gegner: string;
  eigene: number; // Racks laut Ergebnis
  fremde: number;
  eigeneOhneVorgabe: number; // selbst gespielte Racks
  fremdeOhneVorgabe: number;
  ausgang: Ausgang;
  erwartet: number | null; // erwartete eigene Racks
};

export type PoolBilanz = {
  partien: number;
  siege: number;
  niederlagen: number;
  eigene: number;
  fremde: number;
  siegquote: number | null; // Anteil gewonnener Partien
  rackquote: number | null; // Anteil gewonnener Racks
  erwartet: number | null; // erwartete eigene Racks, null ohne Ratings
  gegenErwartung: number | null; // selbst gespielte Racks minus Erwartung
};

export type GegnerBilanz = PoolBilanz & { gegner: string; name: string };

export type StatistikPool = {
  gesamt: PoolBilanz;
  jeDisziplin: (PoolBilanz & { disziplin: string })[];
  gegner: GegnerBilanz[];
  form: PoolZeile[]; // die letzten Partien, neueste zuerst
  zeilen: PoolZeile[]; // alle, neueste zuerst
};

const leer = (): PoolBilanz => ({
  partien: 0,
  siege: 0,
  niederlagen: 0,
  eigene: 0,
  fremde: 0,
  siegquote: null,
  rackquote: null,
  erwartet: null,
  gegenErwartung: null
});

// Gewinnchance je Rack aus zwei Ratings (Fargo-Skala)
export function rackChance(eigenes: number, fremdes: number): number {
  return 1 / (1 + Math.pow(2, (fremdes - eigenes) / 100));
}

function abschliessen(b: PoolBilanz, erwartetSumme: number | null, selbstGespielt: number): PoolBilanz {
  const entschieden = b.siege + b.niederlagen;
  const racks = b.eigene + b.fremde;
  return {
    ...b,
    siegquote: entschieden > 0 ? b.siege / entschieden : null,
    rackquote: racks > 0 ? b.eigene / racks : null,
    erwartet: erwartetSumme,
    gegenErwartung: erwartetSumme === null ? null : selbstGespielt - erwartetSumme
  };
}

export function statistikPool(
  person: string,
  partien: PoolPartie[],
  name: (personId: string) => string,
  rating: (personId: string, disziplin: string) => number | null = () => null
): StatistikPool {
  const zeilen: PoolZeile[] = partien
    .filter((p) => p.spieler_a === person || p.spieler_b === person)
    .map((p) => {
      const eigenA = p.spieler_a === person;
      const eigene = (eigenA ? p.ergebnis_a : p.ergebnis_b) ?? 0;
      const fremde = (eigenA ? p.ergebnis_b : p.ergebnis_a) ?? 0;
      const vorgabeEigen = eigenA ? p.vorgabe_a : p.vorgabe_b;
      const vorgabeFremd = eigenA ? p.vorgabe_b : p.vorgabe_a;
      const gegner = eigenA ? p.spieler_b : p.spieler_a;
      const eigeneOhneVorgabe = Math.max(0, eigene - vorgabeEigen);
      const fremdeOhneVorgabe = Math.max(0, fremde - vorgabeFremd);
      const ausgang: Ausgang =
        p.status === 'abgebrochen' ? 'abgebrochen' : eigene > fremde ? 'sieg' : eigene < fremde ? 'niederlage' : 'unentschieden';
      const eigenesRating = rating(person, p.disziplin);
      const fremdesRating = rating(gegner, p.disziplin);
      const gespielt = eigeneOhneVorgabe + fremdeOhneVorgabe;
      const erwartet =
        eigenesRating === null || fremdesRating === null ? null : gespielt * rackChance(eigenesRating, fremdesRating);
      return { partie: p, gegner, eigene, fremde, eigeneOhneVorgabe, fremdeOhneVorgabe, ausgang, erwartet };
    })
    // neueste zuerst; bei gleichem Datum entscheidet der Abschluss
    .sort((x, y) => (y.partie.datum + (y.partie.beendet ?? '')).localeCompare(x.partie.datum + (x.partie.beendet ?? '')));

  const sammeln = (liste: PoolZeile[]): PoolBilanz => {
    const b = leer();
    let erwartetSumme = 0;
    let mitErwartung = false;
    let selbst = 0;
    liste.forEach((z) => {
      b.partien += 1;
      if (z.ausgang === 'sieg') b.siege += 1;
      if (z.ausgang === 'niederlage') b.niederlagen += 1;
      b.eigene += z.eigene;
      b.fremde += z.fremde;
      selbst += z.eigeneOhneVorgabe;
      if (z.erwartet !== null) {
        erwartetSumme += z.erwartet;
        mitErwartung = true;
      }
    });
    return abschliessen(b, mitErwartung ? erwartetSumme : null, selbst);
  };

  const gruppieren = <S extends string>(schluessel: (z: PoolZeile) => S) => {
    const karte = new Map<S, PoolZeile[]>();
    zeilen.forEach((z) => {
      const k = schluessel(z);
      karte.set(k, [...(karte.get(k) ?? []), z]);
    });
    return karte;
  };

  const jeDisziplin = [...gruppieren((z) => z.partie.disziplin).entries()]
    .map(([disziplin, liste]) => ({ disziplin, ...sammeln(liste) }))
    .sort((a, b) => b.partien - a.partien || a.disziplin.localeCompare(b.disziplin));

  const gegner = [...gruppieren((z) => z.gegner).entries()]
    .map(([id, liste]) => ({ gegner: id, name: name(id), ...sammeln(liste) }))
    .sort((a, b) => b.partien - a.partien || a.name.localeCompare(b.name, 'de'));

  return { gesamt: sammeln(zeilen), jeDisziplin, gegner, form: zeilen.slice(0, 10), zeilen };
}

// ---------- Rating-Verlauf ----------

export type VerlaufPunkt = { datum: string; wert: number | null; racks: number };

// Rating der Person zu mehreren Stichtagen. Gerechnet wird mit derselben
// Funktion wie in der Edge-Funktion, jeweils mit allen Partien bis zu diesem
// Tag. Gespeichert ist nur der jeweils letzte Stand, deshalb wird der Verlauf
// beim Anzeigen nachgerechnet.
export function ratingVerlauf(
  person: string,
  partien: RatingPartie[],
  stichtage: string[],
  disziplin: string = GESAMT,
  startwerte: Record<string, number> = {},
  einstellungen?: Partial<RatingEinstellungen>
): VerlaufPunkt[] {
  const disziplinen = [...new Set(partien.map((p) => p.disziplin))];
  return [...stichtage]
    .sort()
    .map((stichtag) => {
      const ergebnis = berechnen({
        partien: partien.filter((p) => p.datum <= stichtag),
        startwerte,
        stichtag,
        disziplinen,
        einstellungen
      });
      const wert = ergebnis.ansichten[disziplin]?.werte[person];
      return { datum: stichtag, wert: wert ? wert.rating : null, racks: wert ? wert.racks : 0 };
    });
}
