import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabase';
import { ANWENDUNGSADRESSE } from '../adresse';

// Anmeldung per E-Mail. Die Mail enthaelt einen Link und einen Zahlencode
// (Laenge in Supabase einstellbar, 6 bis 10 Ziffern). Der Code ist der sichere Weg, wenn ein Mailprogramm Links vorab
// aufruft oder jemand zweimal klickt: ein Link gilt nur ein einziges Mal.

export default function Anmeldung() {
  const [email, setEmail] = useState('');
  const [zustand, setZustand] = useState<'ruhe' | 'sendet' | 'gesendet' | 'prueft'>('ruhe');
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  // Kam der Besucher ueber einen verbrauchten oder abgelaufenen Link?
  useEffect(() => {
    const teile = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const art = teile.get('error_code');
    if (!art) return;
    setFehler(
      art === 'otp_expired'
        ? 'Der Anmeldelink war schon verbraucht oder ist abgelaufen. Fordere einen neuen an — oder benutze den Zahlencode aus der Mail.'
        : teile.get('error_description') ?? 'Die Anmeldung hat nicht geklappt.'
    );
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function linkAnfordern(ereignis: FormEvent) {
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

  async function codePruefen(ereignis: FormEvent) {
    ereignis.preventDefault();
    const ziffern = code.replace(/\D/g, '');
    if (ziffern.length < 6 || ziffern.length > 10) {
      setFehler('Bitte den Zahlencode aus der Mail vollständig eingeben.');
      return;
    }
    setFehler(null);
    setZustand('prueft');
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: ziffern,
      type: 'email'
    });
    if (error) {
      setZustand('gesendet');
      setFehler('Der Code stimmt nicht oder ist abgelaufen.');
      return;
    }
    // Bei Erfolg schaltet die Anwendung von selbst auf die Vereinsansicht um.
  }

  return (
    <div className="mitte">
      <div className="karte">
        <h1>CueDesk</h1>

        {zustand === 'gesendet' || zustand === 'prueft' ? (
          <form onSubmit={codePruefen}>
            <p className="hinweis">
              Wir haben eine Mail an {email} geschickt. Klicke den Link darin einmal — oder tippe
              den Zahlencode ein.
            </p>
            <label htmlFor="code">Code aus der Mail</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              placeholder="Zahlencode"
              onChange={(e) => {
                setCode(e.target.value);
                setFehler(null);
              }}
            />
            {fehler && <p className="fehler">{fehler}</p>}
            <button type="submit" disabled={zustand === 'prueft'}>
              {zustand === 'prueft' ? 'Wird geprüft' : 'Anmelden'}
            </button>
            <button
              type="button"
              onClick={() => {
                setZustand('ruhe');
                setCode('');
                setFehler(null);
              }}
            >
              Andere Adresse
            </button>
          </form>
        ) : (
          <form onSubmit={linkAnfordern}>
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
              Es gibt kein Passwort. Du bekommst einen Link und einen Zahlencode per E-Mail.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
