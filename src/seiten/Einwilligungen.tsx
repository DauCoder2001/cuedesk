import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRueckfrage } from '../rueckfrage';
import {
  ART_TEXT,
  einwilligungStand,
  NAMENSANZEIGE_AKTIV,
  NAMENSANZEIGE_FASSUNG,
  standText,
  WEG_TEXT
} from '../einwilligung';
import type { Einwilligung, EinwilligungArt, EinwilligungWeg } from '../datenbank.types';

// Einwilligungen (Stufe 22): Namensanzeige und, bei Minderjaehrigen, das Konto.
// EinwilligungLeitung steht auf der Seite "Spieler", EinwilligungSelbst unter
// "Mein Konto". Was erlaubt ist, prueft die Datenbankfunktion
// einwilligung_setzen; die Knoepfe bieten nur das Passende an.

const datumZeit = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function useEinwilligungen(personId: string) {
  const [liste, setListe] = useState<Einwilligung[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(async () => {
    const { data, error } = await supabase
      .from('einwilligungen')
      .select('*')
      .eq('person_id', personId)
      .order('am', { ascending: false });
    if (error) setFehler(error.message);
    setListe(data ?? []);
  }, [personId]);
  useEffect(() => {
    void laden();
  }, [laden]);

  async function setzen(art: EinwilligungArt, erteilen: boolean, weg: EinwilligungWeg): Promise<boolean> {
    setFehler(null);
    const { error } = await supabase.rpc('einwilligung_setzen', {
      p_person: personId,
      p_art: art,
      p_erteilen: erteilen,
      p_weg: weg,
      p_fassung: weg === 'selbst' ? NAMENSANZEIGE_FASSUNG : null
    });
    if (error) {
      setFehler(error.message);
      return false;
    }
    await laden();
    return true;
  }
  return { liste, fehler, setzen };
}

function StandMarke({ liste, art }: { liste: Einwilligung[]; art: EinwilligungArt }) {
  const s = einwilligungStand(liste, art);
  const klasse = s.ohneNachweis ? 'marke warnmarke' : s.gilt ? 'marke gutmarke' : 'marke';
  return <span className={klasse}>{standText(s)}</span>;
}

// Seite "Spieler": Vereinsleitung erfasst schriftliche Einwilligungen und Widerrufe
export function EinwilligungLeitung({
  personId,
  name,
  minderjaehrig,
  darfErfassen,
  geaendert
}: {
  personId: string;
  name: string;
  minderjaehrig: boolean;
  darfErfassen: boolean;
  geaendert: () => void; // name_oeffentlich hat sich geaendert
}) {
  const { liste, fehler, setzen } = useEinwilligungen(personId);
  const [rueckfrage, fragen] = useRueckfrage();
  const nameStand = einwilligungStand(liste, 'name_oeffentlich');
  const kontoStand = einwilligungStand(liste, 'konto_minderjaehrig');

  async function erfassen(art: EinwilligungArt, erteilen: boolean) {
    const weg: EinwilligungWeg = erteilen && (minderjaehrig || art === 'konto_minderjaehrig') ? 'erziehungsberechtigte' : 'schriftlich';
    const frage = erteilen
      ? weg === 'erziehungsberechtigte'
        ? `Liegt die schriftliche Einwilligung der Erziehungsberechtigten von ${name} zu „${ART_TEXT[art]}“ vor?\n\nDer Nachweis bleibt beim Verein und muss aufbewahrt werden.`
        : `Liegt die schriftliche Einwilligung von ${name} zur Namensanzeige vor?\n\nDer Nachweis bleibt beim Verein und muss aufbewahrt werden.`
      : `Widerruf von ${name} zu „${ART_TEXT[art]}“ erfassen?${art === 'name_oeffentlich' ? '\n\nÖffentlich erscheint danach nur noch das Kürzel.' : ''}`;
    if (!(await fragen(frage, erteilen ? 'Einwilligung erfassen' : 'Widerruf erfassen'))) return;
    if ((await setzen(art, erteilen, weg)) && art === 'name_oeffentlich') geaendert();
  }

  // Ohne oeffentliche Seite nur das Konto Minderjaehriger (NAMENSANZEIGE_AKTIV)
  const verlauf = NAMENSANZEIGE_AKTIV ? liste : liste.filter((e) => e.art === 'konto_minderjaehrig');
  if (!NAMENSANZEIGE_AKTIV && !minderjaehrig && verlauf.length === 0) return null;

  return (
    <fieldset className="einwilligungen">
      <legend>Einwilligungen</legend>
      {NAMENSANZEIGE_AKTIV && (
      <div className="einwilligungszeile">
        <strong>Namensanzeige</strong>
        <StandMarke liste={liste} art="name_oeffentlich" />
        {darfErfassen && (
          <span className="knopfpaar">
            {(!nameStand.gilt || nameStand.ohneNachweis) && (
              <button type="button" title="Eine schriftlich vorliegende Einwilligung festhalten" onClick={() => void erfassen('name_oeffentlich', true)}>
                {minderjaehrig ? 'Einwilligung der Erziehungsberechtigten erfassen' : 'Schriftliche Einwilligung erfassen'}
              </button>
            )}
            {nameStand.gilt && (
              <button type="button" title="Einen Widerruf festhalten; danach erscheint öffentlich nur das Kürzel" onClick={() => void erfassen('name_oeffentlich', false)}>
                Widerruf erfassen
              </button>
            )}
          </span>
        )}
      </div>
      )}
      {NAMENSANZEIGE_AKTIV && nameStand.ohneNachweis && (
        <p className="hinweis">
          Der Haken stammt aus der Zeit vor den Einwilligungen und hat keinen Nachweis. Liegt eine schriftliche Einwilligung
          vor, erfasse sie; sonst erfasse den Widerruf.
        </p>
      )}
      {minderjaehrig && (
        <div className="einwilligungszeile">
          <strong>Konto (Minderjährige)</strong>
          <StandMarke liste={liste} art="konto_minderjaehrig" />
          {darfErfassen && (
            <span className="knopfpaar">
              {!kontoStand.gilt ? (
                <button type="button" title="Einwilligung der Erziehungsberechtigten zum Konto festhalten; erst dann ist eine Einladung möglich" onClick={() => void erfassen('konto_minderjaehrig', true)}>
                  Einwilligung der Erziehungsberechtigten erfassen
                </button>
              ) : (
                <button type="button" title="Widerruf der Erziehungsberechtigten zum Konto festhalten" onClick={() => void erfassen('konto_minderjaehrig', false)}>
                  Widerruf erfassen
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {verlauf.length > 0 && (
        <table className="tabelle kompakt">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Art</th>
              <th>Vorgang</th>
              <th>Weg</th>
            </tr>
          </thead>
          <tbody>
            {verlauf.map((e) => (
              <tr key={e.id}>
                <td>{datumZeit(e.am)}</td>
                <td>{ART_TEXT[e.art]}</td>
                <td>{e.vorgang === 'erteilt' ? 'Einwilligung' : 'Widerruf'}</td>
                <td>
                  {WEG_TEXT[e.weg]}
                  {e.fassung ? <small> · Wortlaut {e.fassung}</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {fehler && <p className="fehler">{fehler}</p>}
      {rueckfrage}
    </fieldset>
  );
}

// "Mein Konto": das Mitglied willigt selbst ein oder widerruft
export function EinwilligungSelbst({ personId, verein }: { personId: string; verein: string }) {
  const { liste, fehler, setzen } = useEinwilligungen(personId);
  const [rueckfrage, fragen] = useRueckfrage();
  const stand = einwilligungStand(liste, 'name_oeffentlich');

  async function aendern(erteilen: boolean) {
    if (
      !erteilen &&
      !(await fragen('Einwilligung zur Namensanzeige widerrufen? Öffentlich erscheint danach nur dein Kürzel.', 'Widerrufen'))
    )
      return;
    await setzen('name_oeffentlich', erteilen, 'selbst');
  }

  return (
    <div className="einwilligungselbst">
      <div className="einwilligungszeile">
        <strong>{verein}</strong>
        <StandMarke liste={liste} art="name_oeffentlich" />
        <span className="knopfpaar">
          {stand.gilt && !stand.ohneNachweis ? (
            <button type="button" title="Die Einwilligung zur Namensanzeige zurücknehmen" onClick={() => void aendern(false)}>
              Widerrufen
            </button>
          ) : (
            <>
              <button type="button" title={`Dem Wortlaut oben zustimmen (Fassung ${NAMENSANZEIGE_FASSUNG})`} onClick={() => void aendern(true)}>
                Einwilligen
              </button>
              {stand.ohneNachweis && (
                <button type="button" title="Die bisherige Namensanzeige beenden" onClick={() => void aendern(false)}>
                  Widerrufen
                </button>
              )}
            </>
          )}
        </span>
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {rueckfrage}
    </div>
  );
}
