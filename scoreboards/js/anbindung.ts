// Anbindung der Scoreboards an CueDesk.
//
// Die Scoreboards stammen aus Pool-TS und sprachen dort Firebase an. Diese
// Datei bietet ihnen dieselben Funktionen (ref, set, onValue, push,
// serverTimestamp, signInAnonymously) an, damit der bewaehrte Code fast
// unveraendert bleiben kann. Dahinter steckt eine von zwei Betriebsarten:
//
//   angebunden  - gekoppeltes Tablet (oder angemeldete Turnierleitung):
//                 Live-Stand in Supabase, Spieler aus der Mitgliederliste,
//                 Ergebnisse mit komplettem Protokoll in CueDesk.
//   offline     - ueberall sonst: Stand nur im Browser, Namen als Freitext,
//                 nichts wird gespeichert. Entspricht der alten Offline-Fassung.
//   archiv      - Protokollansicht einer gespeicherten 14.1-Partie
//                 (14.1_Log.html?partie=<id>, aus der 14.1-Statistik). Nur lesen.
//
// Die Betriebsart ergibt sich von selbst. Mit VITE_NUR_OFFLINE=1 gebaut
// (Veroeffentlichung im Repository "scoreboards") ist sie immer offline.

import type { SupabaseClient } from '@supabase/supabase-js';
import { leisteZeigen } from './hinweisleiste';

type Beobachter = (schnappschuss: { val: () => unknown }) => void;
type Verweis = { pfad: string };

export type Betriebsart = 'angebunden' | 'offline' | 'archiv';

type Verbindung = {
  supabase: SupabaseClient;
  vereinId: string;
  tischId: string | null;
  tischNummer: string;
};

let verbindung: Verbindung | null = null;
let betriebsart: Betriebsart = 'offline';
let tischNummer = '1';
let archiv: { supabase: SupabaseClient; partieId: string; datum: string } | null = null;

// ---------- Start: Betriebsart und Tisch bestimmen ----------

function sitzungImBrowser(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const schluessel = localStorage.key(i) ?? '';
      if (schluessel.startsWith('sb-') && schluessel.endsWith('-auth-token')) return true;
    }
  } catch {
    // Speicher gesperrt - dann offline
  }
  return false;
}

