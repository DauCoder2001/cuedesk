// Regeln fuer ein selbst gewaehltes Passwort (Seite "Mein Konto"). Die
// Anmeldung per Mail-Link bleibt; das Passwort ist nur eine Wahlmoeglichkeit.
export const PASSWORT_MINDESTLAENGE = 10;

// Fehlertext oder null, wenn das Passwort taugt
export function passwortFehler(neu: string, wiederholt: string, email: string | null | undefined): string | null {
  if (neu.length < PASSWORT_MINDESTLAENGE) return `Das Passwort braucht mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`;
  if (neu !== wiederholt) return 'Die beiden Eingaben stimmen nicht überein.';
  if (email && neu.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'Das Passwort darf nicht die E-Mail-Adresse sein.';
  }
  return null;
}
