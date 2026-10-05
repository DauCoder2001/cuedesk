// Spiele- und Turnierarchiv: Filter nach Saison, Disziplin, Turnierart und
// Spieler, dazu der direkte Vergleich zweier Spieler. Reine Rechnung ohne
// Datenbank, abgesichert durch test/archiv.test.ts. Die Seite liegt in
// src/seiten/Archiv.tsx.

import { saisonAus } from './mannschaften';
import type { Disziplin, TurnierModus, TurnierStatus } from './datenbank.types';

export type ArchivTurnier = {
  id: string;
  name: string;
  datum: string;
  disziplin: Disziplin;
  modus: TurnierModus;
  status: TurnierStatus;
  teilnehmerzahl: number | null;
  art: string | null; // Turnierart aus den Einstellungen
  // Liga-Spieltag: Nummer dieser Begegnung und die andere Begegnung
  begegnung?: 1 | 2 | null;
  partner?: string | null;
  // Alle Begegnungen dieser Zeile (Liga-Spieltag: beide); fehlt, dann nur id
  teile?: string[];
};

export type ArchivPartie = {
  id: string;
  turnier_id: string | null;
  disziplin: Disziplin;
  datum: string;
  phase: string | null;
  gruppe: string | null;
  spieler_a: string;
  spieler_b: string;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
  beendet: string | null;
  begonnen?: string | null; // fuer die Spieldauer im Saison-Ueberblick
  tisch_id?: string | null;
};

export type ArchivTeilnahme = { turnier_id: string; person_id: string; endplatz: number | null };

// Kennzahlen einer 14.1-Partie (Tabelle partien_141)
export type Werte141 = {
  partie_id: string;
  aufnahmen_a: number;
  aufnahmen_b: number;
  hoechstserie_a: number;
  hoechstserie_b: number;
};

// Turnierart im Filter: '' alle, 'liga' Liga-Spieltage, 'einzel' Einzelspiele
// ohne Turnier, 'ohne' Turniere ohne Turnierart, sonst 'art:<Bezeichnung>'
export type ArtFilter = string;

export type ArchivFilter = {
  saison: string; // 'alle' oder "2026/27"
  disziplin: 'alle' | Disziplin;
  art: ArtFilter;
  spieler: string; // '' = alle
  gegen: string; // '' = kein Vergleich
};

const ARCHIV_STATUS: TurnierStatus[] = ['beendet', 'abgebrochen'];

export const teileVon = (t: ArchivTurnier): string[] => t.teile ?? [t.id];

// Ein Liga-Spieltag besteht aus zwei Begegnungen (zwei Turniere, die sich
// ueber partner gegenseitig kennen). Im Archiv wird daraus eine Zeile unter
// der 1. Begegnung; archiviert ist sie erst, wenn beide fertig sind.
export function spieltageZusammenfassen(turniere: ArchivTurnier[]): ArchivTurnier[] {
  const nachId = new Map(turniere.map((t) => [t.id, t]));
  const partnerVon = (t: ArchivTurnier) => {
    const andere = t.modus === 'liga' && t.partner ? nachId.get(t.partner) : undefined;
    return andere && andere.partner === t.id ? andere : null;
  };
  return turniere
    .filter((t) => !(t.begegnung === 2 && partnerVon(t)))
    .map((t) => {
      const andere = partnerVon(t);
      if (!andere) return t;
      const fertig = (s: TurnierStatus) => ARCHIV_STATUS.includes(s);
      const status: TurnierStatus =
        fertig(t.status) && fertig(andere.status)
          ? t.status === 'beendet' || andere.status === 'beendet'
            ? 'beendet'
            : 'abgebrochen'
          : fertig(t.status)
            ? andere.status
            : t.status;
      return { ...t, status, teile: [t.id, andere.id] };
    });
}

export function artText(t: ArchivTurnier): string | null {
  return t.modus === 'liga' ? 'Liga' : t.art;
}

