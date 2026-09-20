// Serverfunktion "einladung"
//
// Legt eine Einladung an und verschickt die Einladungsmail. Der Mailversand
// braucht den Dienstschluessel, deshalb laeuft er hier und nicht im Browser.
//
// Ablauf:
//  1. Aufrufer aus dem mitgeschickten Anmeldezeichen ermitteln.
//  2. Recht pruefen (darf_einladen im betreffenden Verein).
//  3. Wer nicht Vereins-Administrator ist, darf nur die Rolle "mitglied" vergeben.
//  4. Auf Wunsch eine neue Person anlegen.
//  5. Einladung eintragen (die Rechte der Datenbank greifen dabei weiter).
//  6. Mail verschicken. Gibt es das Konto schon, hat die Datenbank die Rollen
//     bereits zugeordnet; dann wird nur das gemeldet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const KOPFZEILEN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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
  if (!darf) return antwort({ fehler: 'Keine Berechtigung zum Einladen' }, 403);

  const { data: istAdmin } = await alsBenutzer.rpc('hat_rolle', {
    p_verein: daten.verein_id,
    p_rollen: ['vereinsadmin']
  });

  const gewuenschte = daten.rollen?.length ? daten.rollen : ['mitglied'];
  const rollen = istAdmin ? gewuenschte : ['mitglied'];

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
    const bereitsVorhanden =
      mailFehler.message.toLowerCase().includes('already') ||
      mailFehler.message.toLowerCase().includes('registered');
    if (bereitsVorhanden) {
      return antwort({
        stand: 'konto_vorhanden',
        meldung: 'Zu dieser Adresse gibt es bereits ein Konto. Rollen und Person sind zugeordnet.'
      });
    }
    return antwort({ fehler: mailFehler.message }, 400);
  }

  return antwort({ stand: 'verschickt', meldung: 'Einladung verschickt.' });
});
