// Nachricht an die Serverfunktion "kontakt" (supabase/functions/kontakt).
// Genutzt vom Kontaktformular (src/kontakt.ts) und von "Frage stellen" in der
// Hilfe (src/seiten/Hilfe.tsx). Ohne supabase-js; der oeffentliche Schluessel
// reicht, die Funktion prueft selbst. Liefert null bei Erfolg, sonst den Fehlertext.

export type KontaktDaten = { name: string; email: string; verein: string; nachricht: string; webseite?: string };

export async function kontaktSenden(daten: KontaktDaten): Promise<string | null> {
  try {
    const antwort = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kontakt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_KEY },
      body: JSON.stringify({ webseite: '', ...daten })
    });
    if (antwort.ok) return null;
    const inhalt = (await antwort.json().catch(() => ({}))) as { fehler?: string };
    return inhalt.fehler ?? 'Die Nachricht konnte nicht gesendet werden. Bitte schreib direkt eine E-Mail.';
  } catch {
    return 'Keine Verbindung. Bitte später noch einmal versuchen oder direkt eine E-Mail schreiben.';
  }
}
