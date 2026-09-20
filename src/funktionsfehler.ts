// supabase.functions.invoke meldet nur "Edge Function returned a non-2xx
// status code". Die eigentliche Begruendung steht im Rumpf der Antwort.
// Diese Hilfe holt sie heraus.

export async function funktionsFehlerText(fehler: unknown, ersatz = 'Unbekannter Fehler'): Promise<string> {
  const mitAntwort = fehler as { message?: string; context?: { json?: () => Promise<unknown> } };
  try {
    const inhalt = (await mitAntwort.context?.json?.()) as { fehler?: string } | undefined;
    if (inhalt?.fehler) return inhalt.fehler;
  } catch {
    // Antwort war kein JSON - dann bleibt die allgemeine Meldung.
  }
  return mitAntwort.message ?? ersatz;
}
