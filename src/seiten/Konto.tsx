import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { useUngespeichert } from '../ungespeichert';
import { PASSWORT_MINDESTLAENGE, passwortFehler } from '../passwort';
import AuskunftKnoepfe from './AuskunftKnoepfe';
import { EinwilligungSelbst } from './Einwilligungen';
import { NAMENSANZEIGE_FASSUNG, NAMENSANZEIGE_TEXT } from '../einwilligung';

// "Mein Konto": eigene Angaben und wahlweise ein Passwort. Die Anmeldung per
// Mail-Link bleibt immer moeglich. Wer ein Passwort setzt, bestaetigt vorher mit
// einem Code aus der Mail, dass ihm das Postfach gehoert - Vereins-PCs sind
// geteilt, eine offene Sitzung allein reicht deshalb nicht.

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
      <section className="block">
        <h2>Mein Konto</h2>
        <div className="felder">
          <label className="feld">
            <span>E-Mail-Adresse</span>
            <input value={benutzer?.email ?? ''} disabled />
          </label>
          <label className="feld">
            <span>Name</span>
            <input value={benutzer?.anzeigename ?? ''} disabled />
          </label>
        </div>
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

      {eigeneSpieler.length > 0 && (
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
            Mit deinem Konto ist kein Spieler verknüpft. Der Vereins-Administrator kann das unter „Benutzer und Rollen“
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