// Muss vor allem anderen einmal aufgerufen werden (Top-Level-await im Scoreboard).
export async function starten(): Promise<{ betriebsart: Betriebsart; tisch: string }> {
  const parameter = new URLSearchParams(window.location.search);
  const roh = parameter.get('table');
  const ausAdresse = roh && /^[1-9]\d*$/.test(roh) ? roh : null;

  // Gespeicherte Partie ansehen: jede angemeldete Person, die sie lesen darf
  const partieId = parameter.get('partie');
  if (partieId && import.meta.env.VITE_NUR_OFFLINE !== '1' && sitzungImBrowser()) {
    try {
      const { supabase } = await import('../../src/supabase');
      const { data: partie } = await supabase
        .from('partien')
        .select('id, datum, tisch_id')
        .eq('id', partieId)
        .maybeSingle();
      if (partie) {
        const { data: tisch } = partie.tisch_id
          ? await supabase.from('tische').select('nummer').eq('id', partie.tisch_id).maybeSingle()
          : { data: null };
        tischNummer = tisch ? String(tisch.nummer) : '–';
        archiv = { supabase, partieId: partie.id, datum: partie.datum };
        betriebsart = 'archiv';
        return { betriebsart, tisch: tischNummer };
      }
    } catch (e) {
      console.warn('Partie nicht lesbar:', e);
    }
  }

  if (import.meta.env.VITE_NUR_OFFLINE !== '1' && sitzungImBrowser()) {
    try {
      const { supabase } = await import('../../src/supabase');
      const { data } = await supabase.auth.getSession();
      const nutzer = data.session?.user;
      if (nutzer) {
        // Gekoppeltes Geraet?
        const { data: geraet } = await supabase
          .from('geraete')
          .select('verein_id, tisch_id')
          .eq('auth_id', nutzer.id)
          .maybeSingle();

        let vereinId: string | null = geraet?.verein_id ?? null;
        if (!vereinId) {
          // Angemeldete Turnierleitung im Browser
          const { data: rollen } = await supabase
            .from('benutzer_rollen')
            .select('verein_id, rolle')
            .eq('benutzer_id', nutzer.id);
          vereinId =
            (rollen ?? []).find((r) => ['vereinsadmin', 'sportwart', 'turnierleiter'].includes(r.rolle))
              ?.verein_id ?? null;
        }

        if (vereinId) {
          let tisch: { id: string; nummer: number } | null = null;
          if (ausAdresse) {
            const { data: t } = await supabase
              .from('tische')
              .select('id, nummer')
              .eq('verein_id', vereinId)
              .eq('nummer', Number(ausAdresse))
              .maybeSingle();
            tisch = t;
          } else if (geraet?.tisch_id) {
            const { data: t } = await supabase
              .from('tische')
              .select('id, nummer')
              .eq('id', geraet.tisch_id)
              .maybeSingle();
            tisch = t;
          }
          tischNummer = tisch ? String(tisch.nummer) : ausAdresse ?? '1';
          verbindung = {
            supabase,
            vereinId,
            tischId: tisch?.id ?? null,
            tischNummer
          };
          betriebsart = 'angebunden';
          if (geraet) {
            geraetKonto = { supabase, authId: nutzer.id };
            kopplungBeobachten();
          }
          return { betriebsart, tisch: tischNummer };
        }

        // Tablet, das beim Oeffnen schon entkoppelt war: laeuft offline weiter,
        // zeigt aber die Leiste und kann neu gekoppelt werden.
        if (nutzer.is_anonymous) {
          geraetKonto = { supabase, authId: nutzer.id };
          kopplung = 'entkoppelt';
          leisteZeigen({ art: 'entkoppelt', code: null, neuKoppeln: () => void neuKoppeln() });
          kopplungBeobachten();
        }
      }
    } catch (e) {
      console.warn('CueDesk nicht erreichbar, Scoreboard laeuft offline:', e);
    }
  }

  betriebsart = 'offline';
  tischNummer = ausAdresse ?? '1';
  return { betriebsart, tisch: tischNummer };
}

export function istAngebunden(): boolean {
  return betriebsart === 'angebunden';
}

// Datum der gespeicherten Partie in der Protokollansicht, sonst null
export function archivDatum(): string | null {
  return archiv ? new Date(`${archiv.datum}T12:00:00`).toLocaleDateString('de-DE') : null;
}

// ---------- Kopplung waehrend des Spiels beobachten ----------
//
// Wird das Tablet entkoppelt oder einem anderen Tisch zugeordnet, waehrend
// ein Scoreboard offen ist, erscheint oben eine Hinweisleiste. Das Spiel
// laeuft in jedem Fall weiter. Geprueft wird alle 30 Sekunden (bei
// angezeigtem Kopplungscode alle 10), beim Zurueckholen in den Vordergrund
// und sofort, wenn das Schreiben des Live-Stands scheitert.

type Kopplung = 'gekoppelt' | 'entkoppelt' | 'andererTisch';
let kopplung: Kopplung = 'gekoppelt';
let geraetKonto: { supabase: SupabaseClient; authId: string } | null = null;
let kopplungsCode: string | null = null;
let pruefungLaeuft = false;

function kopplungBeobachten() {
  const takt = () => {
    if (document.visibilityState === 'visible') void kopplungPruefen();
    window.setTimeout(takt, kopplungsCode ? 10000 : 30000);
  };
  window.setTimeout(takt, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void kopplungPruefen();
  });
}

// Laeuft am Tisch gerade ein Spiel? Dann gibt es keinen Knopf zum Tischwechsel.
function spielLaeuft(): boolean {
  const z = letzterWert.get(`tables/${tischNummer}`) as Record<string, unknown> | null | undefined;
  if (!z || z.locked) return false;
  const zahl = (w: unknown) => (typeof w === 'number' ? w : 0);
  const log = Array.isArray(z.log) ? z.log.length : 0;
  return zahl(z.s1) !== 0 || zahl(z.s2) !== 0 || zahl(z.score1) !== 0 || zahl(z.score2) !== 0 || log > 0;
}

