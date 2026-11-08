import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { OHNE_TISCH_TEXT } from '../live';
import { useRueckfrage } from '../rueckfrage';
import { agentErreichbar, andereAmTisch, belegtText } from '../geraete';
import { Modal } from '../modal';
import TvHerunterfahren from './TvHerunterfahren';
import type { Geraet, Tisch } from '../datenbank.types';

export default function TischeGeraete() {
  const { verein, darf } = useSitzung();
  // Vereins-Admin verwaltet Tische und entkoppelt; Turnierleiter koppeln
  // Tablets und aendern die Tischzuordnung.
  const darfVerwalten = darf('vereinsadmin');
  const darfKoppeln = darf('vereinsadmin', 'turnierleiter');

  const [tische, setTische] = useState<Tisch[]>([]);
  const [geraete, setGeraete] = useState<Geraet[]>([]);
  const [agenten, setAgenten] = useState<{ geraet_id: string; zuletzt_gemeldet: string | null }[]>([]);
  // Der Schluessel steht nur in diesem Moment im Klartext zur Verfuegung
  const [schluessel, setSchluessel] = useState<{ name: string; wert: string; kopiert: boolean } | null>(null);
  const [neueNummer, setNeueNummer] = useState('');
  const [neueBezeichnung, setNeueBezeichnung] = useState('');
  const [code, setCode] = useState('');
  const [geraetName, setGeraetName] = useState('');
  const [geraetTisch, setGeraetTisch] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const tischPflicht = usePflicht();
  const koppelPflicht = usePflicht();
  const [rueckfrage, fragen] = useRueckfrage();

  const agentVon = (geraet: Geraet) => agenten.find((a) => a.geraet_id === geraet.id);
  const tischName = (id: string) => {
    const t = tische.find((x) => x.id === id);
    return t ? `Tisch ${t.nummer}` : 'diesem Tisch';
  };
  // Haengt am Tisch schon ein anderes Geraet? Dann erst nachfragen.
  async function belegtOk(tischId: string, ausser: string | undefined, ja: string): Promise<boolean> {
    const andere = andereAmTisch(geraete, tischId, ausser);
    if (andere.length === 0) return true;
    return fragen(belegtText(tischName(tischId), andere, zuletzt), ja);
  }

  useEffect(() => {
    if (!verein) return;
    void laden();
  }, [verein]);

  async function laden() {
    if (!verein) return;
    const [tischAntwort, geraetAntwort, agentAntwort] = await Promise.all([
      supabase.from('tische').select('*').eq('verein_id', verein.id).order('nummer'),
      supabase.from('geraete').select('*').eq('verein_id', verein.id).order('name'),
      supabase.rpc('tv_agenten', { p_verein: verein.id })
    ]);
    if (tischAntwort.error) setFehler(tischAntwort.error.message);
    setTische(tischAntwort.data ?? []);
    setGeraete(geraetAntwort.data ?? []);
    setAgenten(agentAntwort.data ?? []);
  }

  async function tischAnlegen() {
    if (!verein) return;
    setFehler(null);
    setMeldung(null);
    if (!tischPflicht.pruefen()) return;
    const nummer = Number(neueNummer);
    if (!Number.isInteger(nummer) || nummer < 1) return tischPflicht.melden('Bitte eine Tischnummer ab 1 eingeben.');
    const { error } = await supabase
      .from('tische')
      .insert({ verein_id: verein.id, nummer, bezeichnung: neueBezeichnung.trim() || null, aktiv: true });
    if (error) {
      setFehler(error.message.includes('duplicate key') ? `Tisch ${nummer} gibt es schon.` : error.message);
      return;
    }
    setNeueNummer('');
    setNeueBezeichnung('');
    await laden();
  }

  async function tischAendern(tisch: Tisch, aenderung: Partial<Tisch>) {
    const { error } = await supabase.from('tische').update(aenderung).eq('id', tisch.id);
    if (error) setFehler(error.message);
    await laden();
  }

  async function tischLoeschen(tisch: Tisch) {
    const { error } = await supabase.from('tische').delete().eq('id', tisch.id);
    if (error) {
      setFehler(
        error.message.includes('violates foreign key')
          ? 'Der Tisch wird noch benutzt. Schalte ihn stattdessen auf nicht aktiv.'
          : error.message
      );
      return;
    }
    await laden();
  }

  async function koppeln() {
    if (!verein) return;
    setFehler(null);
    setMeldung(null);
    if (!koppelPflicht.pruefen()) return;
    if (!/^[A-Za-z0-9]{6}$/.test(code.trim())) return koppelPflicht.melden('Der Code besteht aus sechs Zeichen.');
    if (!(await belegtOk(geraetTisch, undefined, 'Trotzdem koppeln'))) return;
    const { error } = await supabase.rpc('geraet_koppeln', {
      p_code: code.trim().toUpperCase(),
      p_verein: verein.id,
      p_name: geraetName.trim(),
      p_tisch: geraetTisch || undefined
    });
    if (error) {
      setFehler(error.message);
      return;
    }
    setCode('');
    setGeraetName('');
    setGeraetTisch('');
    setMeldung('Gerät gekoppelt.');
    await laden();
  }

  async function geraetTischSetzen(geraet: Geraet, tischId: string) {
    setFehler(null);
    // Abbrechen: Die Auswahl zeigt weiter den bisherigen Tisch (gesteuertes Feld)
    if (!(await belegtOk(tischId, geraet.id, 'Trotzdem umstellen'))) return;
    const { error } = await supabase
      .from('geraete')
      .update({ tisch_id: tischId || null })
      .eq('id', geraet.id);
    if (error) setFehler(error.message);
    await laden();
  }

  async function trennen(geraet: Geraet) {
    if (!(await fragen(`${geraet.name} trennen?\nEs zeigt danach wieder einen Kopplungscode und muss neu gekoppelt werden.`, 'Trennen'))) return;
    const { error } = await supabase.from('geraete').delete().eq('id', geraet.id);
    if (error) {
      setFehler(error.message);
      return;
    }
    setMeldung(`${geraet.name} ist getrennt. Das Gerät zeigt wieder einen Kopplungscode.`);
    await laden();
  }

  async function agentSchluesselErzeugen(geraet: Geraet) {
    setFehler(null);
    const vorhanden = agenten.some((a) => a.geraet_id === geraet.id);
    if (vorhanden && !(await fragen(`Neuen Agent-Schlüssel für ${geraet.name} erzeugen?\nDer bisherige funktioniert danach nicht mehr.`, 'Neuer Schlüssel'))) return;
    const { data, error } = await supabase.rpc('agent_schluessel_erzeugen', { p_geraet: geraet.id });
    if (error) return setFehler(error.message);
    setSchluessel({ name: geraet.name, wert: data, kopiert: false });
    await laden();
  }

  async function schluesselKopieren() {
    if (!schluessel) return;
    try {
      await navigator.clipboard.writeText(schluessel.wert);
      setSchluessel({ ...schluessel, kopiert: true });
    } catch {
      setFehler('Kopieren ging nicht. Bitte den Schlüssel im Feld markieren und kopieren.');
    }
  }

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;
  if (!darfKoppeln) return <p className="hinweis">Für diesen Bereich fehlen dir die Rechte.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        <h2>Tische</h2>
        {!darfVerwalten && (
          <p className="hinweis">
            {tische
              .filter((t) => t.aktiv)
              .map((t) => (t.bezeichnung ? `Tisch ${t.nummer} (${t.bezeichnung})` : `Tisch ${t.nummer}`))
              .join(' · ') || 'Noch kein Tisch angelegt.'}{' '}
            Tische anlegen und ändern kann der Vereins-Administrator.
          </p>
        )}
        {darfVerwalten && (
          <>
            <table className="tabelle kompakt">
              <thead>
                <tr>
                  <th style={{ width: '70px' }}>Nr.</th>
                  <th>Bezeichnung</th>
                  <th style={{ width: '90px' }}>Aktiv</th>
                  <th style={{ width: '110px' }}></th>
                </tr>
              </thead>
              <tbody>
                {tische.map((tisch) => (
                  <tr key={tisch.id}>
                    <td>{tisch.nummer}</td>
                    <td>
                      <input
                        value={tisch.bezeichnung ?? ''}
                        placeholder="ohne Bezeichnung"
                        onChange={(e) =>
                          setTische((bisher) =>
                            bisher.map((eintrag) =>
                              eintrag.id === tisch.id ? { ...eintrag, bezeichnung: e.target.value } : eintrag
                            )
                          )
                        }
                        onBlur={(e) => void tischAendern(tisch, { bezeichnung: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={tisch.aktiv}
                        onChange={(e) => void tischAendern(tisch, { aktiv: e.target.checked })}
                      />
                    </td>
                    <td className="rechts">
                      <button type="button" className="gefahrknopf" title="Löscht den Tisch. Wird er noch gebraucht, stattdessen auf nicht aktiv schalten." onClick={() => void tischLoeschen(tisch)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
                {tische.length === 0 && (
                  <tr>
                    <td colSpan={4} className="hinweis">
                      Noch kein Tisch angelegt.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="zeile" ref={tischPflicht.bereich}>
              <input
                style={{ width: '80px' }}
                required
                aria-label="Nr."
                placeholder="Nr. *"
                value={neueNummer}
                onChange={(e) => setNeueNummer(e.target.value)}
              />
              <input
                placeholder="Bezeichnung (optional)"
                value={neueBezeichnung}
                onChange={(e) => setNeueBezeichnung(e.target.value)}
              />
              <button type="button" title="Einen weiteren Tisch anlegen" onClick={() => void tischAnlegen()}>
                Tisch anlegen
              </button>
              <Pflichthinweis hinweis={tischPflicht.hinweis} />
            </div>
          </>
        )}
      </section>

      <section className="block">
        <h2>Geräte</h2>
        {geraete.map((geraet) => (
          <div key={geraet.id} className="geraetezeile">
            <div className="geraetename">
              {geraet.name}
              {geraet.tisch_id && andereAmTisch(geraete, geraet.tisch_id, geraet.id).length > 0 && (
                <span
                  className="marke warnmarke"
                  title={`Am selben Tisch: ${andereAmTisch(geraete, geraet.tisch_id, geraet.id).map((g) => g.name).join(', ')}. Zwei Geräte überschreiben sich gegenseitig den Spielstand.`}
                >
                  ⚠ teilt {tischName(geraet.tisch_id)}
                </span>
              )}
              <small>
                {zuletzt(geraet.zuletzt_gesehen)}
                {agentVon(geraet) && (agentErreichbar(agentVon(geraet)?.zuletzt_gemeldet ?? null) ? ' · Agent verbunden' : ' · Agent nicht erreichbar')}
              </small>
            </div>
            <select
              value={geraet.tisch_id ?? ''}
              onChange={(e) => void geraetTischSetzen(geraet, e.target.value)}
            >
              <option value="">{OHNE_TISCH_TEXT}</option>
              {tische.map((tisch) => (
                <option key={tisch.id} value={tisch.id}>
                  Tisch {tisch.nummer}
                  {tisch.bezeichnung ? ` — ${tisch.bezeichnung}` : ''}
                </option>
              ))}
            </select>
            <div className="geraeteknoepfe">
              {darfVerwalten && !geraet.tisch_id && (
                <button type="button" title="Erzeugt den Schlüssel für den Agenten, der dieses TV-Gerät auf Wunsch herunterfährt. Er wird nur einmal angezeigt." onClick={() => void agentSchluesselErzeugen(geraet)}>
                  Agent-Schlüssel
                </button>
              )}
              {darfVerwalten && (
                <button type="button" title="Trennt das Tablet von CueDesk. Es zeigt danach wieder einen Kopplungscode." onClick={() => void trennen(geraet)}>
                  Trennen
                </button>
              )}
              {agentVon(geraet) && <TvHerunterfahren vereinId={verein.id} agenten={agenten.length} />}
            </div>
          </div>
        ))}
        {geraete.length === 0 && <p className="hinweis">Noch kein Gerät gekoppelt.</p>}

        <div className="kasten">
          <div className="feldkopf">Gerät koppeln</div>
          <p className="hinweis">
            Auf dem Tablet die Adresse mit dem Zusatz <code>?geraet</code> öffnen. Dort steht ein
            sechsstelliger Code, der 15 Minuten gilt.
          </p>
          <p className="hinweis">
            Wichtig: <code>?geraet</code> in einem privaten Browser-Fenster oder direkt auf dem Tablet bzw. Fernsehgerät
            öffnen und dort koppeln – nicht in dem Browser, in dem du gerade angemeldet bist. Sonst wird dein eigenes
            Konto zum Gerät und sieht mehr, als ein Tablet oder Fernseher sehen soll.
          </p>
          <div className="zeile" ref={koppelPflicht.bereich}>
            <input
              style={{ width: '120px', letterSpacing: '2px', textTransform: 'uppercase' }}
              required
              aria-label="Code"
              placeholder="Code *"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              required
              aria-label="Name des Geräts"
              placeholder="Name des Geräts *"
              value={geraetName}
              onChange={(e) => setGeraetName(e.target.value)}
            />
            <select value={geraetTisch} onChange={(e) => setGeraetTisch(e.target.value)}>
              <option value="">{OHNE_TISCH_TEXT}</option>
              {tische.map((tisch) => (
                <option key={tisch.id} value={tisch.id}>
                  Tisch {tisch.nummer}
                </option>
              ))}
            </select>
            <button type="button" title="Koppelt das Gerät mit dem angezeigten Code: an einen Tisch zum Spielen oder als Fernseher für die TV-Ansicht." onClick={() => void koppeln()}>
              Koppeln
            </button>
            <Pflichthinweis hinweis={koppelPflicht.hinweis} />
          </div>
        </div>

        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>
      {schluessel && (
        <Modal abbrechen={() => setSchluessel(null)}>
          <h3 style={{ margin: 0 }}>Agent-Schlüssel für {schluessel.name}</h3>
          <p className="hinweis">Der Schlüssel wird nur dieses eine Mal angezeigt. Trage ihn auf dem TV-Gerät beim Agenten ein.</p>
          <div className="zeile raster">
            <input readOnly value={schluessel.wert} aria-label="Agent-Schlüssel" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => void schluesselKopieren()}>
              {schluessel.kopiert ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>
          {fehler && <p className="fehler">{fehler}</p>}
          <div className="zeile">
            <button type="button" onClick={() => setSchluessel(null)}>
              Schließen
            </button>
          </div>
        </Modal>
      )}
      {rueckfrage}
    </div>
  );
}

function zuletzt(zeitpunkt: string | null) {
  if (!zeitpunkt) return 'noch nicht gemeldet';
  const minuten = Math.round((Date.now() - new Date(zeitpunkt).getTime()) / 60000);
  if (minuten < 2) return 'gerade eben gesehen';
  if (minuten < 60) return `zuletzt gesehen vor ${minuten} Minuten`;
  return `zuletzt gesehen ${new Date(zeitpunkt).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short'
  })}`;
}
