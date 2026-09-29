// Serverfunktion "kontakt"
//
// Nimmt Nachrichten aus dem Kontaktformular (kontakt.html) an, speichert sie
// in kontakt_nachrichten und leitet sie per Mail weiter. Oeffentlich, ohne
// Anmeldung (verify_jwt aus).
//
// Schutz gegen Massenversand: unsichtbares Feld "webseite" (Spamfalle), je
// Absender hoechstens 3 Nachrichten pro Stunde, insgesamt 50 pro Tag. Die
// IP-Adresse wird nicht gespeichert, nur ein Hash aus IP und Tag.
//
// Versand ueber SMTP mit SSL (Port 465); Supabase sperrt die Ports 25 und 587.
// Secrets: SMTP_HOST, SMTP_USER, SMTP_PASS, KONTAKT_AN. Fehlen sie, bleibt die
// Nachricht gespeichert und der Grund steht in der Spalte "fehler".
// Nachrichten, die aelter als 90 Tage sind, loescht die Funktion bei jedem Aufruf.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import nodemailer from 'npm:nodemailer@6.9.16';

const KOPFZEILEN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const JE_ABSENDER_STUNDE = 3;
const GESAMT_TAG = 50;
const AUFBEWAHREN_TAGE = 90;

type Anfrage = { name?: string; email?: string; verein?: string; nachricht?: string; webseite?: string };

function antwort(inhalt: unknown, status = 200) {
  return new Response(JSON.stringify(inhalt), { status, headers: KOPFZEILEN });
}

// Zeilenumbrueche und Steuerzeichen raus (Kopfzeilen der Mail)
const einzeilig = (text: string) => text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

async function kennung(ip: string, salz: string) {
  const tag = new Date().toISOString().slice(0, 10);
  const daten = new TextEncoder().encode(`${ip}|${tag}|${salz}`);
  const hash = await crypto.subtle.digest('SHA-256', daten);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (anfrage) => {
  if (anfrage.method === 'OPTIONS') return new Response('ok', { headers: KOPFZEILEN });
  if (anfrage.method !== 'POST') return antwort({ fehler: 'Nur POST' }, 405);

  let daten: Anfrage;
  try {
    daten = await anfrage.json();
  } catch {
    return antwort({ fehler: 'Ungültige Anfrage.' }, 400);
  }

  // Spamfalle: Menschen sehen das Feld nicht und lassen es leer
  if (daten.webseite) return antwort({ stand: 'angekommen' });

  const name = einzeilig(daten.name ?? '');
  const email = einzeilig(daten.email ?? '').toLowerCase();
  const verein = einzeilig(daten.verein ?? '');
  const nachricht = (daten.nachricht ?? '').trim();
  if (!name || name.length > 100) return antwort({ fehler: 'Bitte deinen Namen angeben (höchstens 100 Zeichen).' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return antwort({ fehler: 'Bitte eine gültige E-Mail-Adresse angeben.' }, 400);
  }
  if (verein.length > 100) return antwort({ fehler: 'Der Vereinsname ist zu lang (höchstens 100 Zeichen).' }, 400);
  if (!nachricht || nachricht.length > 5000) {
    return antwort({ fehler: 'Bitte eine Nachricht schreiben (höchstens 5000 Zeichen).' }, 400);
  }

  const dienst = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const ip = (anfrage.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unbekannt';
  const absender = await kennung(ip, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(-16));

  // Alte Nachrichten loeschen
  const grenze = new Date(Date.now() - AUFBEWAHREN_TAGE * 86400000).toISOString();
  await dienst.from('kontakt_nachrichten').delete().lt('eingegangen_am', grenze);

  // Sperre gegen Massenversand
  const vorStunde = new Date(Date.now() - 3600000).toISOString();
  const vorTag = new Date(Date.now() - 86400000).toISOString();
  const [eigene, alle] = await Promise.all([
    dienst
      .from('kontakt_nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('absender_kennung', absender)
      .gte('eingegangen_am', vorStunde),
    dienst.from('kontakt_nachrichten').select('id', { count: 'exact', head: true }).gte('eingegangen_am', vorTag)
  ]);
  if ((eigene.count ?? 0) >= JE_ABSENDER_STUNDE || (alle.count ?? 0) >= GESAMT_TAG) {
    return antwort(
      { fehler: 'Gerade kommen zu viele Nachrichten an. Bitte versuch es später noch einmal oder schreib direkt eine E-Mail.' },
      429
    );
  }

  const { data: zeile, error: speicherFehler } = await dienst
    .from('kontakt_nachrichten')
    .insert({ name, email, verein: verein || null, nachricht, absender_kennung: absender })
    .select('id, eingegangen_am')
    .single();
  if (speicherFehler || !zeile) return antwort({ fehler: 'Die Nachricht konnte nicht gespeichert werden.' }, 500);

  // Weiterleiten per Mail; ein Fehler hier geht nicht an den Absender, die
  // Nachricht ist gespeichert
  const host = Deno.env.get('SMTP_HOST');
  const benutzer = Deno.env.get('SMTP_USER');
  const passwort = Deno.env.get('SMTP_PASS');
  const an = Deno.env.get('KONTAKT_AN');
  let fehler: string | null = null;
  if (!host || !benutzer || !passwort || !an) {
    fehler = 'Secrets für den Mailversand fehlen (SMTP_HOST, SMTP_USER, SMTP_PASS, KONTAKT_AN).';
  } else {
    try {
      const versand = nodemailer.createTransport({ host, port: 465, secure: true, auth: { user: benutzer, pass: passwort } });
      const eingegangen = new Date(zeile.eingegangen_am).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
      await versand.sendMail({
        from: { name: 'CueDesk', address: benutzer },
        to: an,
        replyTo: { name, address: email },
        subject: `CueDesk-Kontakt: ${name}`,
        text: [
          `Name: ${name}`,
          `E-Mail: ${email}`,
          `Verein: ${verein || '–'}`,
          `Eingegangen: ${eingegangen}`,
          '',
          nachricht,
          '',
          '--',
          'Gesendet über das Kontaktformular von CueDesk. „Antworten“ geht direkt an den Absender.'
        ].join('\n')
      });
    } catch (e) {
      fehler = `Versand fehlgeschlagen: ${(e as Error).message}`.slice(0, 500);
    }
  }
  await dienst
    .from('kontakt_nachrichten')
    .update(fehler ? { fehler } : { versendet_am: new Date().toISOString() })
    .eq('id', zeile.id);

  return antwort({ stand: 'angekommen' });
});
