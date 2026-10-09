import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import {
  LIGEN,
  aufstellungPruefen,
  doppelPlanAendern,
  doppelPlanAusEingabe,
  doppelSeitePruefen,
  doppelSpielplan,
  fertigGespielt,
  gesperrteSpieler,
  spielplan,
  wertung
} from '../liga';
import DoppelPlanFelder, { DOPPEL_ZEILEN_STANDARD } from './DoppelPlanFelder';
import type { DoppelZeile } from './DoppelPlanFelder';
import type { DoppelPartie } from '../liga';
import { kaderHinweise } from '../mannschaften';
import { schutzwortPruefen } from '../schutzwort';
import { STATUS_TEXT } from './Turniere';
import SpielberichtImport from './SpielberichtImport';
import LiveSchalter from './LiveSchalter';
import ChatSchalter from './ChatSchalter';
import OeffentlicherLink from './OeffentlicherLink';
import { vereinsEinstellungen } from '../vereinseinstellungen';
import ZuruecksetzenDialog from './ZuruecksetzenDialog';
import { useLaufendeStaende } from '../laufende-staende';
import { laufenderStand, laufenderStandText } from '../live';
import { zuruecksetzbar } from '../partie-zuruecksetzen';
import { spieltagGesamt } from '../zuschauen';
import { spieltagBerichtDaten, spieltagBerichtDateiname, spieltagBerichtPdf } from '../spieltagbericht';
import { herunterladen } from '../pdf';
import type { LigaSpiel } from '../liga';
import type { TurnierEinstellungen } from './Turniere';
import type { Mannschaft, MannschaftSpieler, Partie, Person, Turnier, TurnierTeilnehmer } from '../datenbank.types';
import { Modal } from '../modal';

// Ein Liga-Spieltag (Begegnung): Aufstellung, acht Einzelpartien, Partie- und
// Matchpunkte, Abschluss. Die Regeln stehen in src/liga.ts, die Ergebnisse in
// denselben Tabellen wie alle anderen Partien.

const DISZIPLIN_KURZ: Record<string, string> = {
  '14-1': '14.1-endlos',
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball'
};

// Halbe Aufstellung eines Spiels; heim2/gast2 nur im Doppel
type Wahl = { heim?: string | null; gast?: string | null; heim2?: string | null; gast2?: string | null };
type Slot = 'heim' | 'gast' | 'heim2' | 'gast2';
// Leerer zweiter Platz im Doppel (Stufe 31): in der Partie partner = null
const GEIST = 'geist';

// Eine Begegnung des Spieltags, wie sie im Umschalter steht
type SpieltagTeil = { nummer: 1 | 2 | 3; id: string; status: Turnier['status']; doppel: boolean };

const datumLang = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

// Die andere Begegnung eines Spieltags anlegen: gleicher Tag, gleicher
// Gegner, getauschtes Heimrecht, leere Aufstellung. Danach verweisen beide
// ueber liga.partner aufeinander.
export async function andereBegegnungAnlegen(
  turnier: Turnier
): Promise<{ id: string; fehler: null } | { id: null; fehler: string }> {
  const einstellungen = (turnier.einstellungen ?? {}) as TurnierEinstellungen;
  if (!einstellungen.liga) return { id: null, fehler: 'Kein Liga-Spieltag.' };
  const liga = { ...einstellungen.liga, begegnung: einstellungen.liga.begegnung ?? 1 };
  const nummer = liga.begegnung === 1 ? 2 : 1;
  const andere = {
    ...liga,
    aufstellung: undefined,
    verdeckt: undefined,
    gestartet: undefined,
    quelle: undefined,
    heim: !liga.heim,
    begegnung: nummer,
    partner: turnier.id,
    doppel: undefined,
    doppelPlan: undefined
  };
  const { data, error } = await supabase
    .from('turniere')
    .insert({
      verein_id: turnier.verein_id,
      name: `${turnier.name.replace(/ · [12]\. Begegnung$/, '')} · ${nummer}. Begegnung`,
      datum: turnier.datum,
      disziplin: 'multi-ball',
      modus: 'liga',
      status: 'geplant',
      rating_werten: turnier.rating_werten,
      einstellungen: { ...einstellungen, liga: andere }
    })
    .select('id')
    .single();
  if (error || !data) return { id: null, fehler: error?.message ?? `${nummer}. Begegnung nicht angelegt.` };
  // Rueckverweis in dieser Begegnung merken
  const { error: verweisFehler } = await supabase
    .from('turniere')
    .update({ einstellungen: { ...einstellungen, liga: { ...liga, partner: data.id } } })
    .eq('id', turnier.id);
  if (verweisFehler) return { id: null, fehler: verweisFehler.message };
  return { id: data.id, fehler: null };
}

// Doppel-Begegnung eines Spass-Liga-Spieltags anlegen (src/liga.ts): gleicher
// Tag, Gegner und Heimrecht wie die 1. Begegnung, eigene Partienliste, nie
// fuers Rating. Danach verweist die 1. Begegnung ueber liga.doppel auf sie.
export async function doppelBegegnungAnlegen(
  erste: Turnier,
  plan: DoppelPartie[]
): Promise<{ id: string; fehler: null } | { id: null; fehler: string }> {
  const einstellungen = (erste.einstellungen ?? {}) as TurnierEinstellungen;
  const liga = einstellungen.liga;
  if (!liga || liga.liga !== 'spass') return { id: null, fehler: 'Doppel gibt es nur in der Spaß-Liga.' };
  if ((liga.begegnung ?? 1) !== 1) return { id: null, fehler: 'Die Doppel-Begegnung hängt an der 1. Begegnung.' };
  const doppel = {
    ...liga,
    aufstellung: undefined,
    verdeckt: undefined,
    gestartet: undefined,
    quelle: undefined,
    partner: undefined,
    doppel: undefined,
    begegnung: 1 as const,
    art: 'doppel' as const,
    haupt: erste.id,
    doppelPlan: plan
  };
  const { data, error } = await supabase
    .from('turniere')
    .insert({
      verein_id: erste.verein_id,
      name: `${erste.name.replace(/ · [12]\. Begegnung$/, '')} · Doppel`,
      datum: erste.datum,
      disziplin: 'multi-ball',
      modus: 'liga',
      status: 'geplant',
      rating_werten: false,
      einstellungen: { ...einstellungen, liga: doppel }
    })
    .select('id')
    .single();
  if (error || !data) return { id: null, fehler: error?.message ?? 'Doppel-Begegnung nicht angelegt.' };
  // Verweis in der 1. Begegnung frisch lesen und ergaenzen
  const { data: frisch } = await supabase.from('turniere').select('einstellungen').eq('id', erste.id).maybeSingle();
  const aktuell = (frisch?.einstellungen ?? einstellungen) as TurnierEinstellungen;
  const { error: verweisFehler } = await supabase
    .from('turniere')
    .update({ einstellungen: { ...aktuell, liga: { ...aktuell.liga!, doppel: data.id } } })
    .eq('id', erste.id);
  if (verweisFehler) return { id: null, fehler: verweisFehler.message };
  return { id: data.id, fehler: null };
}

// Alle Begegnungen des Spieltags dieser Begegnung, in Spielreihenfolge. Nur
// Verweise, die zurueckzeigen, zaehlen (wie partnerVon in src/liga.ts).
async function spieltagTeileLaden(t: Turnier): Promise<SpieltagTeil[]> {
  const liga = ((t.einstellungen ?? {}) as TurnierEinstellungen).liga;
  if (!liga) return [];
  const ersteId = liga.art === 'doppel' ? liga.haupt : (liga.begegnung ?? 1) === 1 ? t.id : liga.partner;
  const nurDiese: SpieltagTeil[] = [
    { nummer: liga.art === 'doppel' ? 2 : (liga.begegnung ?? 1), id: t.id, status: t.status, doppel: liga.art === 'doppel' }
  ];
  if (!ersteId) return nurDiese;
  const { data: erste } = await supabase.from('turniere').select('id, status, einstellungen').eq('id', ersteId).maybeSingle();
  if (!erste) return nurDiese;
  const ersteLiga = ((erste.einstellungen ?? {}) as TurnierEinstellungen).liga;
  const ids = [ersteLiga?.partner, ersteLiga?.doppel].filter((x): x is string => Boolean(x));
  const { data: andere } = ids.length
    ? await supabase.from('turniere').select('id, status, einstellungen').in('id', ids)
    : { data: [] as { id: string; status: Turnier['status']; einstellungen: unknown }[] };
  const ligaVon = (x: { einstellungen: unknown }) => ((x.einstellungen ?? {}) as TurnierEinstellungen).liga;
  const zweite = (andere ?? []).find((x) => x.id === ersteLiga?.partner && ligaVon(x)?.partner === erste.id) ?? null;
  const doppel = (andere ?? []).find((x) => x.id === ersteLiga?.doppel && ligaVon(x)?.haupt === erste.id) ?? null;
  const liste: SpieltagTeil[] = [{ nummer: 1, id: erste.id, status: erste.status, doppel: false }];
  if (doppel) liste.push({ nummer: 2, id: doppel.id, status: doppel.status, doppel: true });
  if (zweite) liste.push({ nummer: doppel ? 3 : 2, id: zweite.id, status: zweite.status, doppel: false });
  return liste;
}

