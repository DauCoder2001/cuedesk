import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import LigaAnsicht, { andereBegegnungAnlegen } from './LigaAnsicht';
import TurnierAnsicht from './TurnierAnsicht';
import Ausschreibungen from './Ausschreibungen';
import { LIGEN, partnerVon, spieltagStand, zweiteBegegnungIds } from '../liga';
import type { Ausspielziele, LigaKennung } from '../liga';
import type { Ausschreibung } from '../ausschreibung';
import { saisonAus } from '../mannschaften';
import { vereinsEinstellungen } from '../vereinseinstellungen';
import { kurzesRaceHinweis } from '../vorgabe';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { useUngespeichert, weichtAb } from '../ungespeichert';
import { useRueckfrage } from '../rueckfrage';
import type { Disziplin, Mannschaft, Serie, Turnier, TurnierModus, TurnierStatus } from '../datenbank.types';

// Turnierliste. Turnierleiter, Sportwart und Vereins-Admin legen Turniere an
// und fuehren sie; Mitglieder sehen alles nur zum Lesen.

export const DISZIPLIN_TEXT: Record<Disziplin, string> = {
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball',
  'multi-ball': 'Multi-Ball',
  '14-1': '14.1'
};

// Serie ohne feste Disziplin bzw. Turnier, dessen Disziplin noch offen ist
export const DISZIPLIN_OFFEN_TEXT = 'am Spieltag festgelegt';

// Modus, der erst am Turniertag nach der Teilnehmerzahl festgelegt wird
export const MODUS_OFFEN_TEXT = 'am Turniertag festlegen';

// Disziplin eines Turniers fuer die Anzeige: offen, bis sie festgelegt ist
export function turnierDisziplinText(t: Pick<Turnier, 'disziplin' | 'einstellungen'>): string {
  return (t.einstellungen as TurnierEinstellungen | null)?.disziplinOffen ? 'Disziplin offen' : DISZIPLIN_TEXT[t.disziplin];
}

export const MODUS_TEXT: Record<TurnierModus, string> = {
  einzelgruppe: 'Einzelgruppe',
  'zwei-gruppen': 'Zwei Gruppen',
  'gruppen-ko': 'Gruppen mit KO',
  einzelspiel: 'Einzelspiel',
  liga: 'Liga-Spieltag',
  sonstiges: 'Sonstiges'
};

export const STATUS_TEXT: Record<TurnierStatus, string> = {
  geplant: 'in Vorbereitung',
  laeuft: 'läuft',
  beendet: 'beendet',
  abgebrochen: 'abgebrochen'
};

