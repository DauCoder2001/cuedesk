import { endtabelleZweiGruppen, gruppenRangliste } from './gruppen';
import { KO_GRUPPEN, endtabelleKo, koAufloesen, phase3Paare } from './ko';
import type { KoRunde, Leistung } from './ko';
import { spielBeendet } from './turnier';
import type { HandReihenfolge, RanglistenPartie, Stand } from './turnier';
import type { TurnierEinstellungen } from './seiten/Turniere';

// Vorlaeufige Endplaetze fuer den Fernseher ("TV zeigt: Endplaetze"), solange
// das Turnier laeuft: bei Zwei Gruppen aus den Platzierungsduellen, bei
// Gruppen mit KO aus KO-Runde und Platzierungsspielen. Gerechnet mit denselben
// Bausteinen wie die Turnieransicht (endtabelleZweiGruppen, endtabelleKo).
// Offene Spiele stehen als eine Zeile mit Platzbereich ("3.–4.") und beiden
// Namen, noch unbekannte Plaetze ohne Namen.

export type EndplatzPartie = {
  id: string;
  phase: string | null;
  gruppe: string | null;
  paarung: number | null;
  spieler_a: string | null;
  spieler_b: string | null;
  ergebnis_a: Stand;
  ergebnis_b: Stand;
  vorgabe_a: number;
  vorgabe_b: number;
  race_to: number | null;
  status: string;
  tisch_id: string | null;
};

export type EndplatzTeilnehmer = { person_id: string; startnummer: number | null; gruppe: string | null };

export type EndplatzZeile = {
  von: number;
  bis: number;
  personen: string[]; // leer: noch nicht bekannt
  info: string; // Ergebnis oder wie der Platz zustande kam
  offen: boolean;
  partieId: string | null; // offenes Spiel, fuer den laufenden Stand am TV
  tisch: string | null;
};

export type VorlaeufigeEndplaetze = {
  art: 'duelle' | 'ko';
  beendet: number; // Spiele dieser Phase(n)
  gesamt: number;
  zeilen: EndplatzZeile[];
};

const istGruppenspiel = (p: EndplatzPartie) => !p.phase || p.phase === 'gruppe';

