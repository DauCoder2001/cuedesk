import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Modal } from '../modal';
import { LIGEN } from '../liga';
import type { LigaKennung } from '../liga';
import { saisonAus } from '../mannschaften';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { ligaAenderbar, spieltagAenderung, spieltagEingabe } from '../spieltag-aendern';
import type { SpieltagEingabe } from '../spieltag-aendern';
import type { TurnierEinstellungen } from './Turniere';
import type { Mannschaft, Turnier } from '../datenbank.types';

// Grunddaten eines Liga-Spieltags in Vorbereitung aendern: Name, Datum, Liga,
// Spieltag, Heimrecht, eigene Mannschaft, Gegner. Gilt fuer alle Begegnungen
// des Spieltags (1., Doppel, 2.); die Regeln stehen in src/spieltag-aendern.ts.
export default function SpieltagAendern({
  ids,
  mannschaften,
  saisonbeginn,
  vereinName,
  schliessen,
  fertig
}: {
  ids: string[]; // alle Begegnungen des Spieltags, die 1. zuerst
  mannschaften: Mannschaft[];
  saisonbeginn: number;
  vereinName: string;
  schliessen: () => void;
  fertig: (hinweis: string) => void;
}) {
  const pflicht = usePflicht();
  const [teile, setTeile] = useState<Pick<Turnier, 'id' | 'name' | 'datum' | 'status' | 'einstellungen'>[] | null>(null);
  const [partienAnzahl, setPartienAnzahl] = useState(0);
  const [eingabe, setEingabe] = useState<(Omit<SpieltagEingabe, 'spieltag'> & { spieltag: string }) | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  // Frisch laden: gespeichert wird auf dem Stand, der gerade gilt
  const schluessel = ids.join(',');
  useEffect(() => {
    void (async () => {
      const [t, p] = await Promise.all([
        supabase.from('turniere').select('id, name, datum, status, einstellungen').in('id', ids),
        supabase.from('partien').select('id', { count: 'exact', head: true }).in('turnier_id', ids)
      ]);
      if (t.error) return setFehler(t.error.message);
      const liste = ids.map((id) => (t.data ?? []).find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
      setTeile(liste);
      setPartienAnzahl(p.count ?? 0);
      if (liste[0]) {
        const e = spieltagEingabe(liste[0]);
        setEingabe({ ...e, spieltag: String(e.spieltag) });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- neu laden nur bei anderen Begegnungen
  }, [schluessel]);

  const gestartet = (teile ?? []).some((t) => t.status !== 'geplant');
  const ligaFrei = teile ? ligaAenderbar(teile, partienAnzahl) : false;
  const derSaison = eingabe ? mannschaften.filter((m) => m.saison === saisonAus(eingabe.datum, saisonbeginn)) : [];
  const setze = (x: Partial<NonNullable<typeof eingabe>>) => setEingabe((alt) => (alt ? { ...alt, ...x } : alt));

  // Mannschaft aus der Liste: Name kommt mit, frei eingetragen: eigener Name
  function mannschaftWaehlen(id: string) {
    const m = derSaison.find((x) => x.id === id);
    setze({ mannschaft_id: m?.id ?? null, eigene: m?.name ?? '' });
  }

  async function speichern() {
    if (!teile || !eingabe) return;
    setFehler(null);
    if (!pflicht.pruefen()) return;
    const nr = Number(eingabe.spieltag);
    if (!Number.isInteger(nr) || nr < 1 || nr > 99) return pflicht.melden('Spieltag: bitte eine Zahl von 1 bis 99.');
    if (gestartet) return setFehler('Der Spieltag läuft schon. Ändern geht nur in Vorbereitung.');
    const alt = spieltagEingabe(teile[0]);
    const neu: SpieltagEingabe = {
      ...eingabe,
      spieltag: nr,
      eigene: eingabe.eigene.trim() || vereinName,
      liga: ligaFrei ? eingabe.liga : alt.liga
    };
    setArbeitet(true);
    for (const z of spieltagAenderung(teile, neu)) {
      const { error } = await supabase
        .from('turniere')
        .update({ name: z.name, datum: z.datum, einstellungen: z.einstellungen })
        .eq('id', z.id)
        .eq('status', 'geplant');
      if (error) {
        setArbeitet(false);
        return setFehler(error.message);
      }
    }
    setArbeitet(false);
    const mitAufstellung = teile.some(
      (t) => Object.keys(((t.einstellungen ?? {}) as TurnierEinstellungen).liga?.aufstellung ?? {}).length > 0
    );
    const mannschaftAnders = neu.mannschaft_id !== alt.mannschaft_id || neu.eigene !== alt.eigene;
    fertig(
      mannschaftAnders && mitAufstellung
        ? 'Spieltag geändert. Bitte die Aufstellung prüfen: Die Spieler stammen aus dem bisherigen Kader.'
        : 'Spieltag geändert.'
    );
  }

  return (
    <Modal abbrechen={() => !arbeitet && schliessen()}>
      <h2>Spieltag ändern</h2>
      {!teile || !eingabe ? (
        <p className="hinweis">{fehler ?? 'Lädt.'}</p>
      ) : (
        <div ref={pflicht.bereich}>
          <p className="hinweis">
            {teile.length > 1 ? 'Gilt für alle Begegnungen dieses Spieltags.' : 'Gilt auch für Begegnungen, die später dazukommen.'}
          </p>
          <div className="felder">
            <label className="feld l">
              <span>Name</span>
              <input required value={eingabe.name} onChange={(e) => setze({ name: e.target.value })} />
            </label>
            <label className="feld">
              <span>Datum</span>
              <input type="date" required value={eingabe.datum} onChange={(e) => setze({ datum: e.target.value })} />
            </label>
            <label className="feld">
              <span>Liga</span>
              <select
                value={eingabe.liga}
                disabled={!ligaFrei}
                title={ligaFrei ? undefined : 'Nur solange noch keine Aufstellung eingetragen ist (Spaß-Liga: nie).'}
                onChange={(e) => setze({ liga: e.target.value as LigaKennung })}
              >
                {(Object.keys(LIGEN) as LigaKennung[])
                  .filter((k) => k !== 'spass' || eingabe.liga === 'spass')
                  .map((k) => (
                    <option key={k} value={k}>
                      {LIGEN[k].name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="feld s">
              <span>Spieltag</span>
              <input inputMode="numeric" required value={eingabe.spieltag} onChange={(e) => setze({ spieltag: e.target.value })} />
            </label>
            <label className="feld">
              <span>Heimrecht (1. Begegnung)</span>
              <select value={eingabe.heim ? 'heim' : 'gast'} onChange={(e) => setze({ heim: e.target.value === 'heim' })}>
                <option value="heim">Heimspiel</option>
                <option value="gast">Auswärtsspiel</option>
              </select>
            </label>
            <label className="feld l">
              <span>Eigene Mannschaft</span>
              {derSaison.length > 0 ? (
                <select value={eingabe.mannschaft_id ?? ''} onChange={(e) => mannschaftWaehlen(e.target.value)}>
                  {derSaison.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.staffel ? ` (${m.staffel})` : ''}
                    </option>
                  ))}
                  <option value="">andere, von Hand eintragen</option>
                </select>
              ) : (
                <input value={eingabe.eigene} onChange={(e) => setze({ eigene: e.target.value })} placeholder={`leer = ${vereinName}`} />
              )}
            </label>
            {derSaison.length > 0 && !eingabe.mannschaft_id && (
              <label className="feld">
                <span>Name der Mannschaft</span>
                <input value={eingabe.eigene} onChange={(e) => setze({ eigene: e.target.value })} placeholder={`leer = ${vereinName}`} />
              </label>
            )}
            <label className="feld l">
              <span>Gegner</span>
              <input required value={eingabe.gegner} onChange={(e) => setze({ gegner: e.target.value })} />
            </label>
          </div>
          <p className="hinweis">
            {teile.length > 1 && 'Die 2. Begegnung behält das getauschte Heimrecht. '}
            {!ligaFrei && 'Die Liga lässt sich nur ändern, solange noch keine Aufstellung eingetragen ist.'}
          </p>
          {gestartet && <p className="fehler">Der Spieltag läuft schon. Ändern geht nur in Vorbereitung.</p>}
          {fehler && <p className="fehler">{fehler}</p>}
          <div className="zeile">
            <button type="button" disabled={arbeitet || gestartet} onClick={() => void speichern()}>
              Speichern
            </button>
            <button type="button" disabled={arbeitet} onClick={schliessen}>
              Abbrechen
            </button>
            <Pflichthinweis hinweis={pflicht.hinweis} />
          </div>
        </div>
      )}
    </Modal>
  );
}
