import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabase';
import { ANWENDUNGSADRESSE } from '../adresse';

export default function Anmeldung() {
  const [email, setEmail] = useState('');
  const [zustand, setZustand] = useState<'ruhe' | 'sendet' | 'gesendet'>('ruhe');
  const [fehler, setFehler] = useState<string | null>(null);

  async function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    const adresse = email.trim().toLowerCase();
    if (!adresse.includes('@')) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    setFehler(null);
    setZustand('sendet');
    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: { shouldCreateUser: false, emailRedirectTo: ANWENDUNGSADRESSE }
    });
    if (error) {
      setZustand('ruhe');
      setFehler(
        error.message.toLowerCase().includes('signups not allowed')
          ? 'Zu dieser Adresse gibt es kein Konto. Wende dich an den Vereins-Administrator.'
          : error.message
      );
      return;
    }
    setZustand('gesendet');
  }

  return (
    <div className="mitte">
      <div className="karte">
        <h1>CueDesk</h1>
        {zustand === 'gesendet' ? (
          <p className="hinweis">
            Wir haben einen Anmeldelink an {email} geschickt. Der Link gilt eine Stunde.
          </p>
        ) : (
          <form onSubmit={absenden}>
            <label htmlFor="email">E-Mail-Adresse</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFehler(null);
              }}
              placeholder="name@beispiel.de"
            />
            {fehler && <p className="fehler">{fehler}</p>}
            <button type="submit" disabled={zustand === 'sendet'}>
              {zustand === 'sendet' ? 'Wird gesendet' : 'Anmeldelink schicken'}
            </button>
            <p className="hinweis">
              Es gibt kein Passwort. Du bekommst einen Link per E-Mail.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