// Auswahl fuer den Filter Turnierart: vorhandene Arten, dazu Liga und Einzelspiele
export function artOptionen(turniere: ArchivTurnier[], mitEinzelspielen: boolean): { wert: ArtFilter; name: string }[] {
  const archiv = turniere.filter((t) => ARCHIV_STATUS.includes(t.status));
  const arten = [...new Set(archiv.filter((t) => t.modus !== 'liga' && t.art).map((t) => t.art as string))].sort((a, b) =>
    a.localeCompare(b, 'de')
  );
  const liste = [{ wert: '', name: 'alle' }, ...arten.map((a) => ({ wert: `art:${a}`, name: a }))];
  if (archiv.some((t) => t.modus !== 'liga' && !t.art)) liste.push({ wert: 'ohne', name: 'ohne Turnierart' });
  if (archiv.some((t) => t.modus === 'liga')) liste.push({ wert: 'liga', name: 'Liga-Spieltage' });
  if (mitEinzelspielen) liste.push({ wert: 'einzel', name: 'Einzelspiele' });
  return liste;
}

// Saisons vom ersten Eintrag bis heute, neueste zuerst
export function saisonOptionen(fruehestes: string | null, heute: string, beginn = 7): string[] {
  const bis = Number(saisonAus(heute, beginn).slice(0, 4));
  const von = fruehestes ? Math.min(bis, Number(saisonAus(fruehestes, beginn).slice(0, 4))) : bis;
  const liste: string[] = [];
  for (let jahr = bis; jahr >= von; jahr -= 1) liste.push(`${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`);
  return liste;
}

// Erster und letzter Tag einer Saison, fuer die Abfrage
export function saisonZeitraum(saison: string, beginn = 7): { von: string; bis: string } {
  const jahr = Number(saison.slice(0, 4));
  const monat = String(beginn).padStart(2, '0');
  const ende = new Date(Date.UTC(jahr + 1, beginn - 1, 0)); // Tag vor dem naechsten Beginn
  return { von: `${jahr}-${monat}-01`, bis: ende.toISOString().slice(0, 10) };
}

const spielt = (p: ArchivPartie, person: string) => p.spieler_a === person || p.spieler_b === person;

// Partien und Turniere, die zu den Filtern passen. Im Archiv stehen nur
// beendete und abgebrochene Turniere und nur beendete Partien.
export function archivFiltern(
  turniere: ArchivTurnier[],
  partien: ArchivPartie[],
  teilnahmen: ArchivTeilnahme[],
  f: ArchivFilter,
  beginn = 7
): { turniere: ArchivTurnier[]; partien: ArchivPartie[] } {
  const inSaison = (datum: string) => f.saison === 'alle' || saisonAus(datum, beginn) === f.saison;
  const artPasst = (t: ArchivTurnier) =>
    f.art === '' ||
    (f.art === 'liga' && t.modus === 'liga') ||
    (f.art === 'ohne' && t.modus !== 'liga' && !t.art) ||
    (f.art.startsWith('art:') && t.modus !== 'liga' && t.art === f.art.slice(4));

  const personen = [f.spieler, f.gegen].filter(Boolean);
  const partienJeTurnier = new Map<string, ArchivPartie[]>();
  partien.forEach((p) => {
    if (!p.turnier_id) return;
    const liste = partienJeTurnier.get(p.turnier_id) ?? [];
    liste.push(p);
    partienJeTurnier.set(p.turnier_id, liste);
  });
  const teilnehmer = new Set(teilnahmen.map((t) => `${t.turnier_id}|${t.person_id}`));
  // Partien einer Zeile, beim Liga-Spieltag aus beiden Begegnungen
  const partienVon = (t: ArchivTurnier) => teileVon(t).flatMap((id) => partienJeTurnier.get(id) ?? []);

  const turnierListe = turniere
    .filter((t) => ARCHIV_STATUS.includes(t.status) && inSaison(t.datum) && artPasst(t) && f.art !== 'einzel')
    .filter((t) => {
      if (f.disziplin === 'alle' || t.disziplin === f.disziplin) return true;
      // Liga-Spieltage mischen die Disziplinen
      return partienVon(t).some((p) => p.disziplin === f.disziplin);
    })
    .filter((t) =>
      personen.every(
        (person) =>
          teileVon(t).some((id) => teilnehmer.has(`${id}|${person}`)) || partienVon(t).some((p) => spielt(p, person))
      )
    )
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.name.localeCompare(b.name, 'de'));

  const turnierIds = new Set(
    turniere.filter((t) => ARCHIV_STATUS.includes(t.status) && artPasst(t) && f.art !== 'einzel').flatMap(teileVon)
  );
  const partienListe = partien
    .filter((p) => (p.turnier_id ? turnierIds.has(p.turnier_id) : f.art === '' || f.art === 'einzel'))
    .filter((p) => inSaison(p.datum) && (f.disziplin === 'alle' || p.disziplin === f.disziplin))
    .filter((p) => (f.spieler ? spielt(p, f.spieler) : true) && (f.gegen ? spielt(p, f.gegen) : true))
    .sort(neuesteZuerst);

  return { turniere: turnierListe, partien: partienListe };
}

