import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabase';
import { ANWENDUNGSADRESSE } from '../adresse';

// Anmeldung per E-Mail oder wahlweise mit Passwort (festgelegt unter "Mein
// Konto"). Die Mail enthaelt einen Link und einen Zahlencode
// (Laenge in Supabase einstellbar, 6 bis 10 Ziffern). Der Code ist der sichere Weg, wenn ein Mailprogramm Links vorab
// aufruft oder jemand zweimal klickt: ein Link gilt nur ein einziges Mal.

// Zuletzt gewaehlte Art der Anmeldung merkt sich der Browser
const ART_SCHLUESSEL = 'cuedesk.anmeldeart';
function gemerkteArt(): 'link' | 'passwort' {
  try {
    return localStorage.getItem(ART_SCHLUESSEL) === 'passwort' ? 'passwort' : 'link';
  } catch {
    return 'link';
  }
}

export default function Anmeldung() {
  const [art, setArtRoh] = useState<'link' | 'passwort'>(gemerkteArt);
  const [passwort, setPasswort] = useState('');
  const [meldetAn, setMeldetAn] = useState(false);
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

  function setArt(neu: 'link' | 'passwort') {
    setArtRoh(neu);
    setFehler(null);
    try {
      localStorage.setItem(ART_SCHLUESSEL, neu);
    } catch {
      // ohne Speicher gilt beim naechsten Mal wieder der Anmeldelink
    }
  }

  async function mitPasswort(ereignis: FormEvent) {
    ereignis.preventDefault();
    const adresse = email.trim().toLowerCase();
    if (!adresse.includes('@')) return setFehler('Bitte eine gültige E-Mail-Adresse eingeben.');
    if (!passwort) return setFehler('Bitte das Passwort eingeben.');
    setFehler(null);
    setMeldetAn(true);
    const { error } = await supabase.auth.signInWithPassword({ email: adresse, password: passwort });
    setMeldetAn(false);
    if (error) {
      setFehler(
        error.message.toLowerCase().includes('invalid login credentials')
          ? 'E-Mail oder Passwort stimmt nicht. Noch kein Passwort oder vergessen? Melde dich mit dem Anmeldelink an und lege es unter „Mein Konto“ fest.'
          : error.message
      );
    }
    // Bei Erfolg schaltet die Anwendung von selbst auf die Vereinsansicht um.
  }

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
      <div className="anmeldespalte">
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
            <button type="submit" title="Mit dem Code aus der E-Mail anmelden" disabled={zustand === 'prueft'}>
              {zustand === 'prueft' ? 'Wird geprüft' : 'Anmelden'}
            </button>
            <button
              type="button"
              title="Zurück zur Eingabe der E-Mail-Adresse"
              onClick={() => {
                setZustand('ruhe');
                setCode('');
                setFehler(null);
              }}
            >
              Andere Adresse
            </button>
          </form>
        ) : art === 'passwort' ? (
          <form onSubmit={mitPasswort}>
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
              placeholder="z. B. name@beispiel.de"
            />
            <label htmlFor="passwort">Passwort</label>
            <input
              id="passwort"
              type="password"
              autoComplete="current-password"
              value={passwort}
              onChange={(e) => {
                setPasswort(e.target.value);
                setFehler(null);
              }}
            />
            {fehler && <p className="fehler">{fehler}</p>}
            <button type="submit" title="Mit E-Mail-Adresse und Passwort anmelden" disabled={meldetAn}>
              {meldetAn ? 'Wird geprüft' : 'Anmelden'}
            </button>
            <button type="button" title="Stattdessen einen Anmeldelink per E-Mail bekommen" onClick={() => setArt('link')}>
              Mit Anmeldelink anmelden
            </button>
            <p className="hinweis">
              Passwort vergessen oder noch keins? Mit dem Anmeldelink kommst du immer hinein und legst es unter „Mein Konto“
              fest.
            </p>
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
              placeholder="z. B. name@beispiel.de"
            />
            {fehler && <p className="fehler">{fehler}</p>}
            <button type="submit" title="Schickt einen Anmeldelink an diese Adresse" disabled={zustand === 'sendet'}>
              {zustand === 'sendet' ? 'Wird gesendet' : 'Anmeldelink schicken'}
            </button>
            <button type="button" title="Mit einem Passwort anmelden, das du unter „Mein Konto“ festgelegt hast" onClick={() => setArt('passwort')}>
              Mit Passwort anmelden
            </button>
            <p className="hinweis">
              Du bekommst einen Link und einen Zahlencode per E-Mail. Wer möchte, legt sich zusätzlich unter „Mein Konto“ ein
              Passwort fest.
            </p>
          </form>
        )}
      </div>
      <p className="rechtslinks">
        <a href={`${import.meta.env.BASE_URL}impressum.html`}>Impressum</a> ·{' '}
        <a href={`${import.meta.env.BASE_URL}datenschutz.html`}>Datenschutz</a>
      </p>
      </div>
    </div>
  );
}
