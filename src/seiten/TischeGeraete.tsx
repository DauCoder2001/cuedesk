import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import type { Geraet, Tisch } from '../datenbank.types';

export default function TischeGeraete() {
  const { verein, darf } = useSitzung();
  const darfVerwalten = darf('vereinsadmin');

  const [tische, setTische] = useState<Tisch[]>([]);
  const [geraete, setGeraete] = useState<Geraet[]>([]);
  const [neueNummer, setNeueNummer] = useState('');
  const [neueBezeichnung, setNeueBezeichnung] = useState('');
  const [code, setCode] = useState('');
  const [geraetName, setGeraetName] = useState('');
  const [geraetTisch, setGeraetTisch] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!verein) return;
    void laden();
  }, [verein]);

  async function laden() {
    if (!verein) return;
    const [tischAntwort, geraetAntwort] = await Promise.all([
      supabase.from('tische').select('*').eq('verein_id', verein.id).order('nummer'),
      supabase.from('geraete').select('*').eq('verein_id', verein.id).order('name')
    ]);
    if (tischAntwort.error) setFehler(tischAntwort.error.message);
    setTische(tischAntwort.data ?? []);
    setGeraete(geraetAntwort.data ?? []);
  }

  async function tischAnlegen() {
    if (!verein) return;
    setFehler(null);
    setMeldung(null);
    const nummer = Number(neueNummer);
    if (!Number.isInteger(nummer) || nummer < 1) {
      setFehler('Bitte eine Tischnummer ab 1 eingeben.');
      return;
    }
    const { error } = await supabase
      .from('tische')
      .insert({ verein_id: verein.id, nummer, bezeichnung: neueBezeichnung.trim() || null, aktiv: true });
    if (error) {
      setFehler(
        error.message.includes('duplicate key')
          ? `Tisch ${nummer} gibt es schon.`
          : error.message
      );
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
    if (!/^[A-Za-z0-9]{6}$/.test(code.trim())) {
      setFehler('Der Code besteht aus sechs Zeichen.');
      return;
    }
    if (!geraetName.trim()) {
      setFehler('Bitte einen Namen für das Gerät eingeben.');
      return;
    }
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
    const { error } = await supabase
      .from('geraete')
      .update({ tisch_id: tischId || null })
      .eq('id', geraet.id);
    if (error) setFehler(error.message);
    await laden();
  }

  async function trennen(geraet: Geraet) {
    const { error } = await supabase.from('geraete').delete().eq('id', geraet.id);
    if (error) {
      setFehler(error.message);
      return;
    }
    setMeldung(`${geraet.name} ist getrennt. Das Gerät zeigt wieder einen Kopplungscode.`);
    await laden();
  }

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;
  if (!darfVerwalten) return <p className="hinweis">Für diesen Bereich fehlen dir die Rechte.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        <h2>Tische</h2>
        <table className="tabelle">
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
                  <button type="button" onClick={() => void tischLoeschen(tisch)}>
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

        <div className="zeile">
          <input
            style={{ width: '80px' }}
            placeholder="Nr."
            value={neueNummer}
            onChange={(e) => setNeueNummer(e.target.value)}
          />
          <input
            placeholder="Bezeichnung"
            value={neueBezeichnung}
            onChange={(e) => setNeueBezeichnung(e.target.value)}
          />
          <button type="button" onClick={() => void tischAnlegen()}>
            Tisch anlegen
          </button>
        </div>
      </section>

      <section className="block">
        <h2>Geräte</h2>
        {geraete.map((geraet) => (
          <div key={geraet.id} className="geraetezeile">
            <div className="geraetename">
              {geraet.name}
              <small>{zuletzt(geraet.zuletzt_gesehen)}</small>
            </div>
            <select
              value={geraet.tisch_id ?? ''}
              onChange={(e) => void geraetTischSetzen(geraet, e.target.value)}
            >
              <option value="">kein Tisch</option>
              {tische.map((tisch) => (
                <option key={tisch.id} value={tisch.id}>
                  Tisch {tisch.nummer}
                  {tisch.bezeichnung ? ` — ${tisch.bezeichnung}` : ''}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void trennen(geraet)}>
              Trennen
            </button>
          </div>
        ))}
        {geraete.length === 0 && <p className="hinweis">Noch kein Gerät gekoppelt.</p>}

        <div className="kasten">
          <div className="feldkopf">Gerät koppeln</div>
          <p className="hinweis">
            Auf dem Tablet die Adresse mit dem Zusatz <code>?geraet</code> öffnen. Dort steht ein
            sechsstelliger Code, der 15 Minuten gilt.
          </p>
          <div className="zeile">
            <input
              style={{ width: '120px', letterSpacing: '2px', textTransform: 'uppercase' }}
              placeholder="Code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              placeholder="Name des Geräts"
              value={geraetName}
              onChange={(e) => setGeraetName(e.target.value)}
            />
            <select value={geraetTisch} onChange={(e) => setGeraetTisch(e.target.value)}>
              <option value="">kein Tisch</option>
              {tische.map((tisch) => (
                <option key={tisch.id} value={tisch.id}>
                  Tisch {tisch.nummer}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void koppeln()}>
              Koppeln
            </button>
          </div>
        </div>

        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>
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
