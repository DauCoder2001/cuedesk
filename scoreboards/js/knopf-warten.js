// Knopf, hinter dem gespeichert wird ("Ergebnis bestaetigen"): sofort
// "Speichert …" zeigen und sperren, damit niemand ein zweites Mal tippt,
// solange die Anfragen an CueDesk laufen. Danach (auch bei einem Fehler) den
// alten Zustand zurueck. Ein weiterer Aufruf waehrend der Arbeit tut nichts.
export async function waehrendSpeichern(knopf, arbeit, hinweis) {
  if (!knopf || knopf.disabled) return;
  const text = knopf.textContent;
  const hinweisText = hinweis ? hinweis.textContent : null;
  knopf.disabled = true;
  knopf.textContent = 'Speichert …';
  if (hinweis) hinweis.textContent = 'Ergebnis wird an CueDesk übertragen.';
  try {
    await arbeit();
  } finally {
    knopf.disabled = false;
    knopf.textContent = text;
    if (hinweis) hinweis.textContent = hinweisText;
  }
}
