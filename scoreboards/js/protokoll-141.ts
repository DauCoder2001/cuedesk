// Das Protokoll des 14.1-Scoreboards (state.log) in Datenbankzeilen umsetzen.
// Reine Umrechnung ohne Datenbank, deshalb mit Tests abgesichert
// (test/protokoll-141.test.ts).

export type LogAufnahme = {
  t: 'inn';
  p: 1 | 2;
  balls: number;
  pkt: number;
  total: number;
  mark?: string;
  kind?: string;
  segs?: number[];
  z?: number; // Zeitpunkt, ab CueDesk erfasst
};
export type LogRack = { t: 'rack'; rackNo: number; p?: 1 | 2 };
export type LogEintrag = LogAufnahme | LogRack;

export type Zustand141 = {
  player1: string;
  player2: string;
  player1Id?: string | null;
  player2Id?: string | null;
  s1: number;
  s2: number;
  high1: number;
  high2: number;
  inn1: number;
  inn2: number;
  target: number;
  targetInn: number;
  startedAt?: number | null;
  endedAt?: number | null;
  log: LogEintrag[];
};

export type AufnahmeZeile = {
  lfd_nr: number;
  spieler: string;
  baelle: number;
  punkte: number;
  gesamt: number;
  art: 'serie' | 'sicherheit' | 'foul' | 'foul3' | 'eroeffnungsfoul' | 'ende';
  markierung: '' | '/' | '//' | '3F' | '-2';
  rack_segmente: number[];
  rack_nr: number;
  zeitpunkt: string | null;
};

const ARTEN: Record<string, AufnahmeZeile['art']> = {
  run: 'serie',
  safety: 'sicherheit',
  foul: 'foul',
  foul3: 'foul3',
  break: 'eroeffnungsfoul',
  end: 'ende'
};

const MARKIERUNGEN = new Set(['', '/', '//', '3F', '-2']);

export function aufnahmenAusProtokoll(
  log: LogEintrag[],
  spieler1: string,
  spieler2: string
): AufnahmeZeile[] {
  const zeilen: AufnahmeZeile[] = [];
  let rackNr = 1;

  for (const eintrag of log ?? []) {
    if (eintrag.t === 'rack') {
      rackNr = eintrag.rackNo;
      continue;
    }
    if (eintrag.t !== 'inn') continue;

    const markierung = (eintrag.mark ?? '') as AufnahmeZeile['markierung'];
    zeilen.push({
      lfd_nr: zeilen.length + 1,
      spieler: eintrag.p === 1 ? spieler1 : spieler2,
      baelle: eintrag.balls,
      punkte: eintrag.pkt,
      gesamt: eintrag.total,
      art: ARTEN[eintrag.kind ?? 'run'] ?? 'serie',
      markierung: MARKIERUNGEN.has(markierung) ? markierung : '',
      rack_segmente: eintrag.segs ?? [eintrag.balls],
      rack_nr: rackNr,
      zeitpunkt: eintrag.z ? new Date(eintrag.z).toISOString() : null
    });
  }
  return zeilen;
}

// Rueckweg fuer die Protokollansicht gespeicherter Partien: aus den
// Datenbankzeilen wieder state.log bauen. Rack-Trennzeilen entstehen dort,
// wo sich rack_nr erhoeht (die Ansicht zeigt sie ohnehin nur als Schraegstrich).
const ARTEN_ZURUECK: Record<AufnahmeZeile['art'], string> = {
  serie: 'run',
  sicherheit: 'safety',
  foul: 'foul',
  foul3: 'foul3',
  eroeffnungsfoul: 'break',
  ende: 'end'
};

export function protokollAusAufnahmen(zeilen: AufnahmeZeile[], spieler1: string): LogEintrag[] {
  const log: LogEintrag[] = [];
  let rackNr = 1;
  const sortiert = [...zeilen].sort((a, b) => a.lfd_nr - b.lfd_nr);
  for (const z of sortiert) {
    const p: 1 | 2 = z.spieler === spieler1 ? 1 : 2;
    while (z.rack_nr > rackNr) {
      rackNr += 1;
      log.push({ t: 'rack', rackNo: rackNr });
    }
    log.push({
      t: 'inn',
      p,
      balls: z.baelle,
      pkt: z.punkte,
      total: z.gesamt,
      mark: z.markierung,
      kind: ARTEN_ZURUECK[z.art],
      segs: z.rack_segmente,
      ...(z.zeitpunkt ? { z: Date.parse(z.zeitpunkt) } : {})
    });
  }
  return log;
}
