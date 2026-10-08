import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRueckfrage } from '../rueckfrage';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { istAbgelaufen, linkAdresse, neuerSchluessel, standardGueltigBis, tagVon, tagesende } from '../oeffentlicher-link';
import type { OeffentlicherLink as Link } from '../datenbank.types';

// Knopf "Öffentlicher Link" im Kopf von Turnier und Liga-Spieltag (Stufe 32)
// mit Dialog: Link fuer Zuschauer ohne Anmeldung erzeugen, kopieren, Ablauf
// aendern, neu erzeugen (alter Link ungueltig) oder loeschen. Beim
// Liga-Spieltag haengt der Link an der 1. Begegnung und zeigt den ganzen
// Spieltag (oeffentliche_ansicht).

const tagText = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

export default function OeffentlicherLink({
  turnierId,
  vereinId,
  turnierDatum
}: {
  turnierId: string;
  vereinId: string;
  turnierDatum: string;
}) {
  const [link, setLink] = useState<Link | null>(null);
  const [offen, setOffen] = useState(false);
  const [tag, setTag] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [rueckfrage, fragen] = useRueckfrage();
  const pflicht = usePflicht();

  const laden = useCallback(async () => {
    const { data } = await supabase.from('oeffentliche_links').select('*').eq('turnier_id', turnierId).maybeSingle();
    setLink(data ?? null);
  }, [turnierId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const adresse = link ? linkAdresse(`${window.location.origin}${import.meta.env.BASE_URL}`, link.schluessel) : '';
  const abgelaufen = link ? istAbgelaufen(link.gueltig_bis) : false;

  function oeffnen() {
    setFehler(null);
    setKopiert(false);
    pflicht.zuruecksetzen();
    setTag(link ? tagVon(link.gueltig_bis) : standardGueltigBis(turnierDatum));
    setOffen(true);
  }

  async function speichern(neuerLink: boolean) {
    if (!pflicht.pruefen()) return;
    if (tagesende(tag) <= new Date().toISOString()) return pflicht.melden('Das Datum liegt in der Vergangenheit.');
    if (neuerLink && link && !(await fragen('Neuen Link erzeugen?\n\nDer bisherige Link funktioniert danach nicht mehr.', 'Neuer Link'))) return;
    setArbeitet(true);
    setFehler(null);
    const zeile = {
      turnier_id: turnierId,
      verein_id: vereinId,
      schluessel: neuerLink || !link ? neuerSchluessel() : link.schluessel,
      gueltig_bis: tagesende(tag)
    };
    const { error } = await supabase.from('oeffentliche_links').upsert(zeile, { onConflict: 'turnier_id' });
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setKopiert(false);
    await laden();
  }

  async function loeschen() {
    if (!(await fragen('Öffentlichen Link löschen?\n\nZuschauer ohne Anmeldung sehen das Turnier danach nicht mehr.', 'Löschen'))) return;
    setArbeitet(true);
    const { error } = await supabase.from('oeffentliche_links').delete().eq('turnier_id', turnierId);
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setLink(null);
    setTag(standardGueltigBis(turnierDatum));
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(adresse);
      setKopiert(true);
    } catch {
      setFehler('Kopieren ging nicht. Bitte den Link im Feld markieren und kopieren.');
    }
  }

  const knopfText = !link ? 'Öffentlicher Link' : abgelaufen ? 'Öffentlicher Link: abgelaufen' : `Öffentlicher Link: bis ${tagText(link.gueltig_bis)}`;

  return (
    <>
      <button
        type="button"
        className={link && !abgelaufen ? 'klein aktivmarke' : 'klein'}
        title="Zuschauerseite dieses Turniers als Link ohne Anmeldung freigeben"
        onClick={oeffnen}
      >
        {knopfText}
      </button>

      {offen && (
        <div className="dialoghintergrund" onClick={() => !arbeitet && setOffen(false)}>
          <div className="dialog" ref={pflicht.bereich} onClick={(e) => e.stopPropagation()}>
            <h3>Öffentlicher Live-Link</h3>
            <p className="hinweis">
              Wer den Link hat, sieht ohne Anmeldung die Tische und den Spielplan dieses Turniers, beim Liga-Spieltag alle
              Begegnungen. Kein Chat, keine anderen Turniere. Mit erfasster Einwilligung zur Namensanzeige (Spieler →
              Einwilligungen) erscheint der Anzeigename ohne Vereinszusatz, sonst „Vorname N.“; ohne Einwilligung nur das
              Kürzel.
            </p>

            {link && (
              <div className="zeile raster">
                <input readOnly value={adresse} aria-label="Link" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={() => void kopieren()}>
                  {kopiert ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
            )}
            {link && abgelaufen && <p className="fehler">Der Link ist abgelaufen. Mit einem neuen Datum gilt er wieder.</p>}

            <div className="felder">
              <label className="feld">
                <span>Gültig bis einschließlich</span>
                <input type="date" required value={tag} onChange={(e) => setTag(e.target.value)} />
              </label>
            </div>

            {fehler && <p className="fehler">{fehler}</p>}
            <div className="zeile">
              <Pflichthinweis hinweis={pflicht.hinweis} />
              {!link ? (
                <button type="button" disabled={arbeitet} onClick={() => void speichern(true)}>
                  Link erzeugen
                </button>
              ) : (
                <>
                  <button type="button" disabled={arbeitet || tag === tagVon(link.gueltig_bis)} onClick={() => void speichern(false)}>
                    Datum speichern
                  </button>
                  <button type="button" disabled={arbeitet} onClick={() => void speichern(true)}>
                    Neuer Link
                  </button>
                  <button type="button" className="gefahrknopf" disabled={arbeitet} onClick={() => void loeschen()}>
                    Link löschen
                  </button>
                </>
              )}
              <button type="button" disabled={arbeitet} onClick={() => setOffen(false)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
      {rueckfrage}
    </>
  );
}
