import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './modal';
import { schutzwortPruefen } from './schutzwort';

// Eigene Rueckfrage statt window.confirm: gleicher Stil wie die Anwendung.
//
//   const [rueckfrage, fragen] = useRueckfrage();
//   if (!(await fragen('Wirklich loeschen?'))) return;
//   ...
//   return <>{...}{rueckfrage}</>;
//
// Mit { schutzwort: verein.id } fragt sie zusaetzlich das Schutzwort des
// Vereins ab (Loeschen von Turnieren und Spieltagen) und sagt erst ja, wenn
// es stimmt. Bei falschem Wort bleibt sie offen.

export type RueckfrageOptionen = { schutzwort?: string };

export function useRueckfrage(): [ReactNode, (text: string, ja?: string, optionen?: RueckfrageOptionen) => Promise<boolean>] {
  const [offen, setOffen] = useState<{ text: string; ja: string; schutzVerein?: string } | null>(null);
  const [wort, setWort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [prueft, setPrueft] = useState(false);
  const antwort = useRef<((ok: boolean) => void) | null>(null);

  const fragen = useCallback(
    (text: string, ja = 'Ja', optionen?: RueckfrageOptionen) =>
      new Promise<boolean>((fertig) => {
        antwort.current = fertig;
        setWort('');
        setFehler(null);
        setOffen({ text, ja, schutzVerein: optionen?.schutzwort });
      }),
    []
  );

  const schliessen = (ok: boolean) => {
    setOffen(null);
    setWort('');
    setFehler(null);
    antwort.current?.(ok);
    antwort.current = null;
  };

  async function mitSchutzwort(vereinId: string) {
    if (prueft) return;
    setPrueft(true);
    const stimmt = await schutzwortPruefen(vereinId, wort);
    setPrueft(false);
    if (!stimmt) return setFehler('Das Passwort stimmt nicht.');
    schliessen(true);
  }

  const schutzVerein = offen?.schutzVerein;
  const element = offen ? (
    <Modal abbrechen={() => schliessen(false)}>
      <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{offen.text}</p>
      {schutzVerein ? (
        <>
          <div className="zeile">
            <input
              type="password"
              placeholder="Passwort"
              value={wort}
              autoFocus
              onChange={(e) => {
                setWort(e.target.value);
                setFehler(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void mitSchutzwort(schutzVerein)}
            />
            <button
              type="button"
              className="gefahrknopf"
              title="Mit dem Schutzwort des Vereins bestätigen"
              onClick={() => void mitSchutzwort(schutzVerein)}
              disabled={prueft}
            >
              {offen.ja}
            </button>
          </div>
          {fehler && <p className="fehler">{fehler}</p>}
          <div className="knopfpaar">
            <button type="button" onClick={() => schliessen(false)}>
              Abbrechen
            </button>
          </div>
        </>
      ) : (
        <div className="knopfpaar">
          <button type="button" autoFocus onClick={() => schliessen(true)}>
            {offen.ja}
          </button>
          <button type="button" onClick={() => schliessen(false)}>
            Abbrechen
          </button>
        </div>
      )}
    </Modal>
  ) : null;

  return [element, fragen];
}
