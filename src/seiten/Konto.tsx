import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { useUngespeichert } from '../ungespeichert';
import { PASSWORT_MINDESTLAENGE, passwortFehler } from '../passwort';
import AuskunftKnoepfe from './AuskunftKnoepfe';
import { EinwilligungSelbst } from './Einwilligungen';
import { NAMENSANZEIGE_AKTIV, NAMENSANZEIGE_FASSUNG, NAMENSANZEIGE_TEXT } from '../einwilligung';
import { ANWENDUNGSADRESSE } from '../adresse';

// "Mein Konto": eigene Angaben und wahlweise ein Passwort. Die Anmeldung per
// Mail-Link bleibt immer moeglich. Wer ein Passwort setzt, bestaetigt vorher mit
// einem Code aus der Mail, dass ihm das Postfach gehoert - Vereins-PCs sind
// geteilt, eine offene Sitzung allein reicht deshalb nicht.
// Eine neue E-Mail-Adresse gilt erst, wenn beide Postfaecher den Link aus ihrer
// Mail bestaetigt haben (Supabase "Secure email change"); der Trigger
// email_mitschreiben zieht dann public.benutzer nach.

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Konto() {
  const { benutzer, vereine } = useSitzung();
  // Mit dem Konto verknuepfte Spieler, je Verein einer: fuer "Meine Daten"
  const [eigeneSpieler, setEigeneSpieler] = useState<{ person_id: string; verein_id: string }[]>([]);
  const [codeGeschickt, setCodeGeschickt] = useState(false);
  const [code, setCode] = useState('');
  const [neu, setNeu] = useState('');
  const [wiederholt, setWiederholt] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const pflicht = usePflicht<HTMLElement>();
  useUngespeichert('konto-passwort', `${code}${neu}${wiederholt}` !== '', 'Das neue Passwort', () => speichern());
  // E-Mail-Adresse aendern: null = Formular zu
  const [neueAdresse, setNeueAdresse] = useState<string | null>(null);
  // Adresse, deren Bestaetigung noch aussteht (auth.users.new_email)
  const [wartend, setWartend] = useState<string | null>(null);
  const [mailArbeitet, setMailArbeitet] = useState(false);
  const [mailMeldung, setMailMeldung] = useState<string | null>(null);
  const mailPflicht = usePflicht<HTMLElement>();
  useUngespeichert('konto-email', !!neueAdresse?.trim(), 'Die neue E-Mail-Adresse', () => adresseAendern());

  useEffect(() => {
    if (!benutzer) return;
    let vorbei = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!vorbei) setWartend(data.user?.new_email ?? null);
    });
    return () => {
      vorbei = true;
    };
  }, [benutzer]);

  useEffect(() => {
    if (!benutzer) return;
    let vorbei = false;
    void supabase
      .from('benutzer_personen')
      .select('person_id, verein_id')
      .eq('benutzer_id', benutzer.id)
      .then(({ data }) => {
        if (!vorbei) setEigeneSpieler(data ?? []);
      });
    return () => {
      vorbei = true;
    };
  }, [benutzer]);

  async function codeAnfordern() {
    setFehler(null);
    setMeldung(null);
    setArbeitet(true);
    const { error } = await supabase.auth.reauthenticate();
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setCodeGeschickt(true);
    setMeldung(`Der Code ist unterwegs an ${benutzer?.email ?? 'deine E-Mail-Adresse'}.`);
  }

  async function adresseAendern() {
    if (!mailPflicht.pruefen()) return;
    const adresse = (neueAdresse ?? '').trim().toLowerCase();
    if (!EMAIL_MUSTER.test(adresse)) return mailPflicht.melden('Bitte eine gültige E-Mail-Adresse eingeben.');
    if (adresse === benutzer?.email?.toLowerCase()) return mailPflicht.melden('Das ist schon deine E-Mail-Adresse.');
    setMailArbeitet(true);
    const { error } = await supabase.auth.updateUser({ email: adresse }, { emailRedirectTo: ANWENDUNGSADRESSE });
    setMailArbeitet(false);
    if (error) {
      const text = error.message.toLowerCase();
      return mailPflicht.melden(
        text.includes('already') || text.includes('registered') || text.includes('exists')
          ? 'Diese E-Mail-Adresse gehört schon zu einem anderen Konto.'
          : text.includes('rate') || text.includes('seconds')
            ? 'Gerade wurden zu viele Mails verschickt. Bitte in ein paar Minuten noch einmal versuchen.'
            : error.message
      );
    }
    setNeueAdresse(null);
    mailPflicht.zuruecksetzen();
    setWartend(adresse);
    setMailMeldung(
      `Bestätigungsmails sind unterwegs an ${benutzer?.email ?? 'deine bisherige Adresse'} und an ${adresse}. ` +
        'Erst wenn du in beiden Mails den Link geklickt hast, gilt die neue Adresse; bis dahin meldest du dich mit der bisherigen an.'
    );
    return true;
  }

  async function speichern() {
    if (!pflicht.pruefen()) return;
    const ziffern = code.replace(/\D/g, '');
    if (ziffern.length < 6 || ziffern.length > 10) return pflicht.melden('Bitte den Zahlencode aus der Mail vollständig eingeben.');
    const problem = passwortFehler(neu, wiederholt, benutzer?.email);
    if (problem) return pflicht.melden(problem);
    setArbeitet(true);
    const { error } = await supabase.auth.updateUser({ password: neu, nonce: ziffern });
    setArbeitet(false);
    if (error) {
      const text = error.message.toLowerCase();
      return pflicht.melden(
        text.includes('nonce') || text.includes('otp') || text.includes('expired')
          ? 'Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.'
          : text.includes('same') || text.includes('different')
            ? 'Das neue Passwort muss sich vom bisherigen unterscheiden.'
            : error.message
      );
    }
    setCode('');
    setNeu('');
    setWiederholt('');
    setCodeGeschickt(false);
    pflicht.zuruecksetzen();
    setFehler(null);
    setMeldung('Passwort gespeichert. Du kannst dich jetzt wahlweise mit Passwort oder per Anmeldelink anmelden.');
    return true;
  }

  return (
    <div className="einspaltig">
      <section className="block" ref={mailPflicht.bereich}>
        <h2>Mein Konto</h2>
        <div className="felder">
          <label className="feld l">
            <span>E-Mail-Adresse</span>
            <input value={benutzer?.email ?? ''} disabled />
          </label>
          <label className="feld">
            <span>Name</span>
            <input value={benutzer?.anzeigename ?? ''} disabled />
          </label>
          {neueAdresse !== null && (
            <label className="feld l">
              <span>Neue E-Mail-Adresse</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={neueAdresse}
                placeholder="name@beispiel.de"
                onChange={(e) => setNeueAdresse(e.target.value)}
              />
            </label>
          )}
        </div>
        {wartend && neueAdresse === null && (
          <p className="hinweis">
            Wechsel auf {wartend} wartet auf Bestätigung: Klicke den Link in der Mail an deine bisherige und an die neue
            Adresse.
          </p>
        )}
        {neueAdresse === null ? (
          <div className="knopfpaar">
            <button
              type="button"
              title="Eine neue E-Mail-Adresse für die Anmeldung und alle Mails von CueDesk eintragen"
              onClick={() => {
                setMailMeldung(null);
                setNeueAdresse('');
              }}
            >
              E-Mail-Adresse ändern
            </button>
          </div>
        ) : (
          <>
            <p className="hinweis">
              Du bekommst zwei Mails: eine an deine bisherige und eine an die neue Adresse. Die neue Adresse gilt erst,
              wenn du in beiden den Link geklickt hast. Kommst du an die bisherige nicht mehr heran, hilft der
              Vereins-Administrator.
            </p>
            <div className="knopfpaar">
              <button type="button" title="Die Bestätigungsmails verschicken" onClick={() => void adresseAendern()} disabled={mailArbeitet}>
                {mailArbeitet ? 'Wird geschickt …' : 'Bestätigungsmails schicken'}
              </button>
              <button
                type="button"
                title="Ohne Ändern schließen"
                onClick={() => {
                  setNeueAdresse(null);
                  mailPflicht.zuruecksetzen();
                }}
              >
                Abbrechen
              </button>
              <Pflichthinweis hinweis={mailPflicht.hinweis} />
            </div>
          </>
        )}
        {mailMeldung && <p className="meldung">{mailMeldung}</p>}
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      <section className="block" ref={pflicht.bereich}>
        <h2>Passwort festlegen oder ändern</h2>
        <p className="hinweis">
          Wahlweise: Mit Passwort meldest du dich ohne Mail an. Der Anmeldelink per E-Mail funktioniert weiterhin und ist
          auch der Weg, wenn du das Passwort vergisst. Zur Sicherheit bestätigst du zuerst mit einem Code aus einer Mail,
          dass dir das Postfach gehört.
        </p>
        {!codeGeschickt ? (
          <div className="knopfpaar">
            <button type="button" title="Schickt einen Zahlencode an deine E-Mail-Adresse" onClick={() => void codeAnfordern()} disabled={arbeitet}>
              {arbeitet ? 'Wird geschickt …' : 'Code an meine E-Mail schicken'}
            </button>
          </div>
        ) : (
          <>
            <div className="felder">
              <label className="feld">
                <span>Code aus der Mail</span>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  value={code}
                  placeholder="z. B. 12345678"
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <label className="feld">
                <span>Neues Passwort</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={neu}
                  placeholder={`mindestens ${PASSWORT_MINDESTLAENGE} Zeichen`}
                  onChange={(e) => setNeu(e.target.value)}
                />
              </label>
              <label className="feld">
                <span>Noch einmal</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={wiederholt}
                  onChange={(e) => setWiederholt(e.target.value)}
                />
              </label>
            </div>
            <div className="knopfpaar">
              <button type="button" title="Das neue Passwort speichern" onClick={() => void speichern()} disabled={arbeitet}>
                {arbeitet ? 'Wird gespeichert …' : 'Passwort speichern'}
              </button>
              <button type="button" title="Einen neuen Code anfordern" onClick={() => void codeAnfordern()} disabled={arbeitet}>
                Neuen Code schicken
              </button>
              <button
                type="button"
                title="Ohne Speichern schließen"
                onClick={() => {
                  setCode('');
                  setNeu('');
                  setWiederholt('');
                  setCodeGeschickt(false);
                  pflicht.zuruecksetzen();
                }}
              >
                Abbrechen
              </button>
              <Pflichthinweis hinweis={pflicht.hinweis} />
            </div>
          </>
        )}
      </section>

      {NAMENSANZEIGE_AKTIV && eigeneSpieler.length > 0 && (
        <section className="block">
          <h2>Namensanzeige</h2>
          <blockquote className="wortlaut">{NAMENSANZEIGE_TEXT}</blockquote>
          <p className="hinweis">
            Fassung {NAMENSANZEIGE_FASSUNG}. Für Minderjährige erfasst der Verein die Einwilligung der
            Erziehungsberechtigten; widerrufen kannst du hier jederzeit selbst.
          </p>
          {eigeneSpieler.map((s) => (
            <EinwilligungSelbst
              key={s.person_id}
              personId={s.person_id}
              verein={vereine.find((v) => v.id === s.verein_id)?.name ?? 'Verein'}
            />
          ))}
        </section>
      )}

      <section className="block">
        <h2>Meine Daten</h2>
        <p className="hinweis">
          Lade herunter, was CueDesk über dich speichert: Konto, Angaben zur Person, Partien, Turniere und Rating. Das PDF
          ist zum Lesen, die JSON-Datei enthält dieselben Daten vollständig und maschinenlesbar.
        </p>
        {eigeneSpieler.length === 0 ? (
          <p className="hinweis">
            Mit deinem Konto ist kein Spieler verknüpft. Der Vereins-Administrator kann das unter „Konten und Rollen“
            nachholen.
          </p>
        ) : (
          eigeneSpieler.map((s) => (
            <AuskunftKnoepfe
              key={s.person_id}
              personId={s.person_id}
              beschriftung={`${vereine.find((v) => v.id === s.verein_id)?.name ?? 'Verein'}:`}
            />
          ))
        )}
      </section>

      <p className="rechtslinks">
        <a href={`${import.meta.env.BASE_URL}impressum.html`} target="_blank" rel="noreferrer">
          Impressum
        </a>{' '}
        ·{' '}
        <a href={`${import.meta.env.BASE_URL}datenschutz.html`} target="_blank" rel="noreferrer">
          Datenschutz
        </a>{' '}
        ·{' '}
        <a href={`${import.meta.env.BASE_URL}nutzungsbedingungen.html`} target="_blank" rel="noreferrer">
          Nutzungsbedingungen
        </a>{' '}
        ·{' '}
        <a href={`${import.meta.env.BASE_URL}auftragsverarbeitung.html`} target="_blank" rel="noreferrer">
          Auftragsverarbeitung
        </a>
      </p>
    </div>
  );
}