async function kopplungPruefen(): Promise<void> {
  const konto = geraetKonto;
  if (!konto || pruefungLaeuft) return;
  pruefungLaeuft = true;
  try {
    const { data: g, error } = await konto.supabase
      .from('geraete')
      .select('tisch_id, aktiv')
      .eq('auth_id', konto.authId)
      .maybeSingle();
    if (error) return; // Netz weg: nichts behaupten

    if (!g || !g.aktiv) {
      kopplung = 'entkoppelt';
      leisteZeigen({ art: 'entkoppelt', code: kopplungsCode, neuKoppeln: () => void neuKoppeln() });
      return;
    }

    kopplungsCode = null;
    const v = verbindung;
    if (!v) {
      // Offline gestartet und inzwischen gekoppelt: neu laden verbindet das
      // Scoreboard. Ein laufendes Spiel wird dabei nicht abgebrochen.
      if (!spielLaeuft()) {
        window.location.reload();
        return;
      }
      kopplung = 'gekoppelt';
      leisteZeigen({ art: 'wiederGekoppelt', neuLaden: () => window.location.reload() });
      return;
    }
    if ((g.tisch_id ?? null) === v.tischId) {
      kopplung = 'gekoppelt';
      leisteZeigen({ art: 'keine' });
      return;
    }

    kopplung = 'andererTisch';
    const { data: t } = g.tisch_id
      ? await v.supabase.from('tische').select('nummer').eq('id', g.tisch_id).maybeSingle()
      : { data: null };
    const neu = t ? String(t.nummer) : null;
    leisteZeigen({
      art: 'andererTisch',
      neu,
      alt: v.tischNummer,
      wechseln:
        neu && !spielLaeuft()
          ? () => window.location.replace(`${window.location.pathname}?table=${neu}`)
          : null
    });
  } finally {
    pruefungLaeuft = false;
  }
}

async function neuKoppeln() {
  const konto = geraetKonto;
  if (!konto) return;
  const { data, error } = await konto.supabase.rpc('kopplung_anfordern');
  if (error || !data) {
    window.alert('Kein Kopplungscode erhalten: ' + (error?.message ?? 'unbekannt'));
    return;
  }
  kopplungsCode = data as string;
  leisteZeigen({ art: 'entkoppelt', code: kopplungsCode, neuKoppeln: () => void neuKoppeln() });
}

// Vor dem Speichern: ist das Tablet noch gekoppelt?
async function nichtGekoppelt(ergebnis: string): Promise<string | null> {
  if (!geraetKonto) return null;
  await kopplungPruefen();
  if (kopplung !== 'entkoppelt') return null;
  return (
    'Das Tablet ist nicht mehr mit CueDesk verbunden. Bitte das Ergebnis notieren (' +
    ergebnis +
    ') oder das Tablet neu koppeln und danach noch einmal auf „Neues Spiel“ tippen.'
  );
}

// Wohin "Startseite" fuehrt
export function startseite(): string {
  if (istAngebunden()) return new URL('../?geraet', window.location.href).toString();
  return new URL('./index.html', window.location.href).toString();
}

// ---------- Firebase-kompatible Funktionen ----------

export const db = {};
export const auth = {};

export function ref(_db: unknown, pfad: string): Verweis {
  return { pfad };
}

export function serverTimestamp(): number {
  return Date.now();
}

export async function signInAnonymously(): Promise<void> {
  // Die Anmeldung erledigt CueDesk beim Koppeln des Tablets.
}

const beobachter = new Map<string, Set<Beobachter>>();
const letzterWert = new Map<string, unknown>();
let eigenerBesitzer: string | null = null;

function melden(pfad: string, wert: unknown) {
  letzterWert.set(pfad, wert);
  const kopie = wert === null || wert === undefined ? null : structuredClone(wert);
  (beobachter.get(pfad) ?? new Set()).forEach((cb) => cb({ val: () => kopie }));
}

function tischAusPfad(pfad: string): string | null {
  const treffer = /^tables\/(\d+)$/.exec(pfad);
  return treffer ? treffer[1] : null;
}

const speicherSchluessel = (tisch: string) => `cuedesk-scoreboard-tisch-${tisch}`;