export function neuesteZuerst(x: ArchivPartie, y: ArchivPartie): number {
  return (y.datum + (y.beendet ?? '')).localeCompare(x.datum + (x.beendet ?? ''));
}

// Wer hat gewonnen? Das Ergebnis enthaelt die Vorgabe.
export function siegerVon(p: ArchivPartie): 'a' | 'b' | null {
  const a = p.ergebnis_a ?? 0;
  const b = p.ergebnis_b ?? 0;
  return a > b ? 'a' : b > a ? 'b' : null;
}

const KO_NAMEN: [string, string][] = [
  ['af', 'Achtelfinale'],
  ['qf', 'Viertelfinale'],
  ['sf', 'Halbfinale'],
  ['fin', 'Finale'],
  ['bro', 'Spiel um Platz 3']
];

// Runde einer Partie fuer die Liste
export function rundeText(p: Pick<ArchivPartie, 'phase' | 'gruppe'>): string {
  const phase = p.phase ?? '';
  if (phase === 'ko') return KO_NAMEN.find(([k]) => (p.gruppe ?? '').toLowerCase().startsWith(k))?.[1] ?? 'KO-Runde';
  if (phase === 'gruppe') return p.gruppe ? `Gruppe ${p.gruppe}` : 'Gruppe';
  if (phase === 'hin') return 'Hinrunde';
  if (phase === 'rueck') return 'Rückrunde';
  if (phase === 'phase3') return 'Platzierung';
  return phase || '–';
}

// Platz eines Spielers im Turnier; im Liga-Spieltag seine Bilanz (Siege:Niederlagen)
export function platzText(
  t: ArchivTurnier,
  person: string,
  teilnahmen: ArchivTeilnahme[],
  partien: ArchivPartie[]
): string {
  if (t.modus === 'liga') {
    const teile = teileVon(t);
    const eigene = partien.filter((p) => p.turnier_id !== null && teile.includes(p.turnier_id) && spielt(p, person));
    if (eigene.length === 0) return '';
    const siege = eigene.filter((p) => siegerVon(p) === (p.spieler_a === person ? 'a' : 'b')).length;
    return `${siege}:${eigene.length - siege}`;
  }
  const eintrag = teilnahmen.find((x) => x.turnier_id === t.id && x.person_id === person);
  if (!eintrag) return '';
  return eintrag.endplatz ? `${eintrag.endplatz}.` : '–';
}

// ---------- Direkter Vergleich ----------

export type VergleichBilanz = {
  partien: number;
  siegeA: number;
  siegeB: number;
  unentschieden: number;
  racksA: number; // gespielte Racks ohne Vorgabe (nur Pool)
  racksB: number;
};

export type VergleichDisziplin = VergleichBilanz & {
  disziplin: Disziplin;
  // 14.1: Generaldurchschnitt und Hoechstserie aus partien_141, soweit lesbar
  gdA: number | null;
  gdB: number | null;
  hsA: number | null;
  hsB: number | null;
  ohneWerte: number; // 14.1-Partien ohne lesbare Kennzahlen
};

