// Kontaktformular (kontakt.html): prueft die Pflichtfelder und schickt die
// Nachricht an die Serverfunktion "kontakt". Ohne Anmeldung, ohne supabase-js;
// der oeffentliche Schluessel reicht, die Funktion prueft selbst.

const formular = document.querySelector<HTMLFormElement>('#kontakt');
const rueckmeldung = document.querySelector<HTMLParagraphElement>('#rueckmeldung');

function melden(text: string, art: 'fehler' | 'meldung' | 'hinweis') {
  if (!rueckmeldung) return;
  rueckmeldung.textContent = text;
  rueckmeldung.className = art;
}

formular?.addEventListener('submit', async (ereignis) => {
  ereignis.preventDefault();
  // Pflichtfelder rot markieren, erst nach dem ersten Versuch
  formular.classList.add('versucht');
  if (!formular.checkValidity()) {
    melden('Bitte die markierten Felder ausfüllen.', 'fehler');
    formular.querySelector<HTMLElement>(':invalid')?.focus();
    return;
  }

  const felder = new FormData(formular);
  const daten = Object.fromEntries(['name', 'email', 'verein', 'nachricht', 'webseite'].map((k) => [k, String(felder.get(k) ?? '')]));
  const knopf = formular.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (knopf) knopf.disabled = true;
  melden('Wird gesendet …', 'hinweis');

  try {
    const antwort = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kontakt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_KEY },
      body: JSON.stringify(daten)
    });
    const inhalt = (await antwort.json().catch(() => ({}))) as { fehler?: string };
    if (!antwort.ok) {
      melden(inhalt.fehler ?? 'Die Nachricht konnte nicht gesendet werden. Bitte schreib direkt eine E-Mail.', 'fehler');
      if (knopf) knopf.disabled = false;
      return;
    }
    formular.reset();
    formular.classList.remove('versucht');
    melden('Danke, deine Nachricht ist angekommen. Wir melden uns so schnell wie möglich.', 'meldung');
    if (knopf) knopf.disabled = false;
  } catch {
    melden('Keine Verbindung. Bitte später noch einmal versuchen oder direkt eine E-Mail schreiben.', 'fehler');
    if (knopf) knopf.disabled = false;
  }
});