// Schreiben wird gebuendelt: Bei schnellen Eingaben geht nur der letzte Stand raus.
let schreibZeitgeber: number | null = null;
let offenerWert: unknown = undefined;

export async function set(verweis: Verweis, wert: unknown): Promise<void> {
  const tisch = tischAusPfad(verweis.pfad);
  if (!tisch) return;

  // Wie bei Firebase: die eigene Aenderung sofort an die eigenen Beobachter.
  melden(verweis.pfad, wert);

  if (!istAngebunden()) {
    try {
      if (wert === null) localStorage.removeItem(speicherSchluessel(tisch));
      else localStorage.setItem(speicherSchluessel(tisch), JSON.stringify(wert));
    } catch {
      // Speicher voll oder gesperrt - Spiel laeuft trotzdem weiter
    }
    return;
  }

  const besitzer = (wert as { owner?: string } | null)?.owner ?? null;
  if (besitzer) eigenerBesitzer = besitzer;
  offenerWert = wert;
  if (schreibZeitgeber !== null) window.clearTimeout(schreibZeitgeber);
  schreibZeitgeber = window.setTimeout(() => void wegschreiben(), 150);
}

async function wegschreiben() {
  schreibZeitgeber = null;
  const v = verbindung;
  if (!v || !v.tischId) return;
  const wert = offenerWert;
  if (wert === null) {
    await v.supabase.from('live_stand').delete().eq('tisch_id', v.tischId);
    return;
  }
  const { error } = await v.supabase.from('live_stand').upsert({
    tisch_id: v.tischId,
    verein_id: v.vereinId,
    zustand: wert,
    besitzer: (wert as { owner?: string }).owner ?? null,
    aktualisiert: new Date().toISOString()
  });
  if (error) {
    console.error('Live-Stand nicht gespeichert:', error.message);
    void kopplungPruefen();
  }
}

export function onValue(verweis: Verweis, cb: Beobachter): () => void {
  const liste = beobachter.get(verweis.pfad) ?? new Set<Beobachter>();
  liste.add(cb);
  beobachter.set(verweis.pfad, liste);

  // Turnierstatus: bis die CueDesk-Turniere angebunden sind, laeuft keins.
  if (verweis.pfad === 'tournament/active') {
    queueMicrotask(() => cb({ val: () => null }));
    return () => liste.delete(cb);
  }

  const tisch = tischAusPfad(verweis.pfad);
  if (!tisch) return () => liste.delete(cb);

  if (archiv) {
    void archivZustand(archiv).then((wert) => melden(verweis.pfad, wert));
    return () => liste.delete(cb);
  }

  if (!istAngebunden()) {
    let gespeichert: unknown = null;
    try {
      const roh = localStorage.getItem(speicherSchluessel(tisch));
      gespeichert = roh ? JSON.parse(roh) : null;
    } catch {
      gespeichert = null;
    }
    queueMicrotask(() => melden(verweis.pfad, gespeichert));
    return () => liste.delete(cb);
  }

  void liveBeobachten(verweis.pfad);
  return () => liste.delete(cb);
}