export type Begegnung = { partie: ArchivPartie; sieger: 'a' | 'b' | null }; // a/b aus Sicht des Vergleichs

export type Vergleich = {
  gesamt: VergleichBilanz;
  jeDisziplin: VergleichDisziplin[];
  letzte: Begegnung[]; // bis zu zehn, die aelteste zuerst
};

const DISZIPLIN_FOLGE: Disziplin[] = ['8-ball', '9-ball', '10-ball', 'multi-ball', '14-1'];

const leer = (): VergleichBilanz => ({ partien: 0, siegeA: 0, siegeB: 0, unentschieden: 0, racksA: 0, racksB: 0 });

// Vergleich von a und b aus den Partien, in denen beide gegeneinander spielten
export function direktvergleich(a: string, b: string, partien: ArchivPartie[], werte141: Werte141[] = []): Vergleich {
  const begegnungen = partien
    .filter((p) => (p.spieler_a === a && p.spieler_b === b) || (p.spieler_a === b && p.spieler_b === a))
    .sort(neuesteZuerst);
  const kennzahlen = new Map(werte141.map((w) => [w.partie_id, w]));
  const gesamt = leer();
  const jeDisziplin = new Map<Disziplin, VergleichDisziplin & { punkteA: number; punkteB: number; aufnA: number; aufnB: number }>();

  const letzte: Begegnung[] = begegnungen.map((p) => {
    const aVorne = p.spieler_a === a;
    const roh = siegerVon(p);
    const sieger = roh === null ? null : (roh === 'a') === aVorne ? 'a' : 'b';
    const eigene = (aVorne ? p.ergebnis_a : p.ergebnis_b) ?? 0;
    const fremde = (aVorne ? p.ergebnis_b : p.ergebnis_a) ?? 0;
    const racksA = Math.max(0, eigene - (aVorne ? p.vorgabe_a : p.vorgabe_b));
    const racksB = Math.max(0, fremde - (aVorne ? p.vorgabe_b : p.vorgabe_a));

    const d =
      jeDisziplin.get(p.disziplin) ??
      { ...leer(), disziplin: p.disziplin, gdA: null, gdB: null, hsA: null, hsB: null, ohneWerte: 0, punkteA: 0, punkteB: 0, aufnA: 0, aufnB: 0 };
    for (const b of [d, gesamt]) {
      // Racks nur im Pool; 14.1 zaehlt Punkte
      if (p.disziplin !== '14-1') {
        b.racksA += racksA;
        b.racksB += racksB;
      }
      b.partien += 1;
      if (sieger === 'a') b.siegeA += 1;
      else if (sieger === 'b') b.siegeB += 1;
      else b.unentschieden += 1;
    }
    if (p.disziplin === '14-1') {
      const w = kennzahlen.get(p.id);
      if (w) {
        d.punkteA += eigene;
        d.punkteB += fremde;
        d.aufnA += aVorne ? w.aufnahmen_a : w.aufnahmen_b;
        d.aufnB += aVorne ? w.aufnahmen_b : w.aufnahmen_a;
        d.hsA = Math.max(d.hsA ?? 0, aVorne ? w.hoechstserie_a : w.hoechstserie_b);
        d.hsB = Math.max(d.hsB ?? 0, aVorne ? w.hoechstserie_b : w.hoechstserie_a);
      } else d.ohneWerte += 1;
    }
    jeDisziplin.set(p.disziplin, d);
    return { partie: p, sieger };
  });

  return {
    gesamt,
    jeDisziplin: DISZIPLIN_FOLGE.filter((k) => jeDisziplin.has(k)).map((k) => {
      const { punkteA, punkteB, aufnA, aufnB, ...rest } = jeDisziplin.get(k)!;
      return { ...rest, gdA: aufnA > 0 ? punkteA / aufnA : null, gdB: aufnB > 0 ? punkteB / aufnB : null };
    }),
    letzte: letzte.slice(0, 10).reverse()
  };
}
