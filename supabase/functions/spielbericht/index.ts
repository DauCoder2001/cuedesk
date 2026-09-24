// Serverfunktion "spielbericht"
//
// Holt eine oeffentliche Berichtsseite des Verbands und gibt ihren Inhalt
// zurueck. Der Browser darf fremde Seiten nicht selbst lesen (CORS), deshalb
// dieser Umweg. Gesendet wird dabei nichts ausser der Adresse, die der
// Turnierleiter eingibt; ausgewertet wird der Text erst in CueDesk.
//
// Erlaubt sind nur die Seiten des Landesverbands und der DBU. Aufrufen darf
// die Funktion jeder angemeldete Benutzer.

const KOPFZEILEN = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Nur diese Hosts, damit die Funktion nicht als offener Umweg ins Netz dient.
const ERLAUBT = ['billard-niedersachsen.de', 'www.billard-niedersachsen.de', 'billard-union.net', 'www.billard-union.net'];

function antwort(inhalt: unknown, status = 200) {
  return new Response(JSON.stringify(inhalt), { status, headers: KOPFZEILEN });
}

Deno.serve(async (anfrage) => {
  if (anfrage.method === 'OPTIONS') return new Response('ok', { headers: KOPFZEILEN });
  if (anfrage.method !== 'POST') return antwort({ fehler: 'Nur POST' }, 405);

  let daten: { url?: string } = {};
  try {
    daten = await anfrage.json();
  } catch {
    return antwort({ fehler: 'Keine Adresse übergeben' }, 400);
  }

  let ziel: URL;
  try {
    ziel = new URL(String(daten.url ?? ''));
  } catch {
    return antwort({ fehler: 'Das ist keine gültige Adresse.' }, 400);
  }
  if (ziel.protocol !== 'https:' || !ERLAUBT.includes(ziel.hostname)) {
    return antwort({ fehler: 'Nur Seiten des Landesverbands (billard-niedersachsen.de) können gelesen werden.' }, 400);
  }

  try {
    const seite = await fetch(ziel.toString(), {
      headers: { 'User-Agent': 'CueDesk Spielbericht-Import', 'Accept-Language': 'de' },
      redirect: 'follow'
    });
    if (!seite.ok) return antwort({ fehler: `Der Verband antwortet mit ${seite.status}.` }, 502);
    const html = await seite.text();
    if (html.length > 2_000_000) return antwort({ fehler: 'Die Seite ist unerwartet groß.' }, 502);
    return antwort({ html });
  } catch (fehler) {
    return antwort({ fehler: `Die Seite ist nicht erreichbar: ${fehler}` }, 502);
  }
});