async function liveBeobachten(pfad: string) {
  const v = verbindung;
  if (!v) return;
  if (!v.tischId) {
    melden(pfad, null);
    return;
  }

  const { data } = await v.supabase
    .from('live_stand')
    .select('zustand')
    .eq('tisch_id', v.tischId)
    .maybeSingle();
  melden(pfad, data?.zustand ?? null);

  v.supabase
    .channel(`live-${v.tischId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_stand', filter: `tisch_id=eq.${v.tischId}` },
      (ereignis) => {
        if (ereignis.eventType === 'DELETE') {
          melden(pfad, null);
          return;
        }
        const neu = ereignis.new as { zustand: unknown; besitzer: string | null };
        // Das eigene Echo nicht noch einmal anwenden - sonst koennte ein
        // verspaetetes Echo einen neueren Stand ueberschreiben.
        if (neu.besitzer && neu.besitzer === eigenerBesitzer) return;
        melden(pfad, neu.zustand);
      }
    )
    .subscribe();
}

// Stand einer gespeicherten 14.1-Partie in der Form, die das Scoreboard
// schreibt - so zeigt 14.1_Log.html sie unveraendert an.
async function archivZustand(a: NonNullable<typeof archiv>): Promise<unknown> {
  const [partieAntwort, zusatzAntwort, aufnahmenAntwort] = await Promise.all([
    a.supabase
      .from('partien')
      .select('spieler_a, spieler_b, ergebnis_a, ergebnis_b, begonnen, beendet')
      .eq('id', a.partieId)
      .single(),
    a.supabase.from('partien_141').select('*').eq('partie_id', a.partieId).maybeSingle(),
    a.supabase
      .from('aufnahmen_141')
      .select('lfd_nr, spieler, baelle, punkte, gesamt, art, markierung, rack_segmente, rack_nr, zeitpunkt')
      .eq('partie_id', a.partieId)
      .order('lfd_nr')
  ]);
  const p = partieAntwort.data;
  if (!p) return null;
  const zusatz = zusatzAntwort.data;

  const { data: personen } = await a.supabase
    .from('personen')
    .select('id, vorname, nachname, anzeigename')
    .in('id', [p.spieler_a, p.spieler_b]);
  const name = (id: string) => {
    const x = (personen ?? []).find((q) => q.id === id);
    return x ? x.anzeigename || `${x.vorname} ${x.nachname}`.trim() : '?';
  };

  return {
    gameType: '14.1',
    player1: name(p.spieler_a),
    player2: name(p.spieler_b),
    s1: p.ergebnis_a ?? 0,
    s2: p.ergebnis_b ?? 0,
    high1: zusatz?.hoechstserie_a ?? 0,
    high2: zusatz?.hoechstserie_b ?? 0,
    inn1: zusatz?.aufnahmen_a ?? 0,
    inn2: zusatz?.aufnahmen_b ?? 0,
    target: zusatz?.ziel_punkte ?? 0,
    targetInn: zusatz?.ziel_aufnahmen ?? 0,
    locked: true,
    startedAt: p.begonnen ? Date.parse(p.begonnen) : null,
    endedAt: p.beendet ? Date.parse(p.beendet) : null,
    log: protokollAusAufnahmen((aufnahmenAntwort.data ?? []) as AufnahmeZeile[], p.spieler_a)
  };
}

// Ergebnisse gehen nicht mehr ueber "push", sondern ueber ergebnisSpeichern141
// und ergebnisSpeichernPool. Firebase lieferte bei push sofort einen Schluessel
// (.key); der Turniermodus nutzt das. Bis die CueDesk-Turniere angebunden sind,
// wird dieser Weg nicht erreicht.
export function push(verweis: Verweis): { key: string; then: (weiter: () => void) => Promise<void> } {
  console.warn('push() auf', verweis.pfad, 'wird in CueDesk nicht mehr verwendet.');
  return { key: crypto.randomUUID(), then: (weiter) => Promise.resolve().then(weiter) };
}

// Turniermodus (Spielplan, Transaktionen): kommt mit den CueDesk-Turnieren.
export function runTransaction(): Promise<{ committed: boolean; snapshot: { val: () => null } }> {
  return Promise.resolve({ committed: false, snapshot: { val: () => null } });
}
export function update(): Promise<void> {
  return Promise.resolve();
}

// Lesen auf Abruf. Genutzt wird es fuer die Ergebnisliste am Tisch ("results").
export async function get(verweis: Verweis): Promise<{ val: () => unknown }> {
  if (verweis.pfad !== 'results' || !verbindung?.tischId) return { val: () => null };
  const v = verbindung;

  const { data } = await v.supabase
    .from('partien')
    .select('id, disziplin, ergebnis_a, ergebnis_b, beendet, spieler_a, spieler_b')
    .eq('tisch_id', v.tischId)
    .in('status', ['beendet', 'abgebrochen'])
    .order('beendet', { ascending: false })
    .limit(10);

  const ids = [...new Set((data ?? []).flatMap((p) => [p.spieler_a, p.spieler_b]))];
  const { data: personen } = ids.length
    ? await v.supabase.from('personen').select('id, vorname, nachname, anzeigename').in('id', ids)
    : { data: [] };
  const name = (id: string) => {
    const p = (personen ?? []).find((x) => x.id === id);
    return p ? p.anzeigename || `${p.vorname} ${p.nachname}`.trim() : '?';
  };

  // Form wie frueher im Firebase-Archiv, damit das Scoreboard unveraendert anzeigt
  const ergebnis: Record<string, unknown> = {};
  (data ?? []).forEach((p) => {
    const zeit = p.beendet ? new Date(p.beendet) : new Date();
    ergebnis[p.id] = {
      table: tischNummer,
      gameType: p.disziplin === '14-1' ? '14.1' : 'pool',
      player1: name(p.spieler_a),
      player2: name(p.spieler_b),
      score1: p.ergebnis_a,
      score2: p.ergebnis_b,
      date: zeit.toLocaleDateString('de-DE'),
      timestamp: zeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      serverTimestamp: zeit.getTime()
    };
  });
  return { val: () => ergebnis };
}

// ---------- Spieler waehlen ----------

export type Spieler = { id: string; name: string };

// Liefert eine Person aus der Mitgliederliste oder einen neu angelegten Gast.
// Offline gibt es keine Liste; dann entscheidet das Scoreboard selbst (Freitext).
export async function spielerWaehlen(titel: string, vorgabe = ''): Promise<Spieler | null> {
  const v = verbindung;
  if (!v) return null;
  if (geraetKonto) {
    await kopplungPruefen();
    if (kopplung === 'entkoppelt') {
      window.alert('Das Tablet ist nicht mehr mit CueDesk verbunden. Die Mitgliederliste ist erst nach einer neuen Kopplung wieder erreichbar.');
      return null;
    }
  }

  const { data } = await v.supabase
    .from('personen')
    .select('id, vorname, nachname, anzeigename, status')
    .eq('verein_id', v.vereinId)
    .neq('status', 'ausgetreten')
    .order('nachname');

  const personen = (data ?? [])
    .map((p) => ({
      id: p.id as string,
      name: (p.anzeigename as string | null) || `${p.vorname} ${p.nachname}`.trim(),
      gast: p.status === 'gast'
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));

  const { spielerDialog } = await import('./spieler-dialog');
  const wahl = await spielerDialog(titel, personen, vorgabe);
  if (!wahl) return null;
  if (wahl.id) return { id: wahl.id, name: wahl.name };

  // Neuer Gast
  const teile = wahl.name.trim().split(/\s+/);
  const nachname = teile.length > 1 ? teile.pop()! : '';
  const { data: neu, error } = await v.supabase
    .from('personen')
    .insert({
      verein_id: v.vereinId,
      vorname: teile.join(' '),
      nachname,
      anzeigename: wahl.name.trim(),
      status: 'gast'
    })
    .select('id')
    .single();
  if (error || !neu) {
    window.alert('Gast konnte nicht angelegt werden: ' + (error?.message ?? 'unbekannt'));
    return null;
  }
  return { id: neu.id as string, name: wahl.name.trim() };
}

// ---------- Ergebnis Pool speichern ----------

export type PoolDisziplin = '8-ball' | '9-ball' | '10-ball';

// Das Pool-Scoreboard kennt nur "8/9/10-Ball". Fuer die Statistik muss CueDesk
// wissen, was gespielt wurde; gefragt wird einmal, die Wahl bleibt im Stand.
export async function disziplinWaehlen(vorgabe?: string | null): Promise<PoolDisziplin | null> {
  const { disziplinDialog } = await import('./spieler-dialog');
  return disziplinDialog(vorgabe as PoolDisziplin | null | undefined);
}

type ZustandPool = {
  player1: string;
  player2: string;
  player1Id?: string | null;
  player2Id?: string | null;
  score1: number;
  score2: number;
  raceTo?: number;
  startedAt?: number | null;
};

export async function ergebnisSpeichernPool(
  zustand: ZustandPool,
  optionen: { abgebrochen: boolean; disziplin: PoolDisziplin }
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const v = verbindung;
  if (!v) return { ok: false, fehler: 'Nicht mit CueDesk verbunden.' };
  if (!zustand.player1Id || !zustand.player2Id) {
    return { ok: false, fehler: 'Beide Spieler müssen aus der Liste gewählt sein.' };
  }
  const getrennt = await nichtGekoppelt(`${zustand.score1} : ${zustand.score2}`);
  if (getrennt) return { ok: false, fehler: getrennt };
  const jetzt = Date.now();
  const { error } = await v.supabase.from('partien').insert({
    verein_id: v.vereinId,
    turnier_id: null,
    disziplin: optionen.disziplin,
    datum: new Date(jetzt).toISOString().slice(0, 10),
    tisch_id: v.tischId,
    spieler_a: zustand.player1Id,
    spieler_b: zustand.player2Id,
    race_to: zustand.raceTo && zustand.raceTo > 0 ? zustand.raceTo : null,
    ergebnis_a: zustand.score1,
    ergebnis_b: zustand.score2,
    status: optionen.abgebrochen ? 'abgebrochen' : 'beendet',
    rating_werten: false, // Einzelspiele zaehlen nie fuer das Rating
    begonnen: zustand.startedAt ? new Date(zustand.startedAt).toISOString() : null,
    beendet: new Date(jetzt).toISOString()
  });
  if (error) return { ok: false, fehler: error.message };
  return { ok: true };
}

// ---------- Ergebnis 14.1 speichern ----------

export { aufnahmenAusProtokoll } from './protokoll-141';
import { aufnahmenAusProtokoll, protokollAusAufnahmen } from './protokoll-141';
import type { AufnahmeZeile, Zustand141 } from './protokoll-141';

export async function ergebnisSpeichern141(
  zustand: Zustand141,
  optionen: { abgebrochen: boolean }
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const v = verbindung;
  if (!v) return { ok: false, fehler: 'Nicht mit CueDesk verbunden.' };
  if (!zustand.player1Id || !zustand.player2Id) {
    return { ok: false, fehler: 'Beide Spieler müssen aus der Liste gewählt sein.' };
  }
  const getrennt = await nichtGekoppelt(`${zustand.s1} : ${zustand.s2}`);
  if (getrennt) return { ok: false, fehler: getrennt };

  const heute = new Date().toISOString().slice(0, 10);
  const dauer = zustand.startedAt
    ? Math.max(0, Math.round(((zustand.endedAt ?? Date.now()) - zustand.startedAt) / 1000))
    : null;

  const { data: partie, error: fehlerPartie } = await v.supabase
    .from('partien')
    .insert({
      verein_id: v.vereinId,
      turnier_id: null,
      disziplin: '14-1',
      datum: heute,
      tisch_id: v.tischId,
      spieler_a: zustand.player1Id,
      spieler_b: zustand.player2Id,
      race_to: zustand.target > 0 ? zustand.target : null,
      ergebnis_a: zustand.s1,
      ergebnis_b: zustand.s2,
      status: optionen.abgebrochen ? 'abgebrochen' : 'beendet',
      rating_werten: false,
      begonnen: zustand.startedAt ? new Date(zustand.startedAt).toISOString() : null,
      beendet: new Date(zustand.endedAt ?? Date.now()).toISOString()
    })
    .select('id')
    .single();
  if (fehlerPartie || !partie) return { ok: false, fehler: fehlerPartie?.message ?? 'Partie nicht gespeichert.' };

  const { error: fehler141 } = await v.supabase.from('partien_141').insert({
    partie_id: partie.id,
    verein_id: v.vereinId,
    ziel_punkte: zustand.target,
    ziel_aufnahmen: zustand.targetInn,
    aufnahmen_a: zustand.inn1,
    aufnahmen_b: zustand.inn2,
    hoechstserie_a: zustand.high1,
    hoechstserie_b: zustand.high2,
    dauer_sek: dauer
  });
  if (fehler141) return { ok: false, fehler: fehler141.message };

  const zeilen = aufnahmenAusProtokoll(zustand.log, zustand.player1Id, zustand.player2Id).map((z) => ({
    ...z,
    partie_id: partie.id,
    verein_id: v.vereinId
  }));
  if (zeilen.length > 0) {
    const { error } = await v.supabase.from('aufnahmen_141').insert(zeilen);
    if (error) return { ok: false, fehler: error.message };
  }
  return { ok: true };
}