// Was ein Turnier in turniere.einstellungen mitbringt
export type TurnierEinstellungen = {
  raceTo?: number; // Einzelgruppe und Gruppenphase
  racePhase2?: number; // Zwei Gruppen: Platzierungsduelle
  phase2?: { A: string[]; B: string[] }; // Zwei Gruppen: beim Start von Phase 2 fixierte Gruppenreihenfolge
  tausch?: { raus: string; rein: string; von: string; nach: string; zeit: string }[]; // Gruppentausch von Hand
  // Gruppen mit KO
  gruppenzahl?: number; // 2 oder 4, fest ab der Auslosung
  weiter?: number; // Spieler je Gruppe in der KO-Runde
  paarung?: number; // 1 Standard, 2 ueber Kreuz (nur zwei Gruppen, KO-Feld 8)
  raceKo?: { R16?: number; QF?: number; SF?: number; FIN?: number }; // Halbfinale gilt auch fuer Platz 3
  racePhase3?: number;
  ko?: { seeds: string[]; option: number; gruppenzahl: number; weiter: number; reihung: Record<string, string[]> };
  phase3?: { reihung: string[]; abPlatz: number };
  nachgetragen?: { person: string; gruppe: string | null; zeit: string }[]; // Nachzuegler fuer den Bericht
  // Liga-Spieltag (Begegnung)
  liga?: {
    liga: LigaKennung;
    spieltag: number;
    heim: boolean; // Heimrecht der eigenen Mannschaft im ersten Spiel
    gegner: string; // Name der gegnerischen Mannschaft
    eigene: string; // Name der eigenen Mannschaft
    mannschaft_id?: string | null; // gemeldete Mannschaft, fuer Kader und Saisonuebersicht
    ziele: Ausspielziele;
    // Ein Spieltag besteht aus zwei Begegnungen am selben Tag; in der zweiten
    // wechselt das Heimrecht (BLVN, 2er-Spieltage).
    begegnung: 1 | 2;
    // Verdeckte Aufstellung: je Runde und Mannschaft, bis der Kapitaen sie freigibt
    verdeckt?: { hin?: { heim?: boolean; gast?: boolean }; rueck?: { heim?: boolean; gast?: boolean } };
    // Hin- und Rueckrunde einzeln fuer die Tablets freigegeben; fehlt der
    // Eintrag bei einem laufenden Spieltag (alter Stand), gelten beide als gestartet
    gestartet?: { hin?: boolean; rueck?: boolean };
    partner?: string; // die jeweils andere Begegnung des Spieltags
    // Halbe Aufstellung: Spiele, in denen erst eine Seite feststeht (Schluessel
    // ist die Spielnummer). Mit beiden Spielern wird daraus eine Partie.
    aufstellung?: Record<string, { heim?: string | null; gast?: string | null }>;
    quelle?: string; // URL des eingelesenen Spielberichts
  };
  vorgabe?: { aktiv: boolean; staerke: number; obergrenze: number };
  handReihenfolge?: Record<string, number[]>;
  pausiert?: boolean; // Tablets starten keine neuen Spiele
  art?: string; // Turnierart (Bezeichnung aus der Liste des Vereins, beim Anlegen festgehalten)
  // Disziplin wird erst am Spieltag festgelegt (Serie ohne feste Disziplin).
  // turniere.disziplin traegt bis dahin einen Platzhalter; Auslosen geht erst danach.
  disziplinOffen?: boolean;
  // Modus wird am Turniertag nach der Teilnehmerzahl festgelegt (Vorschlag nach
  // den Grenzen auf der Seite System). turniere.modus traegt bis dahin einen Platzhalter.
  modusOffen?: boolean;
  chat?: boolean; // Chat fuer Zuschauer (nur wenn der Verein ihn eingeschaltet hat)
  live?: boolean; // Live-Uebertragung, solange das Turnier laeuft (fehlt: an; Stufe 25)
  tvAnsicht?: 'auslosung' | 'live' | 'results'; // was die Fernseher zeigen
  beginn?: string; // erstes Ergebnis (Zeitprognose)
  ausschreibung?: Ausschreibung; // Einladung zum Turnier (src/ausschreibung.ts)
};

const heute = () => new Date().toISOString().slice(0, 10);

