import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import { anzeigeWaehlen } from './zuschauen';
import { istVerbindungsfehler } from './oeffentlicher-link';
import { TischeTeil, TurnierTeil } from './seiten/ZuschauenTeile';
import type { Stand } from './seiten/ZuschauenTeile';
import type { OeffentlicheAnsicht, Partie, Tisch, Turnier, TurnierTeilnehmer } from './datenbank.types';
import './stil.css';

// Oeffentlicher Live-Link (Stufe 32): Zuschauerseite eines Turniers ohne
// Anmeldung. Schluessel aus ?k=, Daten nur aus oeffentliche_ansicht(). Ohne
// Konto gibt es keine Live-Meldungen der Datenbank, deshalb alle 10 Sekunden
// neu laden (nur solange die Seite sichtbar ist).

const TAKT_MS = 10_000;

type Ansicht = 'tische' | 'turnier';

function LiveOeffentlich() {
  const schluessel = useMemo(() => new URLSearchParams(window.location.search).get('k') ?? '', []);
  const [daten, setDaten] = useState<OeffentlicheAnsicht | null>(null);
  const [zustand, setZustand] = useState<'laedt' | 'da' | 'ungueltig' | 'fehler'>('laedt');
  const [stand, setStand] = useState<Date | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>('tische');
  const [fehlerText, setFehlerText] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (schluessel.length < 32) return setZustand('ungueltig');
    const { data, error } = await supabase.rpc('oeffentliche_ansicht', { p_schluessel: schluessel });
    if (error) {
      // kurzer Aussetzer: alten Stand zeigen; die Meldung hilft bei der Fehlersuche
      setFehlerText(error.message || String(error));
      return setZustand((z) => (z === 'da' ? z : 'fehler'));
    }
    setFehlerText(null);
    if (!data) return setZustand('ungueltig');
    setDaten(data);
    setZustand('da');
    setStand(new Date());
  }, [schluessel]);

  useEffect(() => {
    void laden();
    const uhr = window.setInterval(() => {
      if (document.visibilityState === 'visible') void laden();
    }, TAKT_MS);
    const sichtbar = () => document.visibilityState === 'visible' && void laden();
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      window.clearInterval(uhr);
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, [laden]);

  // Die Antwort enthaelt nur die Felder fuer die Anzeige; die Rechnung
  // (src/zuschauen.ts) liest auch nur diese.
  const turniere = (daten?.turniere ?? []) as Turnier[];
  const partien = (daten?.partien ?? []) as Partie[];
  const teilnehmer = (daten?.teilnehmer ?? []) as TurnierTeilnehmer[];
  const tische = (daten?.tische ?? []) as Tisch[];
  const staende: Record<string, Stand> = {};
  (daten?.staende ?? []).forEach((s) => (staende[s.tisch_id] = { zustand: s.zustand, aktualisiert: s.aktualisiert }));
  const anzeige = anzeigeWaehlen(turniere);
  const titel = anzeige?.begegnungen[0].name ?? turniere.find((t) => !(t.einstellungen as { liga?: { art?: string } } | null)?.liga?.art)?.name ?? '';
  const name = (id: string) => daten?.namen[id] ?? '?';

  if (zustand === 'laedt') return <p className="hinweis oeffentlichhinweis">Lädt …</p>;
  if (zustand === 'ungueltig' || !daten) {
    return (
      <div className="zuschauen">
        <p className="hinweis oeffentlichhinweis">
          {zustand === 'fehler'
            ? 'Die Spielstände sind gerade nicht erreichbar. Bitte später noch einmal versuchen.'
            : 'Dieser Link ist ungültig oder abgelaufen.'}
          {zustand === 'fehler' && istVerbindungsfehler(fehlerText) && (
            <>
              <br />
              Blockiert eine Browser-Erweiterung (Werbe- oder Tracking-Blocker) die Verbindung? Dann die Seite dort
              erlauben oder einen anderen Browser nehmen.
            </>
          )}
          {zustand === 'fehler' && fehlerText && (
            <>
              <br />
              <small>({fehlerText})</small>
            </>
          )}
        </p>
        <Fuss />
      </div>
    );
  }

  return (
    <div className="zuschauen">
      <div className="zuschauenkopf">
        <strong>{daten.verein}</strong>
        <span className="hinweis">{stand ? `Stand ${stand.toLocaleTimeString('de-DE')}` : ''}</span>
      </div>
      {titel && <p className="oeffentlichtitel">{titel}</p>}
      <span className="umschalter zuschauenwahl">
        <button type="button" className={ansicht === 'tische' ? 'aktiv' : ''} onClick={() => setAnsicht('tische')}>
          Tische
        </button>
        <button type="button" className={ansicht === 'turnier' ? 'aktiv' : ''} onClick={() => setAnsicht('turnier')}>
          Turnier
        </button>
      </span>

      {ansicht === 'tische' && <TischeTeil tische={tische} staende={staende} turniere={turniere} protokollLink={false} />}
      {ansicht === 'turnier' && (
        <TurnierTeil
          anzeige={anzeige}
          partien={partien}
          teilnehmer={teilnehmer}
          tische={tische}
          heutige={partien}
          vereinName={daten.verein}
          name={name}
        />
      )}
      <Fuss />
    </div>
  );
}

function Fuss() {
  return (
    <p className="hinweis oeffentlichfuss">
      Live mit CueDesk · <a href="./impressum.html">Impressum</a> · <a href="./datenschutz.html">Datenschutz</a>
    </p>
  );
}

const wurzel = document.getElementById('app');
if (!wurzel) throw new Error('Element #app fehlt in live.html');

createRoot(wurzel).render(
  <StrictMode>
    <LiveOeffentlich />
  </StrictMode>
);
