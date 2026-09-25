// Serverfunktion "einladung"
//
// Legt eine Einladung an und verschickt die Einladungsmail. Der Mailversand
// braucht den Dienstschluessel, deshalb laeuft er hier und nicht im Browser.
//
// Die Plattformpruefung (verify_jwt) ist ausgeschaltet, weil der Browser die
// Vorabfrage (OPTIONS) ohne Anmeldezeichen schickt und sie sonst abgewiesen
// wird. Die Funktion prueft das Anmeldezeichen selbst: ohne gueltiges Konto
// und ohne Einladungsrecht passiert nichts.
//
// Wer nicht Vereins-Administrator ist, darf nur die Rolle "mitglied" vergeben.
// Ausnahme: Ein Super-Admin ohne Rolle im Verein setzt dessen
// Vereins-Administrator ein - und nur diesen (docs/Mandanten.md, Phase 1).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const KOPFZEILEN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

type Anfrage = {
  verein_id: string;
  email: string;
  rollen?: string[];
  person_id?: string | null;
  neue_person?: { vorname: string; nachname: string; kuerzel?: string | null } | null;
  weiterleitung?: string;
};

function antwort(inhalt: unknown, status = 200) {
  return new Response(JSON.stringify(inhalt), { status, headers: KOPFZEILEN });
}

Deno.serve(async (anfrage) => {
  if (anfrage.method === 'OPTIONS') return new Response('ok', { headers: KOPFZEILEN });
  if (anfrage.method !== 'POST') return antwort({ fehler: 'Nur POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonSchluessel = Deno.env.get('SUPABASE_ANON_KEY')!;
  const dienstSchluessel = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anmeldung = anfrage.headers.get('Authorization');
  if (!anmeldung) return antwort({ fehler: 'Nicht angemeldet' }, 401);

  let daten: Anfrage;
  try {
    daten = await anfrage.json();
  } catch {
    return antwort({ fehler: 'Ungueltige Anfrage' }, 400);
  }

  const email = (daten.email ?? '').trim().toLowerCase();
  if (!email.includes('@') || !daten.verein_id) {
    return antwort({ fehler: 'E-Mail-Adresse und Verein sind noetig' }, 400);
  }

  const alsBenutzer = createClient(url, anonSchluessel, {
    global: { headers: { Authorization: anmeldung } }
  });

  const { data: konto } = await alsBenutzer.auth.getUser();
  if (!konto?.user) return antwort({ fehler: 'Nicht angemeldet' }, 401);

  const { data: darf } = await alsBenutzer.rpc('darf_einladen', { p_verein: daten.verein_id });
  const { data: istSuperAdmin } = await alsBenutzer.rpc('ist_systemadmin');
  if (!darf && !istSuperAdmin) return antwort({ fehler: 'Keine Berechtigung zum Einladen' }, 403);
  const alsSuperAdmin = !darf && istSuperAdmin === true;
  if (alsSuperAdmin && (daten.neue_person || daten.person_id)) {
    return antwort({ fehler: 'Spieler ordnet der Verein selbst zu, nicht der Super-Admin.' }, 400);
  }

  const { data: istAdmin } = await alsBenutzer.rpc('hat_rolle', {
    p_verein: daten.verein_id,
    p_rollen: ['vereinsadmin']
  });

  const gewuenschte = daten.rollen?.length ? daten.rollen : ['mitglied'];
  const rollen = istAdmin ? gewuenschte : alsSuperAdmin ? ['vereinsadmin'] : ['mitglied'];

  let personId = daten.person_id ?? null;
  if (!personId && daten.neue_person) {
    const { data: person, error: personFehler } = await alsBenutzer
      .from('personen')
      .insert({
        verein_id: daten.verein_id,
        vorname: daten.neue_person.vorname,
        nachname: daten.neue_person.nachname,
        kuerzel: daten.neue_person.kuerzel ?? null
      })
      .select('id')
      .single();
    if (personFehler) return antwort({ fehler: personFehler.message }, 400);
    personId = person.id;
  }

  const { error: einladungsFehler } = await alsBenutzer
    .from('einladungen')
    .insert({ verein_id: daten.verein_id, email, rollen, person_id: personId });

  if (einladungsFehler && !einladungsFehler.message.includes('duplicate key')) {
    return antwort({ fehler: einladungsFehler.message }, 400);
  }

  const alsDienst = createClient(url, dienstSchluessel);
  const { error: mailFehler } = await alsDienst.auth.admin.inviteUserByEmail(email, {
    redirectTo: daten.weiterleitung
  });

  if (mailFehler) {
    const text = mailFehler.message.toLowerCase();
    if (text.includes('already') || text.includes('registered')) {
      return antwort({
        stand: 'konto_vorhanden',
        meldung: 'Zu dieser Adresse gibt es bereits ein Konto. Rollen und Person sind zugeordnet.'
      });
    }
    return antwort({ fehler: mailFehler.message }, 400);
  }

  return antwort({ stand: 'verschickt', meldung: 'Einladung verschickt.' });
});