export default function Turniere({ hervorheben }: { hervorheben?: string | null }) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');

  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [serien, setSerien] = useState<Serie[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [formular, setFormular] = useState(false);
  // Turnier, das im Formular geaendert wird (null: neues Turnier)
  const [bearbeitet, setBearbeitet] = useState<Turnier | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();
  const [fehler, setFehler] = useState<string | null>(null);
  const pflicht = usePflicht();

  // Formularfelder
  const [name, setName] = useState('');
  const [datum, setDatum] = useState(heute());
  // 'offen': Disziplin wird am Spieltag festgelegt (nur bei Serien ohne feste Disziplin)
  const [disziplin, setDisziplin] = useState<Disziplin | 'offen'>('9-ball');
  // 'offen': Modus wird am Turniertag nach der Teilnehmerzahl festgelegt
  const [modus, setModus] = useState<TurnierModus | 'offen'>('einzelgruppe');
  const [raceTo, setRaceTo] = useState('5');
  const [racePhase2, setRacePhase2] = useState('5');
  const [raceKo, setRaceKo] = useState({ R16: '5', QF: '5', SF: '5', FIN: '5', P3: '5' });
  const [liga, setLiga] = useState<LigaKennung>('kreisliga');
  const [spieltag, setSpieltag] = useState('1');
  const [heim, setHeim] = useState(true);
  const [gegner, setGegner] = useState('');
  const [eigeneMannschaft, setEigeneMannschaft] = useState('');
  const [mannschaften, setMannschaften] = useState<Mannschaft[]>([]);
  const [mannschaftId, setMannschaftId] = useState('');
  // Spaß-Liga: eigene Ausspielziele
  const [ziele, setZiele] = useState({ punkte141: '50', aufnahmen141: '20', '8-ball': '4', '9-ball': '5', '10-ball': '4' });
  const [serieId, setSerieId] = useState('');
  const [vorgabeAn, setVorgabeAn] = useState(true);
  const [staerke, setStaerke] = useState('75');
  const [obergrenze, setObergrenze] = useState('0');
  const [ratingWerten, setRatingWerten] = useState(true);
  const [art, setArt] = useState('');
  const [chat, setChat] = useState(true);
  const [live, setLive] = useState(true);
  // Filter der Turnierliste nach Turnierart ('' = alle)
  const [artFilter, setArtFilter] = useState('');
  // Ausgleich in Prozent aus den Rating-Einstellungen, falls der Verein keinen eigenen vorgibt
  const [ratingStaerke, setRatingStaerke] = useState(75);
  const vorgaben = vereinsEinstellungen(verein?.einstellungen);

  // Stand des Formulars; beim Oeffnen festgehalten, damit ein Wechsel nach
  // Aenderungen nachfragt
  const formularStand = formular
    ? { name, datum, disziplin, modus, raceTo, racePhase2, raceKo, liga, spieltag, heim, gegner, eigeneMannschaft,
        mannschaftId, ziele, serieId, vorgabeAn, staerke, obergrenze, ratingWerten, art, chat, live }
    : null;
  const [ursprung, setUrsprung] = useState<unknown>(null);
  useEffect(() => {
    // Laeuft nach dem Rendern, in dem sich das Formular geoeffnet hat - dann
    // sind alle Vorgaben schon gesetzt.
    setUrsprung(formularStand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formular]);
  const wechselErlaubt = useUngespeichert(
    'turnier',
    weichtAb(formularStand, ursprung),
    bearbeitet
      ? `Die Änderungen an „${bearbeitet.name}“`
      : name.trim()
        ? `Das neue Turnier „${name.trim()}“`
        : 'Das neue Turnier',
    () => anlegen()
  );

  const laden = useCallback(async () => {
    if (!verein) return;
    const [turnierAntwort, serienAntwort, einstellungAntwort, mannschaftAntwort] = await Promise.all([
      supabase.from('turniere').select('*').eq('verein_id', verein.id).order('datum', { ascending: false }),
      supabase.from('serien').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('name'),
      supabase.from('rating_einstellungen').select('staerke_prozent').eq('verein_id', verein.id).maybeSingle(),
      supabase.from('mannschaften').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('rang')
    ]);
    if (turnierAntwort.error) setFehler(turnierAntwort.error.message);
    setTurniere(turnierAntwort.data ?? []);
    setSerien(serienAntwort.data ?? []);
    setMannschaften(mannschaftAntwort.data ?? []);
    if (einstellungAntwort.data) setRatingStaerke(einstellungAntwort.data.staerke_prozent);
  }, [verein]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Gemeldete Mannschaften der Saison, in die das Datum faellt
  const mannschaftenDerSaison = mannschaften.filter((m) => m.saison === saisonAus(datum, vorgaben.saisonbeginn));
  const gewaehlteMannschaft = mannschaftenDerSaison.find((m) => m.id === mannschaftId) ?? null;
  const gewaehlteSerie = serien.find((s) => s.id === serieId) ?? null;

  // Die Mannschaft bringt ihre Liga mit; frei eingetragene Namen nicht.
  function mannschaftWaehlen(id: string) {
    setMannschaftId(id);
    const m = mannschaftenDerSaison.find((x) => x.id === id);
    if (m?.liga && m.liga in LIGEN) setLiga(m.liga as LigaKennung);
  }

  // Kurze Races stufen die Vorgabe grob ab; beim Anlegen darauf hinweisen
  // Bei "am Turniertag festlegen" gelten die Race-Felder aller Modi
  const mitZwei = modus === 'zwei-gruppen' || modus === 'offen';
  const mitKoFeldern = modus === 'gruppen-ko' || modus === 'offen';
  const hinweisKurzesRace = kurzesRaceHinweis([
    Number(raceTo),
    ...(mitZwei ? [Number(racePhase2)] : []),
    ...(mitKoFeldern ? Object.values(raceKo).map(Number) : [])
  ]);

  async function anlegen() {
    if (!verein) return;
    setFehler(null);
    const race = Number(raceTo);
    if (!pflicht.pruefen()) return;
    const race2 = Number(racePhase2);
    if (!Number.isInteger(race) || race < 1 || race > 25) return pflicht.melden('Race to zwischen 1 und 25.');
    if (mitZwei && (!Number.isInteger(race2) || race2 < 1 || race2 > 25)) {
      return pflicht.melden('Race to für die Platzierungsduelle zwischen 1 und 25.');
    }
    const ko = Object.fromEntries(Object.entries(raceKo).map(([k, v]) => [k, Number(v)]));
    if (mitKoFeldern && Object.values(ko).some((x) => !Number.isInteger(x) || x < 1 || x > 25)) {
      return pflicht.melden('Race to je Runde zwischen 1 und 25.');
    }
    const eigeneZiele: Ausspielziele = {
      punkte141: Number(ziele.punkte141),
      aufnahmen141: Number(ziele.aufnahmen141),
      '8-ball': Number(ziele['8-ball']),
      '9-ball': Number(ziele['9-ball']),
      '10-ball': Number(ziele['10-ball'])
    };
    if (
      modus === 'liga' &&
      liga === 'spass' &&
      Object.values(eigeneZiele).some((x) => !Number.isInteger(x) || x < 1 || x > 200)
    ) {
      return pflicht.melden('Ausspielziele: ganze Zahlen zwischen 1 und 200.');
    }
    const einstellungen: TurnierEinstellungen = {
      raceTo: race,
      ...(modus === 'liga'
        ? {
            liga: {
              liga,
              spieltag: Math.max(1, Number(spieltag) || 1),
              heim,
              gegner: gegner.trim(),
              eigene: gewaehlteMannschaft?.name ?? (eigeneMannschaft.trim() || verein.name),
              mannschaft_id: mannschaftId || null,
              ziele: liga === 'spass' ? eigeneZiele : LIGEN[liga].ziele,
              begegnung: 1 as const
            }
          }
        : {}),
      ...(mitZwei ? { racePhase2: race2 } : {}),
      ...(mitKoFeldern
        ? { raceKo: { R16: ko.R16, QF: ko.QF, SF: ko.SF, FIN: ko.FIN }, racePhase3: ko.P3 }
        : {}),
      vorgabe: {
        // In der Liga wird ohne Vorgabe gespielt (Ausschreibung, Abschnitt Modus)
        aktiv: modus === 'liga' ? false : vorgabeAn,
        staerke: Math.min(100, Math.max(0, Number(staerke) || 0)),
        obergrenze: Math.max(0, Number(obergrenze) || 0)
      },
      chat: vorgaben.chat && chat,
      live,
      ...(modus !== 'liga' && disziplin === 'offen' ? { disziplinOffen: true } : {}),
      ...(modus === 'offen' ? { modusOffen: true } : {})
    };
    // Platzhalter, solange der Modus offen ist; festgelegt wird vor dem Auslosen
    const dbModus: TurnierModus = modus === 'offen' ? 'einzelgruppe' : modus;
    // Platzhalter, solange die Disziplin offen ist; festgelegt wird vor dem Auslosen
    const dbDisziplin: Disziplin =
      modus === 'liga' ? 'multi-ball' : disziplin === 'offen' ? vorgaben.turnier.disziplin : disziplin;
    if (bearbeitet) return aenderungSpeichern(bearbeitet, einstellungen, dbDisziplin, dbModus);
    const { data, error } = await supabase
      .from('turniere')
      .insert({
        verein_id: verein.id,
        name: name.trim(),
        datum,
        disziplin: dbDisziplin,
        modus: dbModus,
        serie_id: serieId || null,
        status: 'geplant',
        rating_werten: ratingWerten,
        einstellungen: art ? { ...einstellungen, art } : einstellungen
      })
      .select('*')
      .single();
    if (error || !data) return setFehler(error?.message ?? 'Turnier nicht angelegt.');
    // Ein Liga-Spieltag hat immer zwei Begegnungen; die zweite gleich mit anlegen.
    // Klappt das nicht, holt der Umschalter in der Liga-Ansicht sie nach.
    if (modus === 'liga') {
      const zweite = await andereBegegnungAnlegen(data);
      if (zweite.fehler !== null) setFehler(`Die 2. Begegnung wurde nicht angelegt: ${zweite.fehler}`);
    }
    setFormular(false);
    setName('');
    await laden();
    setOffen(data.id);
    return true;
  }

  // Formular mit den Werten eines Turniers fuellen (Aendern bis zur Auslosung)
  function formularAus(t: Turnier) {
    const e = (t.einstellungen ?? {}) as TurnierEinstellungen;
    const race = String(e.raceTo ?? vorgaben.turnier.raceTo);
    setName(t.name);
    setDatum(t.datum);
    setDisziplin(e.disziplinOffen ? 'offen' : t.disziplin);
    setModus(e.modusOffen ? 'offen' : t.modus);
    setRaceTo(race);
    setRacePhase2(String(e.racePhase2 ?? race));
    setRaceKo({
      R16: String(e.raceKo?.R16 ?? race),
      QF: String(e.raceKo?.QF ?? race),
      SF: String(e.raceKo?.SF ?? race),
      FIN: String(e.raceKo?.FIN ?? race),
      P3: String(e.racePhase3 ?? race)
    });
    setSerieId(t.serie_id ?? '');
    setVorgabeAn(e.vorgabe?.aktiv ?? false);
    setStaerke(String(e.vorgabe?.staerke ?? ratingStaerke));
    setObergrenze(String(e.vorgabe?.obergrenze ?? 0));
    setChat(e.chat ?? false);
    setLive(e.live ?? true);
    setRatingWerten(t.rating_werten);
    setArt(e.art ?? '');
    pflicht.zuruecksetzen();
    setBearbeitet(t);
    setFormular(true);
  }

  // Zurueck in die Turnieransicht, Formular leeren
  function aendernBeenden(t: Turnier) {
    setFormular(false);
    setBearbeitet(null);
    setName('');
    setDatum(heute());
    setSerieId('');
    setOffen(t.id);
  }

  async function aenderungSpeichern(t: Turnier, formEinstellungen: TurnierEinstellungen, dbDisziplin: Disziplin, dbModus: TurnierModus) {
    // Frisch lesen: Ausschreibung und Turnierart koennen sich in der Ansicht geaendert haben
    const { data: aktuell, error: lesefehler } = await supabase
      .from('turniere')
      .select('status, einstellungen')
      .eq('id', t.id)
      .single();
    if (lesefehler || !aktuell) return setFehler(lesefehler?.message ?? 'Turnier nicht gefunden.');
    if (aktuell.status !== 'geplant') {
      return setFehler('Das Turnier ist schon ausgelost; ändern lässt es sich nicht mehr.');
    }
    const warOffen = Boolean((t.einstellungen as TurnierEinstellungen | null)?.modusOffen);
    const modusNeu = dbModus !== t.modus || warOffen !== (modus === 'offen');
    if (
      modusNeu &&
      !(await fragen(
        `Modus von „${warOffen ? MODUS_OFFEN_TEXT : MODUS_TEXT[t.modus]}“ auf „${modus === 'offen' ? MODUS_OFFEN_TEXT : MODUS_TEXT[modus]}“ ändern?\nFeste Gruppen-Setzungen der Teilnehmer werden dabei gelöscht.`,
        'Ändern'
      ))
    ) {
      return;
    }
    // Was das Formular festlegt, kommt neu; alles andere (Ausschreibung,
    // TV-Ansicht ...) bleibt. Bei neuem Modus fallen dessen Vorbereitungen weg.
    const behalten = { ...((aktuell.einstellungen ?? {}) as TurnierEinstellungen) };
    const vomFormular: (keyof TurnierEinstellungen)[] = ['raceTo', 'racePhase2', 'raceKo', 'racePhase3', 'vorgabe', 'art', 'chat', 'live', 'disziplinOffen', 'modusOffen'];
    const modusAbhaengig: (keyof TurnierEinstellungen)[] = [
      'gruppenzahl', 'weiter', 'paarung', 'ko', 'phase2', 'phase3', 'handReihenfolge', 'tausch', 'nachgetragen'
    ];
    for (const k of [...vomFormular, ...(modusNeu ? modusAbhaengig : [])]) delete behalten[k];
    const { error } = await supabase
      .from('turniere')
      .update({
        name: name.trim(),
        datum,
        disziplin: dbDisziplin,
        modus: dbModus,
        serie_id: serieId || null,
        rating_werten: ratingWerten,
        einstellungen: { ...behalten, ...formEinstellungen, ...(art ? { art } : {}) }
      })
      .eq('id', t.id);
    if (error) return setFehler(error.message);
    if (modusNeu) {
      const { error: e2 } = await supabase
        .from('turnier_teilnehmer')
        .update({ gruppe: null, gesetzt: false })
        .eq('turnier_id', t.id);
      if (e2) return setFehler(e2.message);
    }
    await laden();
    aendernBeenden(t);
    return true;
  }

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  // Turnierarten fuer Spalte und Filter: die Liste des Vereins und alles, was
  // an Turnieren steht (auch Arten, die inzwischen aus der Liste genommen sind)
  const artVon = (t: Turnier) => ((t.einstellungen ?? {}) as TurnierEinstellungen).art ?? null;
  const artenInListe = [
    ...new Set([...vorgaben.turnierarten, ...turniere.map(artVon).filter((a): a is string => !!a)])
  ];

  // Die 2. Begegnung eines Spieltags bekommt keine eigene Zeile; in turniere
  // bleibt sie, damit der Umschalter der Liga-Ansicht sie findet.
  const zweite = zweiteBegegnungIds(turniere);
  const zeilen = turniere.filter((t) => !zweite.has(t.id) && (!artFilter || artVon(t) === artFilter));

  const offenesTurnier = turniere.find((t) => t.id === offen);
  if (offen && offenesTurnier?.modus === 'liga') {
    return (
      <LigaAnsicht
        turnierId={offen}
        oeffnen={(id) => {
          setOffen(id);
          void laden();
        }}
        zurueck={() => {
          setOffen(null);
          void laden();
        }}
      />
    );
  }

  if (offen) {
    return (
      <TurnierAnsicht
        turnierId={offen}
        zurueck={() => {
          setOffen(null);
          void laden();
        }}
        aendern={() => {
          void (async () => {
            const { data, error } = await supabase.from('turniere').select('*').eq('id', offen).single();
            if (error || !data) return setFehler(error?.message ?? 'Turnier nicht gefunden.');
            formularAus(data);
            setOffen(null);
          })();
        }}
      />
    );
  }

  return (
    <div className="einspaltig">
      {!formular && <Ausschreibungen turniere={turniere} hervorheben={hervorheben} />}
      <section className="block">
        <div className="bearbeitenkopf">
          <h2>Turniere</h2>
          {darfLeiten && !formular && (
            <button
              type="button"
              title="Ein neues Turnier oder einen Liga-Spieltag anlegen"
              onClick={() => {
                setBearbeitet(null);
                // Vorgaben aus der Seite "System"
                const t = vorgaben.turnier;
                const race = String(t.raceTo);
                setDisziplin(t.disziplin);
                setModus(t.modus);
                setRaceTo(race);
                setRacePhase2(race);
                setRaceKo({ R16: race, QF: race, SF: race, FIN: race, P3: race });
                setVorgabeAn(t.vorgabe);
                setStaerke(String(t.staerke ?? ratingStaerke));
                setObergrenze(String(t.obergrenze));
                setRatingWerten(t.ratingWerten);
                setArt(t.art ?? '');
                setChat(true);
                setLive(true);
                setLiga(vorgaben.liga.liga);
                // Standard-Mannschaft nach Nummer im Mannschaftspass, sonst die erste der Saison
                const rang = vorgaben.liga.mannschaftRang;
                const standard = mannschaftenDerSaison.find((m) => m.rang === rang) ?? mannschaftenDerSaison[0];
                setMannschaftId(standard?.id ?? '');
                // Wie beim Waehlen: Die Mannschaft bringt ihre Liga mit
                if (standard?.liga && standard.liga in LIGEN) setLiga(standard.liga as LigaKennung);
                setFormular(true);
              }}
            >
              Neues Turnier
            </button>
          )}
        </div>

        {formular && (
          <div className="kasten" ref={pflicht.bereich}>
            <div className="feldkopf">{bearbeitet ? `Turnier ändern: ${bearbeitet.name}` : 'Neues Turnier'}</div>
            <div className="felder">
              <label className="feld l">
                <span>Name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. 3. Serienturnier 9-Ball" />
              </label>
              <label className="feld">
                <span>Datum</span>
                <input type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} />
              </label>
              {vorgaben.turnierarten.length > 0 && (
                <label className="feld">
                  <span>Turnierart</span>
                  <select value={art} onChange={(e) => setArt(e.target.value)}>
                    <option value="">keine</option>
                    {vorgaben.turnierarten.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {modus !== 'liga' && (
              <label className="feld">
                <span>Disziplin</span>
                <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as Disziplin | 'offen')}>
                  <option value="8-ball">8-Ball</option>
                  <option value="9-ball">9-Ball</option>
                  <option value="10-ball">10-Ball</option>
                  {(disziplin === 'offen' || (gewaehlteSerie && gewaehlteSerie.disziplin === null)) && (
                    <option value="offen">noch offen ({DISZIPLIN_OFFEN_TEXT})</option>
                  )}
                </select>
              </label>
              )}
              <label className="feld l">
                <span>Modus</span>
                <select value={modus} onChange={(e) => setModus(e.target.value as TurnierModus | 'offen')}>
                  <option value="einzelgruppe">Einzelgruppe (jeder gegen jeden)</option>
                  <option value="zwei-gruppen">Zwei Gruppen mit Platzierungsduellen</option>
                  <option value="gruppen-ko">Gruppen mit KO-Runde</option>
                  <option value="offen">{MODUS_OFFEN_TEXT} (nach Teilnehmerzahl)</option>
                  {!bearbeitet && <option value="liga">Liga-Spieltag (Begegnung)</option>}
                </select>
              </label>
              {modus === 'liga' && (
                <>
                  <label className="feld">
                    <span>Liga</span>
                    <select value={liga} onChange={(e) => setLiga(e.target.value as LigaKennung)}>
                      {(Object.keys(LIGEN) as LigaKennung[]).map((k) => (
                        <option key={k} value={k}>
                          {LIGEN[k].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="feld s">
                    <span>Spieltag</span>
                    <input inputMode="numeric" required value={spieltag} onChange={(e) => setSpieltag(e.target.value)} />
                  </label>
                  {liga === 'spass' &&
                    (
                      [
                        ['punkte141', '14.1: Punkte'],
                        ['aufnahmen141', '14.1: höchstens Aufnahmen'],
                        ['8-ball', '8-Ball: Gewinnsätze'],
                        ['9-ball', '9-Ball: Gewinnsätze'],
                        ['10-ball', '10-Ball: Gewinnsätze']
                      ] as const
                    ).map(([k, text]) => (
                      <label key={k} className="feld s">
                        <span>{text}</span>
                        <input inputMode="numeric" required value={ziele[k]} onChange={(e) => setZiele({ ...ziele, [k]: e.target.value })} />
                      </label>
                    ))}
                  <label className="feld">
                    <span>Heimrecht</span>
                    <select value={heim ? 'heim' : 'gast'} onChange={(e) => setHeim(e.target.value === 'heim')}>
                      <option value="heim">Heimspiel</option>
                      <option value="gast">Auswärtsspiel</option>
                    </select>
                  </label>
                  <label className="feld l">
                    <span>Eigene Mannschaft</span>
                    {mannschaftenDerSaison.length > 0 ? (
                      <select value={mannschaftId} onChange={(e) => mannschaftWaehlen(e.target.value)}>
                        {mannschaftenDerSaison.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.staffel ? ` (${m.staffel})` : ''}
                          </option>
                        ))}
                        <option value="">andere, von Hand eintragen</option>
                      </select>
                    ) : (
                      <input value={eigeneMannschaft} onChange={(e) => setEigeneMannschaft(e.target.value)} placeholder={`leer = ${verein.name}`} />
                    )}
                  </label>
                  {mannschaftenDerSaison.length > 0 && !mannschaftId && (
                    <label className="feld">
                      <span>Name der Mannschaft</span>
                      <input value={eigeneMannschaft} onChange={(e) => setEigeneMannschaft(e.target.value)} placeholder={`leer = ${verein.name}`} />
                    </label>
                  )}
                  <label className="feld l">
                    <span>Gegner</span>
                    <input required value={gegner} onChange={(e) => setGegner(e.target.value)} placeholder="z. B. BC Achim 2" />
                  </label>
                </>
              )}
              {modus !== 'liga' && (
              <label className="feld s">
                <span>{modus === 'einzelgruppe' ? 'Race to' : modus === 'offen' ? 'Race to (Einzelgruppe bzw. Gruppenphase)' : 'Race to Gruppenphase'}</span>
                <input inputMode="numeric" required value={raceTo} onChange={(e) => setRaceTo(e.target.value)} />
              </label>
              )}
              {mitZwei && (
                <label className="feld s">
                  <span>Race to Platzierungsduelle</span>
                  <input inputMode="numeric" required value={racePhase2} onChange={(e) => setRacePhase2(e.target.value)} />
                </label>
              )}
              {mitKoFeldern &&
                (
                  [
                    ['R16', 'Race to Achtelfinale'],
                    ['QF', 'Race to Viertelfinale'],
                    ['SF', 'Race to Halbfinale und Platz 3'],
                    ['FIN', 'Race to Finale'],
                    ['P3', 'Race to Platzierungsspiele']
                  ] as const
                ).map(([k, text]) => (
                  <label key={k} className="feld s">
                    <span>{text}</span>
                    <input inputMode="numeric" required value={raceKo[k]} onChange={(e) => setRaceKo({ ...raceKo, [k]: e.target.value })} />
                  </label>
                ))}
              <label className="feld l">
                <span>Serie</span>
                <select
                  value={serieId}
                  onChange={(e) => {
                    setSerieId(e.target.value);
                    // Serie mit fester Disziplin bringt sie mit; "offen" gibt es nur bei Serien ohne
                    const s = serien.find((x) => x.id === e.target.value);
                    const fest = s?.disziplin;
                    if (fest === '8-ball' || fest === '9-ball' || fest === '10-ball') setDisziplin(fest);
                    else if (disziplin === 'offen' && !(s && s.disziplin === null)) setDisziplin(vorgaben.turnier.disziplin);
                  }}
                >
                  <option value="">keine</option>
                  {serien.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.saison ? ` (${s.saison})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {modus !== 'liga' && (
            <label className="ankreuz">
              <input type="checkbox" checked={vorgabeAn} onChange={(e) => setVorgabeAn(e.target.checked)} />
              <span>
                Mit Vorgabe (Handicap)
                <small>Der schwächere Spieler startet mit Sätzen Vorsprung, berechnet aus dem Vereins-Rating.</small>
              </span>
            </label>
            )}
            {vorgabeAn && modus !== 'liga' && (
              <div className="felder">
                <label className="feld">
                  <span>Ausgleich in Prozent</span>
                  <input inputMode="numeric" value={staerke} onChange={(e) => setStaerke(e.target.value)} />
                </label>
                <label className="feld">
                  <span>Höchstens Sätze Vorgabe (0 = ohne Grenze)</span>
                  <input inputMode="numeric" value={obergrenze} onChange={(e) => setObergrenze(e.target.value)} />
                </label>
              </div>
            )}
            {vorgabeAn && modus !== 'liga' && hinweisKurzesRace && <p className="hinweis">{hinweisKurzesRace}</p>}
            <label className="ankreuz">
              <input type="checkbox" checked={ratingWerten} onChange={(e) => setRatingWerten(e.target.checked)} />
              <span>
                Zählt für das Vereins-Rating
                <small>
                  {modus === 'liga'
                    ? 'Im Liga-Spieltag zählen auch die Partien gegen die gegnerische Mannschaft; 14.1 zählt nie.'
                    : 'Partien mit Gästen zählen nie.'}
                </small>
              </span>
            </label>
            <label className="ankreuz">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span>
                Live übertragen
                <small>
                  Spielstände erscheinen auf Live, Zuschauen und dem Fernseher, solange das Turnier läuft – an allen
                  Tischen, auch freie Spiele.
                </small>
              </span>
            </label>
            {vorgaben.chat && (
              <label className={live ? 'ankreuz eingerueckt' : 'ankreuz eingerueckt gesperrt'}>
                <input type="checkbox" checked={live && chat} disabled={!live} onChange={(e) => setChat(e.target.checked)} />
                <span>
                  Mit Chat für Zuschauer
                  <small>
                    {live
                      ? 'Mitglieder können auf der Seite „Zuschauen“ schreiben, solange das Turnier läuft.'
                      : 'Nur mit Live-Übertragung möglich.'}
                  </small>
                </span>
              </label>
            )}
            <div className="knopfpaar">
              <button
                type="button"
                title={bearbeitet ? 'Die Änderungen speichern und zurück zum Turnier' : 'Legt das Turnier mit diesen Angaben an.'}
                onClick={() => void anlegen()}
              >
                {bearbeitet ? 'Speichern' : 'Anlegen'}
              </button>
              <button
                type="button"
                title={bearbeitet ? 'Ohne Speichern zurück zum Turnier' : 'Ohne Anlegen schließen'}
                onClick={() => {
                  pflicht.zuruecksetzen();
                  if (bearbeitet) aendernBeenden(bearbeitet);
                  else setFormular(false);
                }}
              >
                Abbrechen
              </button>
              <Pflichthinweis hinweis={pflicht.hinweis} />
            </div>
          </div>
        )}

        {fehler && <p className="fehler">{fehler}</p>}
        {rueckfrage}

        {artenInListe.length > 0 && (
          <div className="filterzeile">
            {['', ...artenInListe].map((a) => (
              <button
                key={a || 'alle'}
                type="button"
                className={artFilter === a ? 'chip aktiv' : 'chip'}
                title={a ? `Nur Turniere der Art „${a}“ zeigen` : 'Alle Turniere zeigen'}
                onClick={() => setArtFilter(a)}
              >
                {a || 'Alle'}
              </button>
            ))}
          </div>
        )}
        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Datum</th>
              <th>Name</th>
              {artenInListe.length > 0 && <th>Art</th>}
              <th>Disziplin</th>
              <th>Modus</th>
              <th>Stand</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((t) => {
              // Liga-Spieltag: eine Zeile fuer beide Begegnungen
              const partner = t.modus === 'liga' ? partnerVon(t, turniere) : null;
              const stand = spieltagStand(t.status, partner?.status ?? null);
              return (
                <tr
                  key={t.id}
                  className="klickbar"
                  onClick={() => {
                    void (async () => {
                      if (await wechselErlaubt()) setOffen(t.id);
                    })();
                  }}
                >
                  <td>{new Date(`${t.datum}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                  <td>
                    {t.name}
                    {t.quelle === 'import' && <span className="marke">aus Turnier light</span>}
                  </td>
                  {artenInListe.length > 0 && <td>{artVon(t) ?? '–'}</td>}
                  <td>{turnierDisziplinText(t)}</td>
                  <td>{(t.einstellungen as TurnierEinstellungen | null)?.modusOffen ? 'Modus offen' : MODUS_TEXT[t.modus]}</td>
                  <td className={stand.status === 'laeuft' ? 'livelaeuft' : ''}>
                    {stand.teilBeendet ? `${stand.teilBeendet}. Begegnung beendet` : STATUS_TEXT[stand.status]}
                  </td>
                </tr>
              );
            })}
            {turniere.length === 0 && (
              <tr>
                <td colSpan={artenInListe.length > 0 ? 6 : 5} className="hinweis">
                  Noch kein Turnier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
