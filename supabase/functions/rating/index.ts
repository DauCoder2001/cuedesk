// Serverfunktion "rating"
//
// Rechnet das Vereins-Rating und schreibt eine Momentaufnahme in rating_stand.
// Aufgerufen wird sie von der Oberflaeche ("Jetzt neu berechnen"), nach dem
// Abschluss eines Turniers und einmal nachts ueber einen Zeitplan.
//
// Die Rechenlogik liegt in rating.ts und ist eine Kopie von src/rating.ts.
// Ein Test (test/rating-serverkopie.test.ts) wacht darueber, dass beide
// Dateien gleich bleiben.
//
// Rechte: Vereins-Administrator, Sportwart oder Turnierleiter des Vereins.
// Zeitplaene melden sich stattdessen mit dem Dienstschluessel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { berechnen, GESAMT } from './rating.ts';
import type { RatingPartie } from './rating.ts';

const KOPFZEILEN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// 14.1 wird nicht ueber Racks gerechnet und bleibt deshalb aussen vor.
const DISZIPLINEN = ['8-ball', '9-ball', '10-ball', 'multi-ball'];

function antwort(inhalt: unknown, status = 200) {
  return new Response(JSON.stringify(inhalt), { status, headers: KOPFZEILEN });
}

function heute() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (anfrage) => {
  if (anfrage.method === 'OPTIONS') return new Response('ok', { headers: KOPFZEILEN });
  if (anfrage.method !== 'POST') return antwort({ fehler: 'Nur POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonSchluessel = Deno.env.get('SUPABASE_ANON_KEY')!;
  const dienstSchluessel = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const anmeldung = anfrage.headers.get('Authorization') ?? '';
  const zeichen = anmeldung.replace('Bearer ', '').trim();
  const vomZeitplan = zeichen === dienstSchluessel;

  let daten: { verein_id?: string; stichtag?: string } = {};
  try {
    daten = await anfrage.json();
  } catch {
    daten = {};
  }

  const alsDienst = createClient(url, dienstSchluessel);

  // Welche Vereine? Ein Zeitplan ohne Angabe rechnet alle.
  let vereine: string[] = [];
  if (daten.verein_id) {
    vereine = [daten.verein_id];
  } else if (vomZeitplan) {
    const { data } = await alsDienst.from('vereine').select('id').eq('aktiv', true);
    vereine = (data ?? []).map((zeile: { id: string }) => zeile.id);
  } else {
    return antwort({ fehler: 'Verein fehlt' }, 400);
  }

  // Rechte pruefen, wenn der Aufruf aus der Oberflaeche kommt
  if (!vomZeitplan) {
    if (!anmeldung) return antwort({ fehler: 'Nicht angemeldet' }, 401);
    const alsBenutzer = createClient(url, anonSchluessel, {
      global: { headers: { Authorization: anmeldung } }
    });
    const { data: konto } = await alsBenutzer.auth.getUser();
    if (!konto?.user) return antwort({ fehler: 'Nicht angemeldet' }, 401);
    const { data: darf } = await alsBenutzer.rpc('hat_rolle', {
      p_verein: vereine[0],
      p_rollen: ['vereinsadmin', 'sportwart', 'turnierleiter']
    });
    if (!darf) return antwort({ fehler: 'Keine Berechtigung' }, 403);
  }

  const stichtag = daten.stichtag ?? heute();
  const bericht: Record<string, unknown>[] = [];

  for (const vereinId of vereine) {
    // Einstellungen
    const { data: einst } = await alsDienst
      .from('rating_einstellungen')
      .select('*')
      .eq('verein_id', vereinId)
      .maybeSingle();

    // Gewertete Partien (die Ansicht filtert Einzelspiele und Gaeste heraus)
    const { data: partienRoh, error: fehlerPartien } = await alsDienst
      .from('rating_partien')
      .select('datum, disziplin, spieler_a, spieler_b, racks_a, racks_b')
      .eq('verein_id', vereinId);
    if (fehlerPartien) return antwort({ fehler: fehlerPartien.message }, 400);

    const partien: RatingPartie[] = (partienRoh ?? [])
      .map((p: {
        datum: string;
        disziplin: string;
        spieler_a: string;
        spieler_b: string;
        racks_a: number;
        racks_b: number;
      }) => ({
        datum: p.datum,
        disziplin: p.disziplin,
        a: p.spieler_a,
        b: p.spieler_b,
        wa: p.racks_a,
        wb: p.racks_b
      }))
      .filter((p) => p.wa + p.wb > 0 && p.a !== p.b);

    // Startwerte und ausgeblendete Spieler
    const { data: intern } = await alsDienst
      .from('personen_intern')
      .select('person_id, rating_startwert')
      .eq('verein_id', vereinId)
      .not('rating_startwert', 'is', null);

    const startwerte: Record<string, number> = {};
    (intern ?? []).forEach((zeile: { person_id: string; rating_startwert: number }) => {
      startwerte[zeile.person_id] = zeile.rating_startwert;
    });

    const { data: personen } = await alsDienst
      .from('personen')
      .select('id, status, rating_ausgeblendet')
      .eq('verein_id', vereinId);

    const ausgeblendet = (personen ?? [])
      .filter((p: { rating_ausgeblendet: boolean; status: string }) =>
        p.rating_ausgeblendet || p.status === 'gast'
      )
      .map((p: { id: string }) => p.id);

    const ergebnis = berechnen({
      partien,
      startwerte,
      stichtag,
      disziplinen: DISZIPLINEN,
      ausgeblendet,
      einstellungen: einst
        ? {
            zeitraum: einst.zeitraum_monate,
            mindestRacks: einst.mindest_racks,
            rueckgriff: einst.rueckgriff_monate,
            gewicht: einst.gewicht,
            vereinsschnitt: einst.vereinsschnitt
          }
        : undefined
    });

    // Momentaufnahme schreiben
    const zeilen: Record<string, unknown>[] = [];
    for (const [ansicht, inhalt] of Object.entries(ergebnis.ansichten)) {
      for (const [personId, wert] of Object.entries(inhalt.werte)) {
        zeilen.push({
          verein_id: vereinId,
          stichtag,
          disziplin: ansicht === GESAMT ? 'gesamt' : ansicht,
          person_id: personId,
          wert: wert.rating,
          racks: wert.racks,
          quelle: wert.status
        });
      }
    }

    if (zeilen.length > 0) {
      const { error } = await alsDienst
        .from('rating_stand')
        .upsert(zeilen, { onConflict: 'verein_id,stichtag,disziplin,person_id' });
      if (error) return antwort({ fehler: error.message }, 400);
    }

    bericht.push({
      verein_id: vereinId,
      stichtag,
      partien: partien.length,
      spieler: Object.keys(ergebnis.ansichten[GESAMT].werte).length,
      zeilen: zeilen.length
    });
  }

  return antwort({ stand: 'fertig', stichtag, vereine: bericht });
});
