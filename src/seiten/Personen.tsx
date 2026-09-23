import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import type { Person, PersonIntern, PersonenStatus } from '../datenbank.types';
import { personName, kuerzelAus } from '../namen';
import { useRueckfrage } from '../rueckfrage';

type Entwurf = Omit<Person, 'id' | 'erstellt_am' | 'geaendert_am'> & { id: string | null };
type EntwurfIntern = Omit<PersonIntern, 'person_id' | 'verein_id'>;

const LEER_INTERN: EntwurfIntern = {
  eintritt: null,
  austritt: null,
  minderjaehrig: false,
  rating_startwert: null,
  notiz: null,
  passnummer: null,
  dbu_nummer: null
};

const STATUS_TEXT: Record<PersonenStatus, string> = {
  mitglied: 'Mitglied',
  gast: 'Gast',
  ausgetreten: 'Ausgetreten'
};

export default function Personen() {
  const { verein, darf } = useSitzung();
  const [rueckfrage, fragen] = useRueckfrage();
  const darfSehen = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const darfAendern = darf('vereinsadmin', 'sportwart');

  const [personen, setPersonen] = useState<Person[]>([]);
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<PersonenStatus | 'alle'>('alle');
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [intern, setIntern] = useState<EntwurfIntern>(LEER_INTERN);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!verein) return;
    void laden(verein.id);
  }, [verein]);

  async function laden(vereinId: string) {
    const { data, error } = await supabase
      .from('personen')
      .select('*')
      .eq('verein_id', vereinId)
      .order('vorname')
      .order('nachname')
      .order('vorname');
    if (error) {
      setFehler(error.message);
      return;
    }
    setPersonen(data ?? []);
  }

  async function auswaehlen(person: Person) {
    setMeldung(null);
    setFehler(null);
    setEntwurf({ ...person });
    setIntern(LEER_INTERN);
    if (!darfSehen) return;
    const { data } = await supabase
      .from('personen_intern')
      .select('*')
      .eq('person_id', person.id)
      .maybeSingle();
    if (data) {
      const { person_id: _p, verein_id: _v, ...rest } = data;
      setIntern(rest);
    }
  }

  function neu() {
    if (!verein) return;
    setMeldung(null);
    setFehler(null);
    setIntern(LEER_INTERN);
    setEntwurf({
      id: null,
      verein_id: verein.id,
      vorname: '',
      nachname: '',
      anzeigename: null,
      kuerzel: null,
      status: 'mitglied',
      name_oeffentlich: false,
      rating_ausgeblendet: false
    });
  }

  async function speichern() {
    if (!entwurf || !verein) return;
    if (!entwurf.vorname.trim() || !entwurf.nachname.trim()) {
      setFehler('Vorname und Nachname sind Pflicht.');
      return;
    }
    setFehler(null);

    const stamm = {
      verein_id: verein.id,
      vorname: entwurf.vorname.trim(),
      nachname: entwurf.nachname.trim(),
      anzeigename: entwurf.anzeigename?.trim() || null,
      kuerzel: entwurf.kuerzel?.trim() || null,
      status: entwurf.status,
      name_oeffentlich: entwurf.name_oeffentlich
    };

    const { data, error } = entwurf.id
      ? await supabase.from('personen').update(stamm).eq('id', entwurf.id).select().single()
      : await supabase.from('personen').insert(stamm).select().single();

    if (error || !data) {
      setFehler(error?.message ?? 'Speichern fehlgeschlagen.');
      return;
    }

    if (darfAendern) {
      const { error: fehlerIntern } = await supabase
        .from('personen_intern')
        .upsert({ person_id: data.id, verein_id: verein.id, ...intern });
      if (fehlerIntern) {
        setFehler(fehlerIntern.message);
        return;
      }
    }

    setEntwurf({ ...data });
    setMeldung('Gespeichert.');
    await laden(verein.id);
  }

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();
    return personen.filter((person) => {
      const passtFilter = filter === 'alle' || person.status === filter;
      const name = `${person.nachname} ${person.vorname} ${person.kuerzel ?? ''}`.toLowerCase();
      return passtFilter && (text === '' || name.includes(text));
    });
  }, [personen, suche, filter]);

  const anzahl = useMemo(() => {
    const zaehler: Record<string, number> = { mitglied: 0, gast: 0, ausgetreten: 0 };
    personen.forEach((person) => {
      zaehler[person.status] += 1;
    });
    return zaehler;
  }, [personen]);

  // Eine Person wird nur geloescht, wenn nichts an ihr haengt. Ergebnisse
  // duerfen nicht verschwinden, deshalb gibt es sonst nur "Ausgetreten".
  async function personLoeschen() {
    if (!verein || !entwurf?.id) return;
    const id = entwurf.id;
    const name = personName(entwurf as unknown as Person);
    setFehler(null);
    setMeldung(null);

    const [partienAntwort, teilnahmeAntwort, aufnahmeAntwort] = await Promise.all([
      supabase.from('partien').select('id', { count: 'exact', head: true }).or(`spieler_a.eq.${id},spieler_b.eq.${id}`),
      supabase.from('turnier_teilnehmer').select('person_id', { count: 'exact', head: true }).eq('person_id', id),
      supabase.from('aufnahmen_141').select('partie_id', { count: 'exact', head: true }).eq('spieler', id)
    ]);
    const partien = partienAntwort.count ?? 0;
    const teilnahmen = teilnahmeAntwort.count ?? 0;
    const aufnahmen = aufnahmeAntwort.count ?? 0;

    if (partien + teilnahmen + aufnahmen > 0) {
      const teile = [
        partien > 0 ? `${partien} Partien` : null,
        teilnahmen > 0 ? `${teilnahmen} Turnierteilnahmen` : null,
        aufnahmen > 0 ? `${aufnahmen} 14.1-Aufnahmen` : null
      ].filter(Boolean);
      const frage =
        `${name} kann nicht gelöscht werden: ${teile.join(', ')} hängen daran.\n\n` +
        'Stattdessen auf „Ausgetreten“ setzen? Die Person verschwindet dann aus Auswahllisten und Ranglisten, ' +
        'die Ergebnisse bleiben erhalten.';
      if (!(await fragen(frage, 'Ausgetreten'))) return;
      const { error } = await supabase.from('personen').update({ status: 'ausgetreten' }).eq('id', id);
      if (error) return setFehler(error.message);
      setMeldung(`${name} ist jetzt als ausgetreten geführt.`);
      await laden(verein.id);
      return;
    }

    if (!(await fragen(`${name} endgültig löschen?`, 'Löschen'))) return;
    const { error } = await supabase.from('personen').delete().eq('id', id);
    if (error) return setFehler(error.message);
    setEntwurf(null);
    setMeldung(`${name} wurde gelöscht.`);
    await laden(verein.id);
  }

  if (!verein) {
    return <p className="hinweis">Kein Verein zugeordnet. Wende dich an den Vereins-Administrator.</p>;
  }

  return (
    <div className="zweispaltig">
      <aside className="liste">
        <div className="listenkopf">
          <input
            type="search"
            placeholder="Name suchen"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
          <div className="filterzeile">
            {(['alle', 'mitglied', 'gast', 'ausgetreten'] as const).map((wert) => (
              <button
                key={wert}
                type="button"
                className={filter === wert ? 'chip aktiv' : 'chip'}
                onClick={() => setFilter(wert)}
              >
                {wert === 'alle' ? `Alle ${personen.length}` : `${STATUS_TEXT[wert]} ${anzahl[wert]}`}
              </button>
            ))}
          </div>
        </div>

        <ul>
          {gefiltert.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className={entwurf?.id === person.id ? 'eintrag aktiv' : 'eintrag'}
                onClick={() => void auswaehlen(person)}
              >
                <span className="kuerzel">{person.kuerzel ?? kuerzelAus(person)}</span>
                <span className="name">
                  {personName(person)}
                </span>
                {person.status !== 'mitglied' && (
                  <span className="marke">{STATUS_TEXT[person.status]}</span>
                )}
              </button>
            </li>
          ))}
          {gefiltert.length === 0 && <li className="hinweis">Keine Person gefunden.</li>}
        </ul>

        {darfAendern && (
          <div className="listenfuss">
            <button type="button" onClick={neu}>
              Person anlegen
            </button>
          </div>
        )}
      </aside>

      <section className="bearbeiten">
        {!entwurf ? (
          <>
            {meldung && <p className="meldung">{meldung}</p>}
            {fehler && <p className="fehler">{fehler}</p>}
            <p className="hinweis">Links eine Person auswählen oder eine neue anlegen.</p>
          </>
        ) : (
          <>
            <div className="bearbeitenkopf">
              <h2>
                {entwurf.id
                  ? `${entwurf.vorname} ${entwurf.nachname}`.trim()
                  : 'Neue Person'}
              </h2>
              {darfAendern && (
                <button type="button" onClick={() => void speichern()}>
                  Speichern
                </button>
              )}
            </div>

            <div className="felder">
              <Feld beschriftung="Vorname">
                <input
                  value={entwurf.vorname}
                  disabled={!darfAendern}
                  onChange={(e) => setEntwurf({ ...entwurf, vorname: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Nachname">
                <input
                  value={entwurf.nachname}
                  disabled={!darfAendern}
                  onChange={(e) => setEntwurf({ ...entwurf, nachname: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Anzeigename">
                <input
                  value={entwurf.anzeigename ?? ''}
                  disabled={!darfAendern}
                  onChange={(e) => setEntwurf({ ...entwurf, anzeigename: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Kürzel">
                <input
                  value={entwurf.kuerzel ?? ''}
                  maxLength={4}
                  disabled={!darfAendern}
                  onChange={(e) => setEntwurf({ ...entwurf, kuerzel: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Status">
                <select
                  value={entwurf.status}
                  disabled={!darfAendern}
                  onChange={(e) =>
                    setEntwurf({ ...entwurf, status: e.target.value as PersonenStatus })
                  }
                >
                  <option value="mitglied">Mitglied</option>
                  <option value="gast">Gast</option>
                  <option value="ausgetreten">Ausgetreten</option>
                </select>
              </Feld>
            </div>

            <label className="ankreuz">
              <input
                type="checkbox"
                checked={entwurf.name_oeffentlich}
                disabled={!darfAendern}
                onChange={(e) => setEntwurf({ ...entwurf, name_oeffentlich: e.target.checked })}
              />
              <span>
                Name darf öffentlich erscheinen
                <small>Ohne Haken steht in Live-Anzeige und TV nur das Kürzel.</small>
              </span>
            </label>

            {darfSehen && (
              <fieldset className="geschuetzt">
                <legend>Nur für Sportwart und Vereins-Administrator</legend>
                <div className="felder">
                  <Feld beschriftung="Eintritt">
                    <input
                      type="date"
                      value={intern.eintritt ?? ''}
                      disabled={!darfAendern}
                      onChange={(e) => setIntern({ ...intern, eintritt: e.target.value || null })}
                    />
                  </Feld>
                  <Feld beschriftung="Austritt">
                    <input
                      type="date"
                      value={intern.austritt ?? ''}
                      disabled={!darfAendern}
                      onChange={(e) => setIntern({ ...intern, austritt: e.target.value || null })}
                    />
                  </Feld>
                  <Feld beschriftung="Rating-Startwert">
                    <input
                      type="number"
                      min={100}
                      max={1000}
                      placeholder="500"
                      value={intern.rating_startwert ?? ''}
                      disabled={!darfAendern}
                      onChange={(e) =>
                        setIntern({
                          ...intern,
                          rating_startwert: e.target.value ? Number(e.target.value) : null
                        })
                      }
                    />
                  </Feld>
                  <Feld beschriftung="Pass-Nr. (BLVN)">
                    <input
                      value={intern.passnummer ?? ''}
                      disabled={!darfAendern}
                      onChange={(e) => setIntern({ ...intern, passnummer: e.target.value || null })}
                    />
                  </Feld>
                  <Feld beschriftung="DBU-Nr.">
                    <input
                      value={intern.dbu_nummer ?? ''}
                      disabled={!darfAendern}
                      onChange={(e) => setIntern({ ...intern, dbu_nummer: e.target.value || null })}
                    />
                  </Feld>
                </div>
                <label className="ankreuz">
                  <input
                    type="checkbox"
                    checked={intern.minderjaehrig}
                    disabled={!darfAendern}
                    onChange={(e) => setIntern({ ...intern, minderjaehrig: e.target.checked })}
                  />
                  <span>Minderjährig</span>
                </label>
                <Feld beschriftung="Notiz">
                  <input
                    value={intern.notiz ?? ''}
                    disabled={!darfAendern}
                    onChange={(e) => setIntern({ ...intern, notiz: e.target.value || null })}
                  />
                </Feld>
              </fieldset>
            )}

            {darfAendern && entwurf.id && (
              <div className="knopfpaar">
                <button type="button" className="gefahrknopf" onClick={() => void personLoeschen()}>
                  Person löschen
                </button>
                <span className="hinweis">
                  Möglich, solange keine Partien, Turnierteilnahmen oder 14.1-Aufnahmen vorliegen. Sonst bleibt die
                  Person erhalten und wird auf „Ausgetreten“ gesetzt, damit Ergebnisse und Rating stimmig bleiben.
                </span>
              </div>
            )}

            {fehler && <p className="fehler">{fehler}</p>}
            {meldung && <p className="meldung">{meldung}</p>}
          </>
        )}
      </section>
      {rueckfrage}
    </div>
  );
}

function Feld({ beschriftung, children }: { beschriftung: string; children: React.ReactNode }) {
  return (
    <label className="feld">
      <span>{beschriftung}</span>
      {children}
    </label>
  );
}