export default function LigaAnsicht({
  turnierId,
  zurueck,
  oeffnen,
  zurueckText = 'Turniere'
}: {
  turnierId: string;
  zurueck: () => void;
  oeffnen: (id: string) => void;
  zurueckText?: string; // Beschriftung des Zurueck-Knopfs (Seite, von der der Spieltag geoeffnet wurde)
}) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const istAdmin = darf('vereinsadmin');

  const [turnier, setTurnier] = useState<Turnier | null>(null);
  // Geladen, aber nicht (mehr) vorhanden - statt endlos "Laedt."
  const [nichtGefunden, setNichtGefunden] = useState(false);
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [mannschaften, setMannschaften] = useState<Mannschaft[]>([]);
  const [kader, setKader] = useState<MannschaftSpieler[]>([]);
  // Alle Begegnungen des Spieltags in der angezeigten Reihenfolge (mit
  // Doppel-Begegnung: 1., 2. = Doppel, 3.)
  const [teile, setTeile] = useState<SpieltagTeil[]>([]);
  // Doppel-Begegnung nachtraeglich hinzufuegen (Partienliste im Dialog)
  const [doppelDialog, setDoppelDialog] = useState<DoppelZeile[] | null>(null);
  // Partienliste der angezeigten Doppel-Begegnung aendern
  const [planDialog, setPlanDialog] = useState<DoppelZeile[] | null>(null);
  const [gastName, setGastName] = useState('');
  const [passwortFrage, setPasswortFrage] = useState<{ runde: 'hin' | 'rueck'; seite: 'heim' | 'gast' } | null>(null);
  const [passwort, setPasswort] = useState('');
  // Schutz der Hinrunde, sobald die Rueckrunde gestartet ist: aufheben nur mit
  // dem Schutzwort und nur hier, bis zum Verlassen der Seite (nicht gespeichert)
  const [hinFrei, setHinFrei] = useState(false);
  const [schutzFrage, setSchutzFrage] = useState(false);
  const [ruecksetzPartie, setRuecksetzPartie] = useState<Partie | null>(null); // Partie zuruecksetzen (Dialog)
  const [importOffen, setImportOffen] = useState(false);
  // Halbe Aufstellung: solange nur eine Seite gewaehlt ist, gibt es noch keine
  // Partie in der Datenbank. Die Wahl haelt deshalb die Ansicht fest.
  // Im Doppel zusaetzlich heim2/gast2, der zweite Spieler je Seite.
  const [wahl, setWahl] = useState<Record<number, Wahl>>({});
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  const laden = useCallback(async () => {
    if (!verein) return;
    const [t, tn, p, pe, ma, ka] = await Promise.all([
      supabase.from('turniere').select('*').eq('id', turnierId).maybeSingle(),
      supabase.from('turnier_teilnehmer').select('*').eq('turnier_id', turnierId),
      supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung'),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('mannschaften').select('*').eq('verein_id', verein.id),
      supabase.from('mannschaft_spieler').select('*').eq('verein_id', verein.id)
    ]);
    if (t.error) setFehler(t.error.message);
    setTurnier(t.data ?? null);
    setNichtGefunden(!t.error && !t.data);
    setTeilnehmer(tn.data ?? []);
    setPartien(p.data ?? []);
    setPersonen(pe.data ?? []);
    setMannschaften(ma.data ?? []);
    setKader(ka.data ?? []);
    // Die Datenbank ist massgeblich: halbe Aufstellung nur fuer Spiele, zu
    // denen es noch keine Partie gibt
    const geladeneLiga = (t.data?.einstellungen as TurnierEinstellungen | null)?.liga;
    const halb: Record<number, Wahl> = {};
    if (geladeneLiga) {
      const plan = geladeneLiga.art === 'doppel' ? doppelSpielplan(geladeneLiga.doppelPlan ?? []) : spielplan(geladeneLiga.ziele);
      plan.forEach((s) => {
        const gemerkt = geladeneLiga.aufstellung?.[String(s.nr)];
        const hatPartie = (p.data ?? []).some((x) => x.runde === (s.runde === 'hin' ? 1 : 2) && x.paarung === s.paarung);
        if (gemerkt && !hatPartie) {
          halb[s.nr] = {
            heim: gemerkt.heim ?? null,
            gast: gemerkt.gast ?? null,
            ...(geladeneLiga.art === 'doppel' ? { heim2: gemerkt.heim2 ?? null, gast2: gemerkt.gast2 ?? null } : {})
          };
        }
      });
    }
    setWahl(halb);
    setTeile(t.data && geladeneLiga ? await spieltagTeileLaden(t.data) : []);
  }, [verein, turnierId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Ergebnisse und Tischwahl von den Tablets sofort uebernehmen (wie in der
  // Turnieransicht). Nur die Partien neu lesen, damit eine halb gewaehlte
  // Aufstellung stehen bleibt.
  useEffect(() => {
    let zeitgeber: number | null = null;
    const partienNeu = async () => {
      const { data } = await supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung');
      if (data) setPartien(data);
    };
    const kanal = supabase
      .channel(`liga-leitung-${turnierId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partien', filter: `turnier_id=eq.${turnierId}` }, () => {
        if (zeitgeber !== null) window.clearTimeout(zeitgeber);
        zeitgeber = window.setTimeout(() => void partienNeu(), 300);
      })
      .subscribe();
    return () => {
      if (zeitgeber !== null) window.clearTimeout(zeitgeber);
      void supabase.removeChannel(kanal);
    };
  }, [turnierId]);

  // Alle Begegnungen des Spieltags mit ihren Partien, fuer "Spieltag gesamt"
  // und den Spielbericht als PDF. Die angezeigte Begegnung kommt live aus
  // turnier/partien, die anderen werden hier gelesen.
  const [spieltag, setSpieltag] = useState<{ turniere: Turnier[]; partien: Partie[] } | null>(null);
  const teileIds = teile.map((x) => x.id).join(',');
  useEffect(() => {
    if (teile.length < 2) {
      setSpieltag(null);
      return;
    }
    let vorbei = false;
    void (async () => {
      const ids = teileIds.split(',');
      const [t, p] = await Promise.all([
        supabase.from('turniere').select('*').in('id', ids),
        supabase.from('partien').select('*').in('turnier_id', ids.filter((id) => id !== turnierId))
      ]);
      if (vorbei) return;
      const geordnet = ids.map((id) => (t.data ?? []).find((x) => x.id === id)).filter((x): x is Turnier => Boolean(x));
      setSpieltag({ turniere: geordnet, partien: p.data ?? [] });
    })();
    return () => {
      vorbei = true;
    };
    // teile.length steckt in teileIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teileIds, turnierId, turnier?.status]);

  // Laufender Stand am Tisch neben dem (noch leeren) Ergebnis
  const laufendeStaende = useLaufendeStaende(verein?.id);
  const [tischNummern, setTischNummern] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!verein) return;
    void supabase
      .from('tische')
      .select('id, nummer')
      .eq('verein_id', verein.id)
      .then(({ data }) => setTischNummern(new Map((data ?? []).map((x) => [x.id, x.nummer]))));
  }, [verein]);

  const anzeige = useCallback(
    (id: string | null) => {
      if (!id) return '';
      if (id === GEIST) return 'Geist';
      const p = personen.find((x) => x.id === id);
      return p ? p.anzeigename || `${p.vorname} ${p.nachname}`.trim() : '?';
    },
    [personen]
  );

  const einstellungen = (turnier?.einstellungen ?? {}) as TurnierEinstellungen;
  // Aeltere Spieltage kennen die Begegnungsnummer noch nicht
  const liga = einstellungen.liga ? { ...einstellungen.liga, begegnung: einstellungen.liga.begegnung ?? 1 } : undefined;
  const istDoppel = liga?.art === 'doppel';
  const spiele = useMemo(
    () => (liga ? (liga.art === 'doppel' ? doppelSpielplan(liga.doppelPlan ?? []) : spielplan(liga.ziele)) : []),
    [liga]
  );
  // Nummer im Umschalter (mit Doppel-Begegnung wird die gespeicherte 2. zur 3.)
  const eigeneNummer = teile.find((x) => x.id === turnierId)?.nummer ?? (istDoppel ? 2 : (liga?.begegnung ?? 1));
  const begegnungName = istDoppel ? `${eigeneNummer}. Begegnung (Doppel)` : `${eigeneNummer}. Begegnung`;
  // Welche Runden die Tablets sehen. Laufende Spieltage von vor dieser Regel
  // haben keinen Eintrag: dort gelten beide als gestartet.
  const gestartet: { hin?: boolean; rueck?: boolean } =
    liga?.gestartet ?? (turnier && turnier.status !== 'geplant' ? { hin: true, rueck: true } : {});

  // Partie zu einem Spiel des Plans (Runde 1 = Hinrunde, 2 = Rueckrunde)
  const partieVon = useCallback(
    (s: LigaSpiel) => partien.find((p) => p.runde === (s.runde === 'hin' ? 1 : 2) && p.paarung === s.paarung) ?? null,
    [partien]
  );

  // Heim steht immer auf Seite A, so wie im Spielbericht des Verbands.
  // Unsere Mannschaft ist je nach Heimrecht die Heim- oder die Gastseite.
  const wirSindHeim = liga?.heim ?? true;
  // Spieler eines Platzes: halb gewaehlt (wahl) oder aus der Partie
  const SPALTE: Record<Slot, 'spieler_a' | 'spieler_b' | 'partner_a' | 'partner_b'> = {
    heim: 'spieler_a',
    gast: 'spieler_b',
    heim2: 'partner_a',
    gast2: 'partner_b'
  };
  const spielerIn = (s: LigaSpiel, slot: Slot): string | null => {
    const gemerkt = wahl[s.nr]?.[slot];
    if (gemerkt !== undefined) return gemerkt;
    const p = partieVon(s);
    // Im Doppel ist ein leerer zweiter Platz der Geist
    if (p?.doppel && (slot === 'heim2' || slot === 'gast2') && !p[SPALTE[slot]]) return GEIST;
    return p?.[SPALTE[slot]] ?? null;
  };
  const heimSpieler = (s: LigaSpiel) => spielerIn(s, 'heim');
  const gastSpieler = (s: LigaSpiel) => spielerIn(s, 'gast');
  // Anzeige einer Seite, im Doppel "A / B"
  const seitenName = (erster: string | null, zweiter: string | null) =>
    zweiter ? `${anzeige(erster)} / ${anzeige(zweiter)}` : anzeige(erster);
  const unsererSpieler = (s: LigaSpiel) => (wirSindHeim ? heimSpieler(s) : gastSpieler(s));
  // Aufstellung einer Seite ueber alle acht Spiele, fuer die Auswahllisten
  const planVon = (seite: 'heim' | 'gast') => {
    const plan: Record<number, string | null> = {};
    spiele.forEach((s) => (plan[s.nr] = seite === 'heim' ? heimSpieler(s) : gastSpieler(s)));
    return plan;
  };
  // Nur anbieten, wer fuer dieses Spiel noch in Frage kommt; der schon
  // Eingetragene bleibt sichtbar, auch wenn er eigentlich nicht passt.
  // Im Doppel gibt es keine Sperren ueber die Runde; nur der Partner auf
  // derselben Seite faellt weg.
  const moeglich = (liste: Person[], s: LigaSpiel, slot: Slot, gewaehlt: string | null) => {
    if (istDoppel) {
      const partner = spielerIn(s, slot === 'heim' ? 'heim2' : slot === 'heim2' ? 'heim' : slot === 'gast' ? 'gast2' : 'gast');
      return liste.filter((p) => p.id === gewaehlt || p.id !== partner);
    }
    const seite = slot === 'heim' || slot === 'heim2' ? 'heim' : 'gast';
    const gesperrt = gesperrteSpieler(spiele, planVon(seite), s.nr);
    return liste.filter((p) => p.id === gewaehlt || !gesperrt.has(p.id));
  };
  const istVerdeckt = (runde: 'hin' | 'rueck', seite: 'heim' | 'gast') =>
    Boolean(liga?.verdeckt?.[runde]?.[seite]);

  const ergebnisse = useMemo(
    () =>
      spiele.map((s) => {
        const p = partieVon(s);
        // Der Rating-Haken einer Partie ändert die Partiepunkte nicht
        return { nr: s.nr, heim: p?.ergebnis_a ?? null, gast: p?.ergebnis_b ?? null };
      }),
    [spiele, partieVon]
  );
  const punkte = useMemo(() => wertung(ergebnisse), [ergebnisse]);

  // Spieltag gesamt (ab zwei Begegnungen), aus Sicht der Heimmannschaft der 1. Begegnung
  const spieltagTurniere = useMemo(
    () => (spieltag ? spieltag.turniere.map((x) => (x.id === turnierId && turnier ? turnier : x)) : []),
    [spieltag, turnier, turnierId]
  );
  const spieltagPartien = useMemo(() => (spieltag ? [...spieltag.partien, ...partien] : []), [spieltag, partien]);
  const gesamt = useMemo(
    () => (spieltag && verein ? spieltagGesamt(spieltagTurniere, spieltagPartien, verein.name) : null),
    [spieltag, verein, spieltagTurniere, spieltagPartien]
  );

  function spielberichtPdf() {
    if (!turnier || !verein) return;
    const tag = new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const kopf = `${tag} · ${verein.name} · erstellt am ${new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
    const daten = spieltagBerichtDaten(spieltagTurniere, spieltagPartien, verein.name, anzeige, kopf);
    if (!daten) return;
    herunterladen(spieltagBerichtPdf(daten), spieltagBerichtDateiname(daten.titel, turnier.datum));
  }

  const eigeneMitglieder = useMemo(
    () =>
      personen
        .filter((p) => p.status === 'mitglied')
        .sort((a, b) => personName(a).localeCompare(personName(b), 'de')),
    [personen]
  );
  const gaeste = useMemo(
    () => personen.filter((p) => p.status === 'gast').sort((a, b) => personName(a).localeCompare(personName(b), 'de')),
    [personen]
  );

  const fehlerAufstellung = useMemo(() => {
    if (spiele.length === 0) return [];
    if (istDoppel) {
      return spiele.flatMap((s) =>
        (['heim', 'gast'] as const)
          .map((seite) => doppelSeitePruefen(s.nr, spielerIn(s, seite), spielerIn(s, `${seite}2`), (id) => anzeige(id)))
          .filter((x): x is string => x !== null)
      );
    }
    const plan: Record<number, string | null> = {};
    spiele.forEach((s) => (plan[s.nr] = unsererSpieler(s)));
    return aufstellungPruefen(spiele, plan, (id) => anzeige(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiele, partien, wahl, anzeige, wirSindHeim]);

  const hinweiseKader = useMemo(() => {
    const eigene = mannschaften.find((m) => m.id === liga?.mannschaft_id);
    // Kaderregeln gelten fuer die Einzel-Begegnungen; das Doppel ist Spass
    if (!eigene || spiele.length === 0 || istDoppel) return [];
    const derSaison = mannschaften.filter((m) => m.saison === eigene.saison);
    return kaderHinweise({
      mannschaft: { id: eigene.id, name: eigene.name, rang: eigene.rang },
      aufgestellt: spiele.map((s) => unsererSpieler(s)).filter((id): id is string => Boolean(id)),
      kader: kader.filter((k) => derSaison.some((m) => m.id === k.mannschaft_id)),
      mannschaften: derSaison.map((m) => ({ id: m.id, name: m.name, rang: m.rang })),
      name: (id) => anzeige(id)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mannschaften, kader, spiele, partien, wahl, anzeige, liga?.mannschaft_id, wirSindHeim]);

  // Kader der gewaehlten Mannschaft: steht in den eigenen Auswahllisten oben,
  // alle anderen Mitglieder darunter (Aushilfe bleibt moeglich)
  const kaderGruppe = useMemo(() => {
    const eigene = mannschaften.find((m) => m.id === liga?.mannschaft_id);
    if (!eigene) return null;
    const ids = new Set(kader.filter((k) => k.mannschaft_id === eigene.id).map((k) => k.person_id));
    return ids.size > 0 ? { name: eigene.name, ids } : null;
  }, [mannschaften, kader, liga?.mannschaft_id]);

  if (!verein) return null;
  if (!turnier || !liga) {
    return (
      <div className="einspaltig">
        {nichtGefunden ? (
          <section className="block">
            <button type="button" className="zurueck" onClick={zurueck}>
              ← {zurueckText}
            </button>
            <p className="hinweis">Diese Begegnung gibt es nicht mehr.</p>
          </section>
        ) : (
          <p className="hinweis">{fehler ?? 'Lädt.'}</p>
        )}
      </div>
    );
  }

  const bearbeitbar = darfLeiten && turnier.status !== 'beendet';
  const hinGeschuetzt = gestartet.rueck === true && !hinFrei;

  // ---------- Aufstellung und Ergebnisse ----------

  // Legt die Partie an, sobald alle Spieler feststehen (im Doppel vier), und
  // aendert sie sonst
  async function spielerSetzen(s: LigaSpiel, slot: Slot, personId: string | null) {
    if (!turnier || !liga) return;
    const vorhanden = partieVon(s);
    if (vorhanden && (vorhanden.tisch_id || vorhanden.status === 'beendet')) {
      return setFehler(
        vorhanden.status === 'beendet'
          ? 'Die Partie ist beendet. Zum Ändern zuerst das Ergebnis löschen.'
          : 'Die Partie läuft gerade an einem Tisch. Sie lässt sich erst ändern, wenn sie dort abgeschlossen oder abgebrochen ist.'
      );
    }
    const neu: Wahl = {
      heim: heimSpieler(s),
      gast: gastSpieler(s),
      ...(istDoppel ? { heim2: spielerIn(s, 'heim2'), gast2: spielerIn(s, 'gast2') } : {}),
      [slot]: personId
    };
    setFehler(null);
    setWahl((bisher) => ({ ...bisher, [s.nr]: neu }));

    const plaetze = istDoppel ? [neu.heim, neu.gast, neu.heim2, neu.gast2] : [neu.heim, neu.gast];
    if (plaetze.some((x) => !x)) {
      // Ohne alle Spieler gibt es noch keine Partie; eine bestehende entfaellt.
      // Die gewaehlten Plaetze werden am Spieltag gemerkt.
      if (vorhanden) await supabase.from('partien').delete().eq('id', vorhanden.id);
      await halbeAufstellungMerken(s.nr, plaetze.some(Boolean) ? neu : null);
      await laden();
      return;
    }
    const spieler_a = neu.heim as string;
    const spieler_b = neu.gast as string;
    if (spieler_a === spieler_b) return setFehler('Ein Spieler kann nicht gegen sich selbst antreten.');
    // Geist = leerer Platz; er darf mehrfach vorkommen, echte Spieler nicht
    const echt = (x: string | null | undefined) => (x && x !== GEIST ? x : null);
    const partner = istDoppel ? { doppel: true, partner_a: echt(neu.heim2), partner_b: echt(neu.gast2) } : {};
    const personen4 = plaetze.filter((x) => x && x !== GEIST);
    if (istDoppel && new Set(personen4).size < personen4.length) {
      // Die halbe Wahl bleibt stehen, damit der Platz neu gewaehlt werden kann
      await halbeAufstellungMerken(s.nr, neu);
      return setFehler(`Doppel ${s.nr}: Jeder Spieler darf in einer Partie nur einmal stehen.`);
    }

    if (vorhanden) {
      const { error } = await supabase.from('partien').update({ spieler_a, spieler_b, ...partner }).eq('id', vorhanden.id);
      if (error) return setFehler(error.message);
    } else {
      const { error } = await supabase.from('partien').insert({
        verein_id: turnier.verein_id,
        turnier_id: turnier.id,
        disziplin: s.disziplin,
        datum: turnier.datum,
        phase: s.runde,
        runde: s.runde === 'hin' ? 1 : 2,
        paarung: s.paarung,
        spieler_a,
        spieler_b,
        ...partner,
        race_to: s.ziel,
        vorgabe_a: 0,
        vorgabe_b: 0,
        status: 'geplant',
        // Doppel zaehlen nie fuers Rating (die Datenbank prueft das auch)
        ...(istDoppel ? { rating_werten: false } : {})
      });
      if (error) return setFehler(error.message);
    }
    await halbeAufstellungMerken(s.nr, null);
    await teilnehmerPflegen(personen4);
    await laden();
  }

  // Halbe Aufstellung in den Einstellungen des Spieltags ablegen (null: Eintrag
  // entfernen). Gelesen wird frisch aus der Datenbank, damit nichts anderes
  // in den Einstellungen ueberschrieben wird.
  async function halbeAufstellungMerken(nr: number, eintrag: Wahl | null) {
    if (!turnier) return;
    const { data } = await supabase.from('turniere').select('einstellungen').eq('id', turnier.id).maybeSingle();
    const aktuell = (data?.einstellungen ?? {}) as TurnierEinstellungen;
    if (!aktuell.liga) return;
    const bisher = aktuell.liga.aufstellung ?? {};
    const schluessel = String(nr);
    if (!eintrag && !(schluessel in bisher)) return;
    const neu = { ...bisher };
    if (eintrag) neu[schluessel] = eintrag;
    else delete neu[schluessel];
    const { error } = await supabase
      .from('turniere')
      .update({ einstellungen: { ...aktuell, liga: { ...aktuell.liga, aufstellung: neu } } })
      .eq('id', turnier.id);
    if (error) setFehler(error.message);
  }

  // Wer in der Begegnung spielt, steht auch in der Teilnehmerliste
  async function teilnehmerPflegen(ids: (string | null | undefined)[]) {
    if (!turnier) return;
    const neue = ids.filter((id): id is string => Boolean(id) && !teilnehmer.some((t) => t.person_id === id));
    if (neue.length === 0) return;
    await supabase
      .from('turnier_teilnehmer')
      .insert(neue.map((id) => ({ turnier_id: turnier.id, person_id: id, verein_id: turnier.verein_id })));
  }

  async function ergebnisSetzen(s: LigaSpiel, heimWert: number | null, gastWert: number | null) {
    const p = partieVon(s);
    if (!p) return setFehler('Erst beide Spieler eintragen.');
    const ergebnis_a = heimWert;
    const ergebnis_b = gastWert;
    const leer = ergebnis_a === null || ergebnis_b === null;
    const neu = {
      ergebnis_a,
      ergebnis_b,
      status: (leer ? 'geplant' : 'beendet') as Partie['status'],
      beendet: leer ? null : p.beendet ?? new Date().toISOString()
    };
    const { error } = await supabase.from('partien').update(neu).eq('id', p.id);
    if (error) return setFehler(error.message);
    setPartien((liste) => liste.map((x) => (x.id === p.id ? { ...x, ...neu } : x)));
  }

  async function partieWertung(s: LigaSpiel, werten: boolean) {
    const p = partieVon(s);
    if (!p) return;
    const { error } = await supabase.from('partien').update({ rating_werten: werten }).eq('id', p.id);
    if (error) return setFehler(error.message);
    setPartien((liste) => liste.map((x) => (x.id === p.id ? { ...x, rating_werten: werten } : x)));
  }

  async function gastAnlegen() {
    if (!turnier || !liga) return;
    const text = gastName.trim().replace(/\s+/g, ' ');
    if (text.length < 2) return setFehler('Bitte den Namen des gegnerischen Spielers eingeben.');
    const teile = text.split(' ');
    const nachname = teile.length > 1 ? (teile.pop() as string) : '';
    const { error } = await supabase.from('personen').insert({
      verein_id: turnier.verein_id,
      vorname: teile.join(' '),
      nachname,
      anzeigename: `${text} (${liga.gegner})`,
      status: 'gast'
    });
    if (error) {
      return setFehler(
        error.message.includes('row-level security')
          ? 'Gäste anlegen dürfen Vereins-Admin, Sportwart und Turnierleiter.'
          : error.message
      );
    }
    setGastName('');
    await laden();
  }

  // Zur anderen Begegnung des Spieltags wechseln. Sie entsteht schon beim
  // Anlegen des Spieltags; fehlt sie bei aelteren Spieltagen, wird sie hier
  // nachgeholt.
  async function begegnungOeffnen(nummer: 1 | 2) {
    if (!turnier || !liga) return;
    // Mit Doppel-Begegnung: direkt ueber die geladene Reihenfolge
    if (teile.length > 0 && (istDoppel || teile.some((x) => x.doppel))) {
      const ziel = teile.find((x) => !x.doppel && x.nummer === (nummer === 1 ? 1 : 3));
      if (ziel && ziel.id !== turnier.id) oeffnen(ziel.id);
      return;
    }
    if (nummer === liga.begegnung) return;
    // Nur einem Verweis folgen, dessen Turnier es noch gibt; sonst neu anlegen
    if (liga.partner) {
      const { data: vorhanden } = await supabase.from('turniere').select('id').eq('id', liga.partner).maybeSingle();
      if (vorhanden) return oeffnen(liga.partner);
    }
    if (!darfLeiten) return setFehler('Die andere Begegnung legt die Turnierleitung an.');
    setArbeitet(true);
    const neu = await andereBegegnungAnlegen(turnier);
    setArbeitet(false);
    if (neu.fehler !== null) return setFehler(neu.fehler);
    oeffnen(neu.id);
  }

  // Doppel-Begegnung nachtraeglich anlegen (Spass-Liga): nur, solange die
  // spaetere Einzel-Begegnung noch nicht gestartet ist
  const ersteBegegnung = teile.find((x) => x.nummer === 1 && !x.doppel) ?? null;
  const spaetere = teile.find((x) => !x.doppel && x.nummer !== 1) ?? null;
  const doppelMoeglich =
    darfLeiten &&
    liga?.liga === 'spass' &&
    !teile.some((x) => x.doppel) &&
    ersteBegegnung !== null &&
    (spaetere === null || spaetere.status === 'geplant');
  async function doppelHinzufuegen() {
    if (!doppelDialog || !ersteBegegnung) return;
    const geprueft = doppelPlanAusEingabe(doppelDialog);
    if (geprueft.fehler !== null) return setFehler(geprueft.fehler);
    setArbeitet(true);
    // Die spaetere Begegnung koennte inzwischen gestartet sein
    if (spaetere) {
      const { data } = await supabase.from('turniere').select('status, einstellungen').eq('id', spaetere.id).maybeSingle();
      const gestartetSchon = ((data?.einstellungen ?? {}) as TurnierEinstellungen).liga?.gestartet;
      if (data && (data.status !== 'geplant' || gestartetSchon?.hin || gestartetSchon?.rueck)) {
        setArbeitet(false);
        return setFehler('Die nächste Begegnung ist schon gestartet. Eine Doppel-Begegnung lässt sich nicht mehr dazwischenschieben.');
      }
    }
    const { data: erste } = await supabase.from('turniere').select('*').eq('id', ersteBegegnung.id).single();
    const neu = erste ? await doppelBegegnungAnlegen(erste, geprueft.plan as DoppelPartie[]) : { id: null, fehler: '1. Begegnung nicht gefunden.' };
    setArbeitet(false);
    if (neu.fehler !== null) return setFehler(neu.fehler);
    setDoppelDialog(null);
    oeffnen(neu.id as string);
  }

  // Partienliste der Doppel-Begegnung aendern: vorhandene Partien und halbe
  // Aufstellungen folgen ihrer Zeile, die Regeln stehen in doppelPlanAendern
  async function planSpeichern() {
    if (!planDialog || !turnier || !liga) return;
    const geprueft = doppelPlanAusEingabe(planDialog);
    if (geprueft.fehler !== null) return setFehler(geprueft.fehler);
    const zeilen = geprueft.plan.map((p, i) => ({ ...p, herkunft: planDialog[i].herkunft }));
    const ergebnis = doppelPlanAendern(
      zeilen,
      liga.doppelPlan ?? [],
      partien.map((p) => ({
        paarung: p.paarung ?? 0,
        gespielt: p.status === 'beendet' || p.ergebnis_a !== null || p.ergebnis_b !== null,
        amTisch: Boolean(p.tisch_id) || p.status === 'laeuft'
      }))
    );
    if (ergebnis.fehler !== null) return setFehler(ergebnis.fehler);
    const { plan, folgen, entfallen } = ergebnis.aenderung;
    if (entfallen.some((nr) => partien.some((p) => p.paarung === nr))) {
      const liste = entfallen.filter((nr) => partien.some((p) => p.paarung === nr)).join(', ');
      if (!(await fragen(`Die Aufstellung von Doppel ${liste} wird gelöscht. Weiter?`, 'Speichern'))) return;
    }
    setArbeitet(true);
    for (const nr of entfallen) {
      const p = partien.find((x) => x.paarung === nr);
      if (p) {
        const { error } = await supabase.from('partien').delete().eq('id', p.id);
        if (error) {
          setArbeitet(false);
          return setFehler(error.message);
        }
      }
    }
    for (const f of folgen) {
      const p = partien.find((x) => x.paarung === f.von);
      if (!p) continue;
      const { error } = await supabase
        .from('partien')
        .update({ paarung: f.nach, disziplin: f.disziplin, race_to: f.ziel })
        .eq('id', p.id);
      if (error) {
        setArbeitet(false);
        return setFehler(error.message);
      }
    }
    // Plan und halbe Aufstellung frisch lesen und gemeinsam speichern
    const { data } = await supabase.from('turniere').select('einstellungen').eq('id', turnier.id).maybeSingle();
    const aktuell = (data?.einstellungen ?? einstellungen) as TurnierEinstellungen;
    const bisher = aktuell.liga?.aufstellung ?? {};
    const aufstellung: NonNullable<NonNullable<TurnierEinstellungen['liga']>['aufstellung']> = {};
    folgen.forEach((f) => {
      if (bisher[String(f.von)]) aufstellung[String(f.nach)] = bisher[String(f.von)];
    });
    const { error } = await supabase
      .from('turniere')
      .update({ einstellungen: { ...aktuell, liga: { ...aktuell.liga!, doppelPlan: plan, aufstellung } } })
      .eq('id', turnier.id);
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setPlanDialog(null);
    setMeldung('Doppel-Partien geändert.');
    await laden();
  }

  // Doppel-Begegnung entfernen (nur Vereins-Administrator): mit allen Partien;
  // die 1. Begegnung verliert den Verweis, die 3. heisst wieder 2.
  async function doppelEntfernen() {
    if (!turnier || !liga || !istDoppel) return;
    if (partien.some((p) => p.status === 'laeuft' || p.tisch_id)) {
      return setFehler('An den Tablets laufen noch Doppel. Erst beenden oder abbrechen, dann entfernen.');
    }
    const mitErgebnis = partien.filter((p) => p.ergebnis_a !== null || p.ergebnis_b !== null).length;
    const frage =
      'Doppel-Begegnung entfernen? Das lässt sich nicht rückgängig machen.\n\n' +
      `${partien.length} ${partien.length === 1 ? 'Partie' : 'Partien'}${mitErgebnis > 0 ? `, davon ${mitErgebnis} mit Ergebnis,` : ''} ${partien.length === 1 ? 'geht' : 'gehen'} verloren. ` +
      'Die bisherige 3. Begegnung heißt danach wieder 2. Begegnung.';
    if (!(await fragen(frage, 'Entfernen'))) return;
    setArbeitet(true);
    const { error } = await supabase.from('turniere').delete().eq('id', turnier.id);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    if (liga.haupt) {
      const { data } = await supabase.from('turniere').select('einstellungen').eq('id', liga.haupt).maybeSingle();
      const erste = (data?.einstellungen ?? null) as TurnierEinstellungen | null;
      if (erste?.liga) {
        const { doppel: _d, ...ohne } = erste.liga;
        await supabase.from('turniere').update({ einstellungen: { ...erste, liga: ohne } }).eq('id', liga.haupt);
      }
    }
    setArbeitet(false);
    if (liga.haupt) oeffnen(liga.haupt);
    else zurueck();
  }

  // Aufstellung einer Mannschaft verbergen oder wieder zeigen. Verbergen geht
  // ohne Nachfrage, zeigen nur mit dem Passwort.
  async function verdeckenSetzen(runde: 'hin' | 'rueck', seite: 'heim' | 'gast', verbergen: boolean) {
    if (!turnier || !liga) return;
    const verdeckt = {
      ...(liga.verdeckt ?? {}),
      [runde]: { ...(liga.verdeckt?.[runde] ?? {}), [seite]: verbergen }
    };
    const neu = { ...einstellungen, liga: { ...liga, verdeckt } };
    const { error } = await supabase.from('turniere').update({ einstellungen: neu }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setTurnier({ ...turnier, einstellungen: neu });
  }

  async function schutzAufheben() {
    if (!verein || !(await schutzwortPruefen(verein.id, passwort))) {
      setFehler('Das Passwort stimmt nicht.');
      return;
    }
    setFehler(null);
    setSchutzFrage(false);
    setPasswort('');
    setHinFrei(true);
  }

  async function passwortPruefen() {
    if (!passwortFrage) return;
    if (!verein || !(await schutzwortPruefen(verein.id, passwort))) {
      setFehler('Das Passwort stimmt nicht.');
      return;
    }
    setFehler(null);
    const { runde, seite } = passwortFrage;
    setPasswortFrage(null);
    setPasswort('');
    await verdeckenSetzen(runde, seite, false);
  }

  // Live-Uebertragung, Chat und TV-Anzeige gelten fuer den ganzen Spieltag: alle Begegnungen
  async function spieltagSetzen(aenderung: Pick<TurnierEinstellungen, 'live' | 'chat' | 'tvAnsicht'>) {
    if (!turnier || !liga) return;
    const ids = [...new Set([turnier.id, ...(liga.partner ? [liga.partner] : []), ...teile.map((x) => x.id)])];
    const { data, error } = await supabase.from('turniere').select('id, einstellungen').in('id', ids);
    if (error) return setFehler(error.message);
    for (const t of data ?? []) {
      const neu = { ...((t.einstellungen ?? {}) as TurnierEinstellungen), ...aenderung };
      const { error: fehler } = await supabase.from('turniere').update({ einstellungen: neu }).eq('id', t.id);
      if (fehler) return setFehler(fehler.message);
    }
    await laden();
  }

  async function ratingUmschalten() {
    if (!turnier) return;
    const { error } = await supabase.from('turniere').update({ rating_werten: !turnier.rating_werten }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  // Jede Begegnung wird fuer sich abgeschlossen; danach sind ihre Ergebnisse
  // gesperrt. Gerechnet wird das Rating erst, wenn der ganze Spieltag - also
  // auch die andere Begegnung - abgeschlossen ist.
  async function abschliessen() {
    if (!turnier || !liga) return;
    const name = begegnungName;
    if (punkte.offen > 0 && !(await fragen(`Noch ${punkte.offen} Partien ohne Ergebnis. ${name} trotzdem abschließen?`))) return;
    // Andere Begegnungen noch nicht angelegt oder schon fertig: dann ist das hier der Schluss
    const letzte = teile.filter((x) => x.id !== turnier.id).every((x) => x.status === 'beendet');
    const zusatz = letzte
      ? turnier.rating_werten
        ? '\nDamit ist der Spieltag komplett, das Rating wird neu berechnet.'
        : '\nDamit ist der Spieltag komplett.'
      : turnier.rating_werten
        ? '\nDie Ergebnisse sind danach gesperrt. Ins Rating gehen sie beim nächtlichen Lauf ein, sofort erst mit dem Abschluss der anderen Begegnung.'
        : '\nDie Ergebnisse sind danach gesperrt.';
    if (!(await fragen(`${name} abschließen?${zusatz}`, 'Abschließen'))) return;
    setArbeitet(true);
    const { error } = await supabase.from('turniere').update({ status: 'beendet' }).eq('id', turnier.id);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    // Letzte Begegnung eines Spieltags mit mehreren: Fernseher zeigt das Ergebnis
    if (letzte && teile.length >= 2) await spieltagSetzen({ tvAnsicht: 'spieltag' });
    if (!letzte) {
      setArbeitet(false);
      setMeldung(
        turnier.rating_werten
          ? `${name} abgeschlossen. Ins Rating gehen die Ergebnisse heute Nacht ein, sofort erst mit dem Abschluss der anderen Begegnung.`
          : `${name} abgeschlossen.`
      );
      await laden();
      return;
    }
    if (!turnier.rating_werten) {
      setArbeitet(false);
      setMeldung('Spieltag abgeschlossen. Er zählt nicht fürs Rating.');
      await laden();
      return;
    }
    const rating = await supabase.functions.invoke('rating', { body: { verein_id: turnier.verein_id } });
    setArbeitet(false);
    setMeldung(
      rating.error
        ? 'Spieltag abgeschlossen. Das Rating wird heute Nacht neu berechnet.'
        : 'Spieltag abgeschlossen, Rating neu berechnet.'
    );
    await laden();
  }

  // Erst ein laufender Spieltag erscheint an den Tablets. Gestartet wird er
  // von Hand, damit die Aufstellung vorher in Ruhe eingetragen werden kann.
  // Hin- und Rueckrunde dieser Begegnung einzeln fuer die Tablets freigeben.
  // Die Hinrunde setzt die Begegnung auf "laeuft" (Live, Chat, Tablets).
  async function rundeStarten(runde: 'hin' | 'rueck') {
    if (!turnier || !liga) return;
    // Die Tablets zeigen immer nur eine laufende Begegnung. Ist die andere
    // schon fertig gespielt, nur noch nicht abgeschlossen: gleich mit abschliessen.
    const laeuftNoch = teile.find((x) => x.id !== turnier.id && x.status === 'laeuft');
    if (runde === 'hin' && laeuftNoch) {
      const andere = `${laeuftNoch.nummer}. Begegnung${laeuftNoch.doppel ? ' (Doppel)' : ''}`;
      const { data: ihrePartien } = await supabase.from('partien').select('status').eq('turnier_id', laeuftNoch.id);
      if (fertigGespielt(ihrePartien ?? [])) {
        if (
          !(await fragen(
            `Die ${andere} ist fertig gespielt, aber noch nicht abgeschlossen.\n${andere} abschließen und ${istDoppel ? 'Doppel' : 'Hinrunde'} starten?`,
            'Abschließen und starten'
          ))
        ) {
          return;
        }
        const { error: abschlussFehler } = await supabase.from('turniere').update({ status: 'beendet' }).eq('id', laeuftNoch.id);
        if (abschlussFehler) return setFehler(abschlussFehler.message);
      } else if (
        !(await fragen(
          `Die ${andere} läuft noch. An den Tablets erscheint immer nur eine Begegnung. Trotzdem starten?`,
          'Trotzdem starten'
        ))
      ) {
        return;
      }
    }
    const neu = { ...einstellungen, liga: { ...liga, gestartet: { ...gestartet, [runde]: true } } };
    const { error } = await supabase
      .from('turniere')
      .update({ einstellungen: neu, ...(turnier.status === 'geplant' ? { status: 'laeuft' as const } : {}) })
      .eq('id', turnier.id);
    if (error) return setFehler(error.message);
    if (runde === 'rueck') setHinFrei(false);
    setMeldung(
      istDoppel
        ? 'Doppel gestartet. Die Partien stehen jetzt an den Tablets zur Auswahl.'
        : runde === 'hin'
        ? 'Hinrunde gestartet. Ihre Partien stehen jetzt an den Tablets zur Auswahl.'
        : 'Rückrunde gestartet. Ihre Partien stehen jetzt an den Tablets zur Auswahl; die Hinrunde ist geschützt.'
    );
    await laden();
  }

  // Versehentlich gestartete Runde zuruecknehmen: nur solange keine ihrer
  // Partien am Tisch liegt oder ein Ergebnis hat, sonst haenge ein Tablet in
  // einer Partie, die es nicht mehr sieht. Ohne gestartete Runde steht die
  // Begegnung wieder auf "in Vorbereitung" (Live und Chat aus).
  const rundeBelegt = (runde: 'hin' | 'rueck') =>
    partien.some(
      (p) =>
        p.runde === (runde === 'hin' ? 1 : 2) &&
        (p.tisch_id !== null || p.status !== 'geplant' || p.ergebnis_a !== null || p.ergebnis_b !== null)
    );
  async function rundeZuruecknehmen(runde: 'hin' | 'rueck') {
    if (!turnier || !liga) return;
    const titel = istDoppel ? 'Doppel' : runde === 'hin' ? 'Hinrunde' : 'Rückrunde';
    const frage =
      istDoppel
        ? 'Start des Doppels zurücknehmen?\nSeine Partien verschwinden wieder von den Tablets, die Begegnung steht wieder auf „in Vorbereitung“ (Live und Chat aus). Aufstellung bleibt.'
        : runde === 'hin'
        ? 'Start der Hinrunde zurücknehmen?\nIhre Partien verschwinden wieder von den Tablets, die Begegnung steht wieder auf „in Vorbereitung“ (Live und Chat aus). Aufstellung bleibt.'
        : 'Start der Rückrunde zurücknehmen?\nIhre Partien verschwinden wieder von den Tablets. Aufstellung bleibt.';
    if (!(await fragen(frage, 'Zurücknehmen'))) return;
    const neu = { ...einstellungen, liga: { ...liga, gestartet: { ...gestartet, [runde]: false } } };
    const { error } = await supabase
      .from('turniere')
      .update({ einstellungen: neu, ...(runde === 'hin' ? { status: 'geplant' as const } : {}) })
      .eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setMeldung(istDoppel ? 'Start des Doppels zurückgenommen.' : `Start der ${titel} zurückgenommen.`);
    await laden();
  }

  async function wiederOeffnen() {
    if (!turnier || !(await fragen('Spieltag wieder öffnen?', 'Wieder öffnen'))) return;
    const { error } = await supabase.from('turniere').update({ status: 'laeuft' }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  // Inhalt der Begegnung loeschen: Aufstellung, Partien, Ergebnisse und
  // 14.1-Protokoll. Die Begegnung selbst bleibt bestehen (die andere Begegnung
  // verweist auf sie) und laesst sich danach neu ausfuellen.
  async function inhaltLoeschen() {
    if (!turnier || !liga) return;
    if (partien.some((p) => p.status === 'laeuft')) {
      return setFehler('An den Tablets laufen noch Spiele dieser Begegnung. Erst beenden oder abbrechen, dann den Inhalt löschen.');
    }
    const mitErgebnis = partien.filter((p) => p.ergebnis_a !== null || p.ergebnis_b !== null).length;
    const warnung =
      mitErgebnis > 0
        ? (mitErgebnis === 1
            ? 'Achtung: In dieser Begegnung steht schon 1 Ergebnis. Es geht verloren.'
            : `Achtung: In dieser Begegnung stehen schon ${mitErgebnis} Ergebnisse. Sie gehen verloren.`) +
          `${turnier.rating_werten ? ' Das Vereins-Rating wird heute Nacht ohne sie neu berechnet.' : ''}\n\n`
        : '';
    const frage =
      `${warnung}Inhalt der ${begegnungName} löschen? Aufstellung, Partien und Ergebnisse werden entfernt, bei 14.1 auch das Aufnahme-Protokoll. ` +
      'Die Begegnung bleibt bestehen und lässt sich danach neu ausfüllen.';
    if (!(await fragen(frage, 'Inhalt löschen'))) return;
    setArbeitet(true);
    // 14.1-Kennzahlen und Aufnahme-Protokoll loescht die Datenbank mit den Partien
    for (const tabelle of ['partien', 'turnier_teilnehmer'] as const) {
      const { error } = await supabase.from(tabelle).delete().eq('turnier_id', turnier.id);
      if (error) {
        setArbeitet(false);
        return setFehler(error.message);
      }
    }
    const { aufstellung: _a, verdeckt: _v, quelle: _q, gestartet: _g, ...ligaLeer } = liga;
    const { error } = await supabase
      .from('turniere')
      .update({ status: 'geplant', einstellungen: { ...einstellungen, liga: ligaLeer } })
      .eq('id', turnier.id);
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setMeldung(`Inhalt der ${begegnungName} gelöscht. Sie lässt sich jetzt neu ausfüllen.`);
    await laden();
  }

  // Den ganzen Spieltag entfernen: beide Begegnungen mit allen Partien
  // (nur Vereins-Administrator). Partien, 14.1-Protokoll, Teilnehmer und
  // Anmeldungen loescht die Datenbank mit.
  async function spieltagLoeschen() {
    if (!turnier || !liga) return;
    // Alle Begegnungen des Spieltags, auch die Doppel-Begegnung
    const ids = [...new Set([turnier.id, ...(liga.partner ? [liga.partner] : []), ...teile.map((x) => x.id)])];
    const { data: alle } = await supabase.from('partien').select('turnier_id, status, ergebnis_a, ergebnis_b').in('turnier_id', ids);
    if ((alle ?? []).some((p) => p.status === 'laeuft')) {
      return setFehler('An den Tablets laufen noch Spiele dieses Spieltags. Erst beenden oder abbrechen, dann löschen.');
    }
    const zeile = (name: string, liste: { ergebnis_a: number | null; ergebnis_b: number | null }[]) => {
      const mit = liste.filter((p) => p.ergebnis_a !== null || p.ergebnis_b !== null).length;
      return `• ${name}: ${liste.length} ${liste.length === 1 ? 'Partie' : 'Partien'}${mit > 0 ? `, davon ${mit} mit Ergebnis` : ''}`;
    };
    const reihe = teile.length > 0 ? teile : [{ nummer: eigeneNummer, id: turnier.id, status: turnier.status, doppel: istDoppel }];
    const zeilen = reihe
      .map((x) => zeile(`${x.nummer}. Begegnung${x.doppel ? ' (Doppel)' : ''}`, (alle ?? []).filter((p) => p.turnier_id === x.id)))
      .join('\n');
    const frage =
      `Den ganzen Spieltag „${turnier.name.replace(/ · ([12]\. Begegnung|Doppel)$/, '')}“ löschen? Das lässt sich nicht rückgängig machen.\n\n${zeilen}` +
      (turnier.rating_werten ? '\n\nDas Vereins-Rating wird heute Nacht ohne diese Partien neu berechnet.' : '');
    if (!(await fragen(frage, 'Spieltag löschen'))) return;
    setArbeitet(true);
    const { error } = await supabase.from('turniere').delete().in('id', ids);
    setArbeitet(false);
    if (error) return setFehler(error.message);
    zurueck();
  }

  // ---------- Anzeige ----------

  const eigenerName = liga.eigene || verein.name;
  // Spaltenfolge wie im Spielbericht: erst Heim, dann Gast
  const heimMannschaft = wirSindHeim ? eigenerName : liga.gegner;
  const gastMannschaft = wirSindHeim ? liga.gegner : eigenerName;
  const reihen: { runde: 'hin' | 'rueck'; titel: string }[] = istDoppel
    ? [{ runde: 'hin', titel: 'Doppel' }]
    : [
        { runde: 'hin', titel: 'Hinrunde' },
        { runde: 'rueck', titel: 'Rückrunde' }
      ];
  // Umschalter: alle Begegnungen des Spieltags; ohne geladene Reihenfolge die
  // bisherigen zwei (die fehlende 2. legt begegnungOeffnen an)
  const umschalter: { nummer: number; id: string | null; doppel: boolean; status: Turnier['status'] | null }[] =
    teile.some((x) => x.doppel)
      ? teile.map((x) => ({ nummer: x.nummer, id: x.id, doppel: x.doppel, status: x.status }))
      : ([1, 2] as const).map((n) => {
          const x = teile.find((y) => y.nummer === n);
          return { nummer: n, id: x?.id ?? null, doppel: false, status: x?.status ?? null };
        });
  const zeitHinweis = istDoppel
    ? 'im Doppel, Heimrecht wie in der 1. Begegnung'
    : eigeneNummer === 1
      ? 'zuerst gespielt'
      : 'danach gespielt, mit getauschtem Heimrecht';

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf kopf-umbruch">
          <div>
            <button type="button" title={`Zurück zur Seite „${zurueckText}“`} className="zurueck" onClick={zurueck}>
              ← {zurueckText}
            </button>
            <h2>
              {LIGEN[liga.liga].name} · {liga.spieltag}. Spieltag
            </h2>
            <div className="zeile">
              <span className="hinweis">Begegnung:</span>
              <span className="umschalter">
                {umschalter.map((u) => {
                  const aktiv = u.id === turnier.id || (u.id === null && u.nummer === eigeneNummer);
                  const titel = `${u.nummer}. Begegnung${u.doppel ? ' · Doppel' : ''}`;
                  return (
                    <button
                      key={u.id ?? u.nummer}
                      type="button"
                      className={aktiv ? 'aktiv' : ''}
                      disabled={arbeitet}
                      title={aktiv ? `Die ${titel} wird gerade angezeigt.` : `Die ${titel} anzeigen.`}
                      onClick={() => {
                        if (aktiv) return;
                        if (u.id) return oeffnen(u.id);
                        void begegnungOeffnen(u.nummer === 1 ? 1 : 2);
                      }}
                    >
                      {titel}
                      {(aktiv ? turnier.status : u.status) === 'beendet' ? ' ✓' : ''}
                    </button>
                  );
                })}
              </span>
              <span className="hinweis">{zeitHinweis}</span>
              {doppelMoeglich && (
                <button
                  type="button"
                  className="klein"
                  disabled={arbeitet}
                  title="Eine Begegnung im Doppel zwischen der 1. und der nächsten Begegnung einschieben. Geht, solange die nächste Begegnung noch nicht gestartet ist."
                  onClick={() => {
                    setFehler(null);
                    setDoppelDialog(DOPPEL_ZEILEN_STANDARD.map((z) => ({ ...z })));
                  }}
                >
                  + Doppel-Begegnung
                </button>
              )}
            </div>
            <p className="hinweis">
              {datumLang(turnier.datum)} · {eigenerName} gegen {liga.gegner} · {liga.heim ? 'Heimspiel' : 'Auswärtsspiel'} ·{' '}
              {istDoppel
                ? `${spiele.length} Doppel: ${spiele
                    .map((s) => `${DISZIPLIN_KURZ[s.disziplin]} Race to ${s.ziel}`)
                    .join(' · ')}`
                : `14.1 ${liga.ziele.punkte141} Punkte / ${liga.ziele.aufnahmen141} Aufnahmen · 8-Ball ${liga.ziele['8-ball']} · 9-Ball ${liga.ziele['9-ball']} · 10-Ball ${liga.ziele['10-ball']} Gewinnsätze`}
            </p>
            {istDoppel && (
              <p className="hinweis">
                Doppel zählen nicht fürs Rating und nicht in die Bilanz der Mannschaft. Partie- und Matchpunkte stehen nur
                hier.
              </p>
            )}
            {!turnier.rating_werten && !istDoppel && (
              <p className="hinweis">
                Keine Partie dieses Spieltags zählt fürs Rating. Mit „Fürs Rating werten“ zählen die Partien, die rechts
                angehakt sind.
              </p>
            )}
          </div>
          <div className="kopfrechts">
          <div className="knopfpaar kopfaktionen">
            <span className={`marke ${turnier.status === 'laeuft' ? 'livelaeuft' : ''}`}>{STATUS_TEXT[turnier.status]}</span>
            {bearbeitbar && !istDoppel && (
              <button type="button" title="Den Spielbericht des Verbands einlesen und die Ergebnisse in diese Begegnung übernehmen. Vorher zeigt eine Vorschau jede Partie." onClick={() => setImportOffen(true)}>
                Spielbericht einlesen
              </button>
            )}
            {bearbeitbar && !istDoppel && (
              <button type="button" title={turnier.rating_werten ? 'Nimmt die Partien dieses Spieltags aus dem Vereins-Rating.' : 'Lässt die Pool-Partien dieses Spieltags ins Vereins-Rating eingehen.'} onClick={() => void ratingUmschalten()}>
                {turnier.rating_werten ? 'Nicht fürs Rating werten' : 'Fürs Rating werten'}
              </button>
            )}
            {bearbeitbar && istDoppel && (
              <button
                type="button"
                title="Doppel-Partien ändern: Disziplin, Race to, Reihenfolge, Partien hinzufügen oder entfernen. Partien mit Ergebnis behalten Disziplin und Race to."
                disabled={arbeitet}
                onClick={() => {
                  setFehler(null);
                  setPlanDialog(
                    (liga.doppelPlan ?? []).map((p, i) => ({ disziplin: p.disziplin, ziel: String(p.ziel), herkunft: i + 1 }))
                  );
                }}
              >
                Partien ändern
              </button>
            )}
            {bearbeitbar && (
              <button
                type="button"
                // Gelb, sobald alle Partien gespielt sind: nur das Abschliessen fehlt noch
                className={turnier.status === 'laeuft' && fertigGespielt(partien) ? 'faellig' : undefined}
                title="Beendet diese Begegnung und sperrt ihre Ergebnisse. Ist die andere Begegnung schon abgeschlossen, wird das Rating sofort neu berechnet."
                onClick={() => void abschliessen()}
                disabled={arbeitet}
              >
                Begegnung abschließen
              </button>
            )}
            {istAdmin && turnier.status === 'beendet' && (
              <button type="button" title="Öffnet die Begegnung wieder, damit sich Aufstellung und Ergebnisse ändern lassen." onClick={() => void wiederOeffnen()}>
                Wieder öffnen
              </button>
            )}
            {istAdmin && (
              <button
                type="button"
                title="Löscht Aufstellung, Partien und Ergebnisse dieser Begegnung; die Begegnung bleibt bestehen und lässt sich neu ausfüllen. Stehen schon Ergebnisse drin, kommt vorher eine Warnung."
                className="gefahrknopf"
                onClick={() => void inhaltLoeschen()}
                disabled={arbeitet}
              >
                Inhalt löschen
              </button>
            )}
            {istAdmin && istDoppel && (
              <button
                type="button"
                title="Entfernt nur diese Doppel-Begegnung mit ihren Partien. Die anderen Begegnungen bleiben; die 3. heißt danach wieder 2."
                className="gefahrknopf"
                onClick={() => void doppelEntfernen()}
                disabled={arbeitet}
              >
                Doppel-Begegnung entfernen
              </button>
            )}
            {istAdmin && (
              <button
                type="button"
                title="Löscht den ganzen Spieltag: alle Begegnungen mit allen Partien und Ergebnissen. Vorher nennt eine Rückfrage, was verloren geht."
                className="gefahrknopf"
                onClick={() => void spieltagLoeschen()}
                disabled={arbeitet}
              >
                Spieltag löschen
              </button>
            )}
          </div>
          {bearbeitbar && turnier.status !== 'beendet' && (
            <LiveSchalter an={einstellungen.live !== false} schalten={(an) => void spieltagSetzen({ live: an })} />
          )}
          {bearbeitbar && turnier.status !== 'beendet' && vereinsEinstellungen(verein?.einstellungen).chat && (
            <ChatSchalter
              an={einstellungen.chat === true}
              gesperrt={einstellungen.live === false}
              schalten={(an) => void spieltagSetzen({ chat: an })}
            />
          )}
          {bearbeitbar && turnier.status !== 'beendet' && liga && (
            // Der Link haengt an der 1. Begegnung und zeigt den ganzen Spieltag
            <OeffentlicherLink
              turnierId={(liga.art === 'doppel' ? liga.haupt : (liga.begegnung ?? 1) === 1 ? turnier.id : liga.partner) ?? turnier.id}
              vereinId={turnier.verein_id}
              turnierDatum={turnier.datum}
            />
          )}
          {darfLeiten && teile.length >= 2 && turnier.status !== 'geplant' && (
            // Was die Fernseher zeigen, fuer alle Begegnungen; nach dem Abschluss
            // der letzten Begegnung stellt CueDesk selbst auf das Ergebnis um
            <span className="umschalter" title="Legt fest, was die TV-Anzeige zeigt">
              {(
                [
                  ['live', 'TV: Live-Tische'],
                  ['spieltag', 'TV: Spieltag-Ergebnis']
                ] as const
              ).map(([wert, name]) => (
                <button
                  key={wert}
                  type="button"
                  className={(einstellungen.tvAnsicht === 'spieltag' ? 'spieltag' : 'live') === wert ? 'aktiv' : ''}
                  onClick={() => void spieltagSetzen({ tvAnsicht: wert })}
                >
                  {name}
                </button>
              ))}
            </span>
          )}
          </div>
        </div>
        <div className="kennzahlen">
          <div title="Gewonnene Partien je Mannschaft, Heim zuerst">
            <span>Partiepunkte</span>
            <strong>
              {punkte.partiepunkte[0]} : {punkte.partiepunkte[1]}
            </strong>
            <small>
              {heimMannschaft} gegen {gastMannschaft}
            </small>
          </div>
          <div title="Wertung der Begegnung für die Ligatabelle, Heim zuerst: Sieg 3 : 0, Unentschieden 1 : 1, Niederlage 0 : 3. Entscheidend sind die Partiepunkte.">
            <span>Matchpunkte</span>
            <strong>{punkte.entschieden ? `${punkte.matchpunkte[0]} : ${punkte.matchpunkte[1]}` : '–'}</strong>
            <small>
              {punkte.entschieden
                ? `endgültig · ${
                    punkte.matchpunkte[0] === punkte.matchpunkte[1]
                      ? 'Unentschieden'
                      : `Sieg ${punkte.matchpunkte[0] > punkte.matchpunkte[1] ? heimMannschaft : gastMannschaft}`
                  }`
                : punkte.partiepunkte[0] + punkte.partiepunkte[1] === 0
                  ? `noch keine Partie entschieden, ${punkte.offen} offen`
                  : `Zwischenstand ${punkte.matchpunkte[0]} : ${punkte.matchpunkte[1]}, noch ${punkte.offen} Partien offen`}
            </small>
            <small className="hinweis">Sieg 3 : 0 · Unentschieden 1 : 1 · Niederlage 0 : 3</small>
          </div>
          {gesamt && (
            <div title="Alle Begegnungen des Spieltags zusammengezählt, aus Sicht der Heimmannschaft der 1. Begegnung. Matchpunkte zählen, sobald eine Begegnung entschieden ist.">
              <span>Spieltag gesamt</span>
              <strong>
                {gesamt.partiepunkte[0]} : {gesamt.partiepunkte[1]}
              </strong>
              <small>
                Partiepunkte · Matchpunkte {gesamt.matchpunkte[0]} : {gesamt.matchpunkte[1]}
                {gesamt.fertig ? ' · endgültig' : ' · Zwischenstand'}
              </small>
              <small className="hinweis">
                {gesamt.links} gegen {gesamt.rechts}
              </small>
              <span>
                <button type="button" className="klein" title="Alle Begegnungen mit Aufstellung und Ergebnis als PDF, zum Drucken oder Weiterschicken" onClick={spielberichtPdf}>
                  Spielbericht als PDF
                </button>
              </span>
            </div>
          )}
        </div>
        {/* Hinweise zur Aufstellung nur, solange die Begegnung offen ist */}
        {turnier.status !== 'beendet' && fehlerAufstellung.length > 0 && (
          <div className="pausehinweis">
            <strong>Aufstellung prüfen:</strong> {fehlerAufstellung.join(' ')}
          </div>
        )}
        {turnier.status !== 'beendet' && hinweiseKader.length > 0 && (
          <div className="pausehinweis">
            <strong>Kader:</strong> {hinweiseKader.join(' ')}
          </div>
        )}
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      {reihen.map((r) => (
        <section key={r.runde} className="block">
          <div className="rundenkopf">
            <h2>{r.titel}</h2>
            {gestartet[r.runde] ? (
              <span className="knopfpaar">
                {turnier.status === 'laeuft' && <span className="livelaeuft">● läuft</span>}
                {bearbeitbar && r.runde === 'hin' && gestartet.rueck && (
                  <button
                    type="button"
                    title={
                      hinGeschuetzt
                        ? 'Ergebnisse der Hinrunde wieder bearbeitbar machen. Braucht das Schutzwort und gilt nur hier, bis du die Seite verlässt.'
                        : 'Die Hinrunde wieder schützen'
                    }
                    onClick={() => {
                      if (!hinGeschuetzt) return setHinFrei(false);
                      setFehler(null);
                      setPasswort('');
                      setSchutzFrage(true);
                    }}
                  >
                    {hinGeschuetzt ? 'Schutz aufheben' : 'Schutz einschalten'}
                  </button>
                )}
                {bearbeitbar &&
                  (r.runde === 'rueck' || !gestartet.rueck) &&
                  (rundeBelegt(r.runde) ? (
                    <span className="hinweis">
                      Partie läuft schon. Erst dort Spiel abbrechen oder hier Zurücksetzen.
                    </span>
                  ) : (
                    <button
                      type="button"
                      title={`Nimmt den Start ${istDoppel ? 'des Doppels' : `der ${r.titel}`} zurück: Die Partien verschwinden wieder von den Tablets. Geht nur, solange keine Partie am Tisch liegt oder ein Ergebnis hat.`}
                      onClick={() => void rundeZuruecknehmen(r.runde)}
                    >
                      Start zurücknehmen
                    </button>
                  ))}
              </span>
            ) : (
              bearbeitbar &&
              (r.runde === 'hin' || gestartet.hin) && (
                <button
                  type="button"
                  title={`Gibt die Partien ${istDoppel ? 'des Doppels' : `der ${r.titel}`} für die Tablets frei. Vorher lässt sich die Aufstellung in Ruhe eintragen; Ergebnisse von Hand gehen jederzeit.`}
                  onClick={() => void rundeStarten(r.runde)}
                >
                  {r.titel} starten
                </button>
              )
            )}
          </div>
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Nr.</th>
                <th>Disziplin</th>
                <th>
                  {heimMannschaft}
                  <small> {wirSindHeim ? 'wir, Heim' : 'Heim'}</small>
                </th>
                <th className="doppelpunkt"></th>
                <th>
                  {gastMannschaft}
                  <small> {wirSindHeim ? 'Gast' : 'wir, Gast'}</small>
                </th>
                <th className="rechts">Ergebnis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {spiele
                .filter((s) => s.runde === r.runde)
                .map((s) => {
                  const p = partieVon(s);
                  return (
                    <Spielzeile
                      key={s.nr}
                      spiel={s}
                      partie={p}
                      heim={heimSpieler(s)}
                      gast={gastSpieler(s)}
                      heimWahl={moeglich(wirSindHeim ? eigeneMitglieder : gaeste, s, 'heim', heimSpieler(s))}
                      gastWahl={moeglich(wirSindHeim ? gaeste : eigeneMitglieder, s, 'gast', gastSpieler(s))}
                      doppel={
                        istDoppel
                          ? {
                              heim2: spielerIn(s, 'heim2'),
                              gast2: spielerIn(s, 'gast2'),
                              heimWahl2: moeglich(wirSindHeim ? eigeneMitglieder : gaeste, s, 'heim2', spielerIn(s, 'heim2')),
                              gastWahl2: moeglich(wirSindHeim ? gaeste : eigeneMitglieder, s, 'gast2', spielerIn(s, 'gast2'))
                            }
                          : null
                      }
                      kaderGruppe={kaderGruppe}
                      eigeneSeite={wirSindHeim ? 'heim' : 'gast'}
                      heimVerdeckt={istVerdeckt(r.runde, 'heim')}
                      gastVerdeckt={istVerdeckt(r.runde, 'gast')}
                      anzeige={anzeige}
                      bearbeitbar={bearbeitbar && !(r.runde === 'hin' && hinGeschuetzt)}
                      spielerSetzen={(seite, id) => void spielerSetzen(s, seite, id)}
                      ergebnisSetzen={(a, b) => void ergebnisSetzen(s, a, b)}
                      wertungSetzen={(werten) => void partieWertung(s, werten)}
                      zuruecksetzen={p ? () => setRuecksetzPartie(p) : undefined}
                      laufend={(() => {
                        const t = p && p.status !== 'beendet' ? laufendeStaende.get(p.id) : undefined;
                        const stand =
                          t && p
                            ? laufenderStand(t.zustand, t.aktualisiert, seitenName(p.spieler_a, p.partner_a), seitenName(p.spieler_b, p.partner_b))
                            : null;
                        return stand && t ? laufenderStandText(stand, tischNummern.get(t.tischId) ?? null) : null;
                      })()}
                      spieltagWertet={turnier.rating_werten}
                    />
                  );
                })}
            </tbody>
            {bearbeitbar && (
              <tfoot>
                <tr>
                  <td colSpan={2}></td>
                  {(['heim', 'gast'] as const).map((seite) => (
                    <td key={seite} colSpan={seite === 'heim' ? 2 : 1}>
                      <button
                        type="button"
                        title="Verborgene Aufstellungen sieht der Gegner nicht. Zum Zeigen wird das Passwort gebraucht."
                        onClick={() =>
                          istVerdeckt(r.runde, seite)
                            ? setPasswortFrage({ runde: r.runde, seite })
                            : void verdeckenSetzen(r.runde, seite, true)
                        }
                      >
                        Aufstellung {istVerdeckt(r.runde, seite) ? 'zeigen' : 'verbergen'}
                      </button>
                    </td>
                  ))}
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
          {bearbeitbar && r.runde === 'hin' && hinGeschuetzt && (
            <p className="hinweis">
              Hinrunde geschützt, weil die Rückrunde läuft: Ergebnisse, Aufstellung, Rating-Haken und Zurücksetzen sind
              gesperrt. Ergebnisse von den Tablets kommen weiter an.
            </p>
          )}
        </section>
      ))}

      {bearbeitbar && (
        <section className="block">
          <h2>Gegnerische Spieler</h2>
          <div className="zeile raster">
            <input
              placeholder="Vor- und Nachname"
              value={gastName}
              onChange={(e) => setGastName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void gastAnlegen()}
            />
            <button type="button" title="Legt den Spieler als Gast an. Danach steht er in den Auswahllisten der Gegnerseite." onClick={() => void gastAnlegen()}>
              Als Gast anlegen
            </button>
          </div>
          <p className="hinweis">
            Der Name bekommt die Mannschaft angehängt, zum Beispiel „Meier ({liga.gegner})“. Gäste stehen in keiner
            Rangliste, ihre Stärke zählt aber für das Rating deiner Spieler.
          </p>
        </section>
      )}
      {doppelDialog && (
        <Modal abbrechen={() => !arbeitet && setDoppelDialog(null)}>
          <h2>Doppel-Begegnung hinzufügen</h2>
          <p>
            Sie wird als 2. Begegnung im Doppel gespielt, mit demselben Gegner und Heimrecht wie die 1. Begegnung. Die
            bisherige 2. Begegnung wird zur 3. Doppel zählen nicht fürs Rating und nicht in die Bilanz der Mannschaft.
          </p>
          <DoppelPlanFelder zeilen={doppelDialog} aendern={setDoppelDialog} />
          {fehler && <p className="fehler">{fehler}</p>}
          <div className="zeile">
            <button type="button" disabled={arbeitet} onClick={() => void doppelHinzufuegen()}>
              Anlegen
            </button>
            <button type="button" disabled={arbeitet} onClick={() => setDoppelDialog(null)}>
              Abbrechen
            </button>
          </div>
        </Modal>
      )}
      {planDialog && (
        <Modal abbrechen={() => !arbeitet && setPlanDialog(null)}>
          <h2>Doppel-Partien ändern</h2>
          <p>
            Aufstellungen bleiben bei ihrer Partie, auch wenn sich die Reihenfolge ändert. Partien mit Ergebnis behalten
            Disziplin und Race to und lassen sich nicht entfernen.
          </p>
          <DoppelPlanFelder zeilen={planDialog} aendern={setPlanDialog} />
          {fehler && <p className="fehler">{fehler}</p>}
          <div className="zeile">
            <button type="button" disabled={arbeitet} onClick={() => void planSpeichern()}>
              Speichern
            </button>
            <button type="button" disabled={arbeitet} onClick={() => setPlanDialog(null)}>
              Abbrechen
            </button>
          </div>
        </Modal>
      )}
      {importOffen && (
        <SpielberichtImport
          turnier={turnier}
          liga={liga}
          personen={personen}
          partien={partien}
          schliessen={() => setImportOffen(false)}
          fertig={() => {
            setImportOffen(false);
            void laden();
          }}
        />
      )}
      {ruecksetzPartie && verein && (
        <ZuruecksetzenDialog
          partie={ruecksetzPartie}
          vereinId={verein.id}
          paarung={`${seitenName(ruecksetzPartie.spieler_a, ruecksetzPartie.partner_a)} – ${seitenName(ruecksetzPartie.spieler_b, ruecksetzPartie.partner_b)}`}
          abbrechen={() => setRuecksetzPartie(null)}
          fertig={() => {
            setRuecksetzPartie(null);
            void laden();
          }}
        />
      )}
      {schutzFrage && (
        <Modal abbrechen={() => setSchutzFrage(false)}>
          <h2>Schutz der Hinrunde aufheben</h2>
          <p>
            Danach lassen sich Ergebnisse, Aufstellung und Rating-Haken der Hinrunde wieder ändern. Das gilt nur hier und
            bis du die Seite verlässt.
          </p>
          <div className="zeile">
            <input
              type="password"
              placeholder="Passwort"
              value={passwort}
              autoFocus
              onChange={(e) => setPasswort(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void schutzAufheben()}
            />
            <button type="button" title="Mit dem Passwort den Schutz der Hinrunde aufheben" onClick={() => void schutzAufheben()}>
              Aufheben
            </button>
          </div>
          {fehler && <p className="fehler">{fehler}</p>}
          <button
            type="button"
            onClick={() => {
              setSchutzFrage(false);
              setPasswort('');
            }}
          >
            Abbrechen
          </button>
        </Modal>
      )}
      {passwortFrage && (
        <Modal abbrechen={() => setPasswortFrage(null)}>
          <h2>Aufstellung zeigen</h2>
          <p>
            Aufstellung von {passwortFrage.seite === 'heim' ? heimMannschaft : gastMannschaft} in der{' '}
            {passwortFrage.runde === 'hin' ? 'Hinrunde' : 'Rückrunde'} sichtbar machen.
          </p>
          <div className="zeile">
            <input
              type="password"
              placeholder="Passwort"
              value={passwort}
              autoFocus
              onChange={(e) => setPasswort(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void passwortPruefen()}
            />
            <button type="button" title="Mit dem Passwort die verborgene Aufstellung sichtbar machen" onClick={() => void passwortPruefen()}>
              Zeigen
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPasswortFrage(null);
              setPasswort('');
            }}
          >
            Abbrechen
          </button>
        </Modal>
      )}
      {/* Zuletzt: Rueckfragen liegen ueber jedem anderen Dialog (z. B. "Partien aendern") */}
      {rueckfrage}
    </div>
  );
}

// Eine Zeile des Spielberichts: zwei Spieler und das Ergebnis. Gespeichert
// wird beim Verlassen der Zeile, wie im Turnier-Spielplan.
function Spielzeile(props: {
  spiel: LigaSpiel;
  partie: Partie | null;
  heim: string | null;
  gast: string | null;
  heimWahl: Person[];
  gastWahl: Person[];
  // Doppel: zweiter Spieler je Seite und seine Auswahl (sonst null)
  doppel: { heim2: string | null; gast2: string | null; heimWahl2: Person[]; gastWahl2: Person[] } | null;
  kaderGruppe: { name: string; ids: Set<string> } | null; // Kader der eigenen Mannschaft, oben in der Liste
  eigeneSeite: 'heim' | 'gast';
  heimVerdeckt: boolean;
  gastVerdeckt: boolean;
  anzeige: (id: string | null) => string;
  bearbeitbar: boolean;
  spielerSetzen: (slot: Slot, id: string | null) => void;
  ergebnisSetzen: (heim: number | null, gast: number | null) => void;
  wertungSetzen: (werten: boolean) => void;
  zuruecksetzen?: () => void;
  laufend: string | null; // laufender Stand am Tisch ("● Tisch 1 · 14 : 28 · Aufn. 1"), nur zum Ansehen
  spieltagWertet: boolean; // Schalter "Fürs Rating werten" des Spieltags
}) {
  const { spiel, partie } = props;
  const wert = (w: number | null | undefined) => (w === null || w === undefined ? '' : String(w));
  const eigenErgebnis = partie?.ergebnis_a ?? null;
  const gegenErgebnis = partie?.ergebnis_b ?? null;
  const [a, setA] = useState(wert(eigenErgebnis));
  const [b, setB] = useState(wert(gegenErgebnis));
  const zeile = useRef<HTMLTableRowElement>(null);

  // Aenderungen von aussen uebernehmen, solange hier niemand tippt
  useEffect(() => {
    if (zeile.current?.contains(document.activeElement)) return;
    setA(wert(eigenErgebnis));
    setB(wert(gegenErgebnis));
  }, [eigenErgebnis, gegenErgebnis]);

  const zahl = (t: string) => (t.trim() === '' ? null : Number(t));
  // Gespeichert wird erst beim Verlassen der Zeile, nicht beim Wechsel
  // zwischen den beiden Feldern desselben Spiels.
  const uebernehmen = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.relatedTarget && zeile.current?.contains(e.relatedTarget as Node)) return;
    if (zahl(a) === eigenErgebnis && zahl(b) === gegenErgebnis) return;
    props.ergebnisSetzen(zahl(a), zahl(b));
  };

  // Solange die Partie an einem Tisch laeuft, bleibt die Aufstellung stehen
  const festgezurrt = Boolean(partie && (partie.tisch_id || partie.status === 'beendet'));

  const auswahl = (seite: Slot, gewaehlt: string | null, liste: Person[], verborgen: boolean) =>
    verborgen ? (
      // Der Name steht bewusst nicht im Seitenquelltext
      <span className="verdeckt" title="Aufstellung verborgen">{gewaehlt ? 'verdeckt' : 'noch offen'}</span>
    ) : props.bearbeitbar && !festgezurrt ? (
      <select value={gewaehlt ?? ''} onChange={(e) => props.spielerSetzen(seite, e.target.value || null)}>
        <option value="">– offen –</option>
        {/* Doppel: der zweite Platz darf leer bleiben (Geist, z. B. bei ungerader Spielerzahl) */}
        {(seite === 'heim2' || seite === 'gast2') && <option value={GEIST}>– Geist –</option>}
        {(() => {
          const option = (p: Person) => (
            <option key={p.id} value={p.id}>
              {p.anzeigename || personName(p)}
            </option>
          );
          const gruppe = props.kaderGruppe;
          const eigene = seite.startsWith(props.eigeneSeite);
          const imKader = gruppe && eigene ? liste.filter((p) => gruppe.ids.has(p.id)) : [];
          if (!gruppe || imKader.length === 0) return liste.map(option);
          const rest = liste.filter((p) => !gruppe.ids.has(p.id));
          return (
            <>
              <optgroup label={`Kader ${gruppe.name}`}>{imKader.map(option)}</optgroup>
              {rest.length > 0 && <optgroup label="weitere Mitglieder">{rest.map(option)}</optgroup>}
            </>
          );
        })()}
      </select>
    ) : (
      <span>{props.anzeige(gewaehlt) || '–'}</span>
    );

  const fertig = eigenErgebnis !== null && gegenErgebnis !== null;
  // Enter springt ins zweite Feld und speichert dort, wie im Turnier-Spielplan
  const beiTaste = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const felder = zeile.current?.querySelectorAll('input.zahlfeld') ?? [];
    if (e.target === felder[0] && felder[1]) (felder[1] as HTMLInputElement).focus();
    else (e.target as HTMLInputElement).blur();
  };
  return (
    <tr ref={zeile} className={fertig ? 'gespielt' : ''}>
      <td>{spiel.nr}</td>
      <td>
        {DISZIPLIN_KURZ[spiel.disziplin]}
        <small>
          {' '}
          {spiel.disziplin === '14-1' ? `${spiel.ziel} Pkt. / ${spiel.aufnahmen} Aufn.` : `${spiel.ziel} Gewinnsätze`}
        </small>
      </td>
      {props.doppel ? (
        <>
          <td>
            <span className="doppelseite">
              {auswahl('heim', props.heim, props.heimWahl, props.heimVerdeckt)}
              <span className="und">&amp;</span>
              {auswahl('heim2', props.doppel.heim2, props.doppel.heimWahl2, props.heimVerdeckt)}
            </span>
          </td>
          <td className="doppelpunkt">:</td>
          <td>
            <span className="doppelseite">
              {auswahl('gast', props.gast, props.gastWahl, props.gastVerdeckt)}
              <span className="und">&amp;</span>
              {auswahl('gast2', props.doppel.gast2, props.doppel.gastWahl2, props.gastVerdeckt)}
            </span>
          </td>
        </>
      ) : (
        <>
          <td>{auswahl('heim', props.heim, props.heimWahl, props.heimVerdeckt)}</td>
          <td className="doppelpunkt">:</td>
          <td>{auswahl('gast', props.gast, props.gastWahl, props.gastVerdeckt)}</td>
        </>
      )}
      <td className="rechts">
        {props.bearbeitbar && partie ? (
          <>
            <input
              className="zahlfeld"
              inputMode="numeric"
              value={a}
              onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={uebernehmen}
              onKeyDown={beiTaste}
            />
            {' : '}
            <input
              className="zahlfeld"
              inputMode="numeric"
              value={b}
              onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={uebernehmen}
              onKeyDown={beiTaste}
            />
          </>
        ) : (
          <span>{fertig ? `${eigenErgebnis} : ${gegenErgebnis}` : '–'}</span>
        )}
      </td>
      <td className="rechts">
        {props.laufend && (
          <>
            <span className="livelaeuft" title="Laufender Stand am Tisch. Ins Ergebnis kommt er erst mit „Ergebnis bestätigen“ am Tablet.">
              {props.laufend}
            </span>{' '}
          </>
        )}
        {props.doppel ? (
          <span className="hinweis" title="Doppel gehen nie ins Rating ein">
            Doppel: kein Rating
          </span>
        ) : spiel.disziplin === '14-1' ? (
          <span className="hinweis" title="14.1 wird auf Punkte gespielt und geht nie ins Rating ein">
            14.1: kein Rating
          </span>
        ) : (
          partie &&
          props.bearbeitbar && (
          // Zaehlen muessen Spieltag und Partie. Ist der Spieltag aus, bleibt
          // der Haken gespeichert, wirkt aber erst nach dem Einschalten.
          <label
            className={props.spieltagWertet ? 'ankreuz' : 'ankreuz gesperrt'}
            title={
              props.spieltagWertet
                ? 'Diese Partie fürs Rating werten'
                : 'Zählt erst, wenn oben „Fürs Rating werten“ eingeschaltet ist.'
            }
          >
            <input
              type="checkbox"
              checked={partie.rating_werten}
              disabled={!props.spieltagWertet}
              onChange={(e) => props.wertungSetzen(e.target.checked)}
            />
            {props.spieltagWertet ? 'Rating' : 'Rating (Spieltag aus)'}
          </label>
          )
        )}
        {props.bearbeitbar && props.zuruecksetzen && zuruecksetzbar(partie) && (
          <>
            {' '}
            <button
              type="button"
              className="klein"
              title="Stellt die Partie zurück auf offen: Tisch frei, Ergebnis gelöscht, am Tablet wieder in der Spielauswahl. Braucht das Schutzwort."
              onClick={props.zuruecksetzen}
            >
              Zurücksetzen
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