export function vorlaeufigeEndplaetze(
  modus: string,
  e: TurnierEinstellungen,
  teilnehmer: EndplatzTeilnehmer[],
  partien: EndplatzPartie[],
  tischNummer: (id: string) => string | null
): VorlaeufigeEndplaetze | null {
  const raceTo = e.raceTo ?? 0;
  const stand = (p: EndplatzPartie | undefined) =>
    p ? { s1: p.ergebnis_a ?? p.vorgabe_a, s2: p.ergebnis_b ?? p.vorgabe_b } : { s1: null, s2: null };
  // Offenes Spiel zu genau diesen Spielern (ausser Gruppenspielen)
  const partieVon = (wer: string[]) =>
    wer.length === 2
      ? partien.find(
          (p) =>
            !istGruppenspiel(p) &&
            ((p.spieler_a === wer[0] && p.spieler_b === wer[1]) || (p.spieler_a === wer[1] && p.spieler_b === wer[0]))
        ) ?? null
      : null;
  const offeneZeile = (von: number, bis: number, wer: string[], info: string): EndplatzZeile => {
    const p = partieVon(wer);
    return { von, bis, personen: wer, info, offen: true, partieId: p?.id ?? null, tisch: p?.tisch_id ? tischNummer(p.tisch_id) : null };
  };
  const zaehlen = (liste: EndplatzPartie[]) => ({
    beendet: liste.filter((p) => spielBeendet(p.ergebnis_a, p.ergebnis_b, p.race_to ?? raceTo)).length,
    gesamt: liste.length
  });

  // Zwei Gruppen: Duell i entscheidet die Plaetze 2i-1 und 2i
  if (modus === 'zwei-gruppen') {
    const p2 = e.phase2;
    if (!p2) return null;
    const race2 = e.racePhase2 ?? raceTo;
    const duelle = partien.filter((p) => p.phase === 'phase2');
    const tabelle = endtabelleZweiGruppen(
      p2.A,
      p2.B,
      p2.A.slice(0, Math.min(p2.A.length, p2.B.length)).map((_, i) => {
        const d = duelle.find((x) => x.paarung === i + 1);
        return { standA: d ? d.ergebnis_a ?? d.vorgabe_a : null, standB: d ? d.ergebnis_b ?? d.vorgabe_b : null };
      }),
      race2
    );
    const zeilen: EndplatzZeile[] = [];
    for (let i = 0; i < tabelle.length; i += 1) {
      const z = tabelle[i];
      if (z.spielfrei) {
        zeilen.push({ von: z.platz, bis: z.platz, personen: [z.wer], info: 'spielfrei', offen: false, partieId: null, tisch: null });
      } else if (z.offen) {
        const zwei = tabelle[i + 1];
        zeilen.push(offeneZeile(z.platz, zwei.platz, [z.wer, zwei.wer], ''));
        i += 1;
      } else {
        const zwei = tabelle[i + 1];
        const [w, l] = z.ergebnis.split(' : ');
        zeilen.push({ von: z.platz, bis: z.platz, personen: [z.wer], info: z.ergebnis, offen: false, partieId: null, tisch: null });
        zeilen.push({ von: zwei.platz, bis: zwei.platz, personen: [zwei.wer], info: `${l} : ${w}`, offen: false, partieId: null, tisch: null });
        i += 1;
      }
    }
    return { art: 'duelle', ...zaehlen(duelle), zeilen };
  }

  // Gruppen mit KO: wie die Turnieransicht (Baum, Gruppenleistung, Phase 3)
  if (modus === 'gruppen-ko') {
    const ko = e.ko;
    if (!ko) return null;
    const rk = e.raceKo;
    const raceFuer = (runde: KoRunde) =>
      (runde === 'R16' ? rk?.R16 : runde === 'QF' ? rk?.QF : runde === 'FIN' ? rk?.FIN : rk?.SF) ?? raceTo;
    const koPartien = partien.filter((p) => p.phase === 'ko');
    const baum = koAufloesen(
      ko,
      (id, p1, p2) => stand(koPartien.find((x) => x.gruppe === id && x.spieler_a === p1 && x.spieler_b === p2)),
      raceFuer
    );

    // Startliste und Gruppentabellen wie in der Turnieransicht
    const aufstellung = teilnehmer
      .filter((t) => t.startnummer !== null)
      .sort((a, b) => (a.startnummer ?? 0) - (b.startnummer ?? 0));
    const posVon = new Map(aufstellung.map((t, i) => [t.person_id, i]));
    const gruppenNamen = KO_GRUPPEN.slice(0, ko.gruppenzahl);
    const gruppen: Record<string, number[]> = Object.fromEntries(gruppenNamen.map((g) => [g, [] as number[]]));
    aufstellung.forEach((t, i) => {
      if (t.gruppe && gruppen[t.gruppe]) gruppen[t.gruppe].push(i);
    });
    const eingabe: RanglistenPartie[] = partien
      .filter(istGruppenspiel)
      .filter((p) => p.spieler_a !== null && p.spieler_b !== null && posVon.has(p.spieler_a) && posVon.has(p.spieler_b))
      .map((p) => ({
        a: posVon.get(p.spieler_a as string) as number,
        b: posVon.get(p.spieler_b as string) as number,
        standA: p.ergebnis_a,
        standB: p.ergebnis_b,
        vorgabeA: p.vorgabe_a,
        vorgabeB: p.vorgabe_b
      }));
    const hand: HandReihenfolge = e.handReihenfolge ?? {};
    const personVon = (pos: number) => aufstellung[pos]?.person_id ?? '';
    const leistung = new Map<string, Leistung>();
    gruppenNamen.forEach((g) => {
      const zeilen = gruppenRangliste(gruppen[g] ?? [], eingabe, hand).zeilen;
      const fest = ko.reihung[g] ?? zeilen.map((z) => personVon(z.pos));
      zeilen.forEach((z) => {
        const id = personVon(z.pos);
        const platz = fest.indexOf(id);
        leistung.set(id, { gruppe: g, platz: platz >= 0 ? platz + 1 : 99, punkte: z.punkte, diff: z.diff, gewonnen: z.gewonnen });
      });
    });

    const p3 = e.phase3;
    const p3Partien = partien.filter((p) => p.phase === 'phase3');
    const race3 = e.racePhase3 ?? raceTo;
    const tabelle = endtabelleKo(
      ko,
      baum,
      leistung,
      gruppenNamen.map((g) => (gruppen[g] ?? []).map(personVon)),
      (id) => posVon.get(id) ?? 999,
      p3
        ? {
            reihung: p3.reihung,
            abPlatz: p3.abPlatz,
            race: race3,
            staende: phase3Paare(p3.reihung).paare.map((_, i) => stand(p3Partien.find((x) => x.paarung === i + 1)))
          }
        : null
    );

    // Offene Zeilen mit derselben Angabe zu einem Platzbereich zusammenfassen
    const zeilen: EndplatzZeile[] = [];
    for (const z of tabelle) {
      const letzte = zeilen[zeilen.length - 1];
      if (z.offen && letzte?.offen && letzte.info === z.wie && letzte.bis + 1 === z.platz) {
        letzte.bis = z.platz;
        if (z.wer !== null) letzte.personen.push(z.wer);
        const p = partieVon(letzte.personen);
        letzte.partieId = p?.id ?? null;
        letzte.tisch = p?.tisch_id ? tischNummer(p.tisch_id) : null;
        continue;
      }
      zeilen.push(
        z.offen
          ? offeneZeile(z.platz, z.platz, z.wer !== null ? [z.wer] : [], z.wie)
          : { von: z.platz, bis: z.platz, personen: z.wer !== null ? [z.wer] : [], info: z.wie, offen: false, partieId: null, tisch: null }
      );
    }
    return { art: 'ko', ...zaehlen([...koPartien, ...p3Partien]), zeilen };
  }

  return null;
}
