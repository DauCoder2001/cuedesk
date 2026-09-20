// Liest den Datenbestand der Serienwertung (Turnier light, v15) und bereitet
// ihn fuer die Uebernahme auf. Reine Rechenarbeit, ohne Oberflaeche und ohne
// Datenbank - deshalb mit Tests abgesichert (test/altdaten.test.ts).

import type { Disziplin, TurnierModus } from './datenbank.types';

export type AltPartie = {
  a: string;
  b: string;
  satzA: number;
  satzB: number;
  vorgabeA?: number;
  vorgabeB?: number;
  raceTo?: number;
  phase?: string;
  werten?: boolean;
  grund?: string;
};

export type AltDatei = {
  version?: number;
  aliase?: Record<string, string>;
  serien?: {
    id: string;
    name: string;
    disziplin?: string;
    saison?: string;
    streicher?: number;
    bonus?: number;
    turniere?: {
      id: string;
      datum: string;
      name: string;
      disziplin?: string;
      modus?: string;
      teilnehmer?: number;
      ranking?: { platz: number; name: string }[];
    }[];
  }[];
  partienArchiv?: {
    id: string;
    datum: string;
    name: string;
    disziplin?: string;
    modus?: string;
    serieId?: string | null;
    werten?: boolean;
    teilnehmer?: string[];
    partien?: AltPartie[];
  }[];
  ratingEinstellungen?: { zeitraum?: number; mindestRacks?: number; rueckgriff?: number; gewicht?: number };
  ratingStartwerte?: { name: string; wert: number }[];
  ratingAusgeblendet?: string[];
};

export type AltTurnier = {
  altId: string;
  name: string;
  datum: string;
  disziplin: Disziplin;
  modus: TurnierModus;
  serieAltId: string | null;
  werten: boolean;
  ranking: { platz: number; name: string }[];
  teilnehmer: string[];
  partien: AltPartie[];
};

export type Analyse = {
  serien: { altId: string; name: string; saison: string; disziplin: Disziplin; streicher: number; bonus: number }[];
  turniere: AltTurnier[];
  namen: { name: string; partien: number; platzierungen: number }[];
  aliase: [string, string][];
  startwerte: { name: string; wert: number }[];
  ausgeblendet: string[];
  einstellungen: { zeitraum: number; mindestRacks: number; rueckgriff: number; gewicht: number };
};

const DISZIPLINEN: Record<string, Disziplin> = {
  '8-ball': '8-ball',
  '9-ball': '9-ball',
  '10-ball': '10-ball',
  'multi-ball': 'multi-ball',
  '14.1': '14-1',
  '14-1': '14-1'
};

const MODI: Record<string, TurnierModus> = {
  einzelgruppe: 'einzelgruppe',
  'zwei-gruppen': 'zwei-gruppen',
  'gruppen-ko': 'gruppen-ko'
};

const UEBERSPRINGEN = ['test'];



export function auswerten(datei: AltDatei): Analyse {
  const aliase = Object.entries(datei.aliase ?? {});
  const aufloesen = (name: string) => {
    const ziel = (datei.aliase ?? {})[name.trim().toLowerCase()];
    return (ziel ?? name).trim();
  };

  const serien = (datei.serien ?? [])
    .filter((serie) => !UEBERSPRINGEN.includes(serie.name.trim().toLowerCase()))
    .map((serie) => ({
      altId: serie.id,
      name: serie.name,
      saison: serie.saison ?? '',
      disziplin: disziplinVon(serie.disziplin),
      streicher: serie.streicher ?? 0,
      bonus: serie.bonus ?? 1
    }));

  // Turniere aus beiden Quellen zusammenfuehren: Platzierungen stehen in den
  // Serien, die Partien im Archiv. Schluessel ist Name plus Datum.
  const turniere = new Map<string, AltTurnier>();
  const schluessel = (name: string, datum: string) => `${name}|${datum}`;

  (datei.serien ?? []).forEach((serie) => {
    const gehoert = !UEBERSPRINGEN.includes(serie.name.trim().toLowerCase());
    (serie.turniere ?? []).forEach((turnier) => {
      turniere.set(schluessel(turnier.name, turnier.datum), {
        altId: turnier.id,
        name: turnier.name,
        datum: turnier.datum,
        disziplin: disziplinVon(turnier.disziplin),
        modus: modusVon(turnier.modus),
        serieAltId: gehoert ? serie.id : null,
        werten: true,
        ranking: (turnier.ranking ?? []).map((r) => ({ platz: r.platz, name: aufloesen(r.name) })),
        teilnehmer: [],
        partien: []
      });
    });
  });

  (datei.partienArchiv ?? []).forEach((archiv) => {
    const key = schluessel(archiv.name, archiv.datum);
    const vorhanden = turniere.get(key);
    const partien = (archiv.partien ?? []).map((partie) => ({
      ...partie,
      a: aufloesen(partie.a),
      b: aufloesen(partie.b)
    }));
    const teilnehmer = (archiv.teilnehmer ?? []).map(aufloesen);

    if (vorhanden) {
      vorhanden.partien = partien;
      vorhanden.teilnehmer = teilnehmer;
      vorhanden.werten = archiv.werten !== false;
      vorhanden.altId = archiv.id;
    } else {
      turniere.set(key, {
        altId: archiv.id,
        name: archiv.name,
        datum: archiv.datum,
        disziplin: disziplinVon(archiv.disziplin),
        modus: modusVon(archiv.modus),
        serieAltId: archiv.serieId ?? null,
        werten: archiv.werten !== false,
        ranking: [],
        teilnehmer,
        partien
      });
    }
  });

  const liste = [...turniere.values()].sort((a, b) => a.datum.localeCompare(b.datum));

  // Namen zaehlen
  const zaehler = new Map<string, { partien: number; platzierungen: number }>();
  const zaehle = (name: string, feld: 'partien' | 'platzierungen') => {
    const eintrag = zaehler.get(name) ?? { partien: 0, platzierungen: 0 };
    eintrag[feld] += 1;
    zaehler.set(name, eintrag);
  };
  liste.forEach((turnier) => {
    turnier.partien.forEach((partie) => {
      zaehle(partie.a, 'partien');
      zaehle(partie.b, 'partien');
    });
    turnier.ranking.forEach((platz) => zaehle(platz.name, 'platzierungen'));
    turnier.teilnehmer.forEach((name) => {
      if (!zaehler.has(name)) zaehler.set(name, { partien: 0, platzierungen: 0 });
    });
  });

  const namen = [...zaehler.entries()]
    .map(([name, zahlen]) => ({ name, ...zahlen }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));

  return {
    serien,
    turniere: liste,
    namen,
    aliase: aliase.map(([von, nach]) => [von, nach] as [string, string]),
    startwerte: (datei.ratingStartwerte ?? []).map((s) => ({ name: aufloesen(s.name), wert: s.wert })),
    ausgeblendet: (datei.ratingAusgeblendet ?? []).map(aufloesen),
    einstellungen: {
      zeitraum: datei.ratingEinstellungen?.zeitraum ?? 12,
      mindestRacks: datei.ratingEinstellungen?.mindestRacks ?? 100,
      rueckgriff: datei.ratingEinstellungen?.rueckgriff ?? 36,
      gewicht: datei.ratingEinstellungen?.gewicht ?? 30
    }
  };
}

function disziplinVon(text: string | undefined): Disziplin {
  return DISZIPLINEN[(text ?? '8-Ball').trim().toLowerCase()] ?? '8-ball';
}

function modusVon(text: string | undefined): TurnierModus {
  return MODI[(text ?? '').trim().toLowerCase()] ?? 'sonstiges';
}
