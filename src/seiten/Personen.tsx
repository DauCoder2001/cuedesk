import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import type { Person, PersonIntern, PersonenStatus } from '../datenbank.types';
import { personName, kuerzelAus } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import { Pflichthinweis, usePflicht } from '../pflicht';
import { useUngespeichert, weichtAb } from '../ungespeichert';
import AuskunftKnoepfe from './AuskunftKnoepfe';

type Entwurf = Omit<Person, 'id' | 'erstellt_am' | 'geaendert_am'> & { id: string | null };
type EntwurfIntern = Omit<PersonIntern, 'person_id' | 'verein_id'>;
type Bindung = { partien: number; teilnahmen: number; aufnahmen: number; konten: string[] };

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
  // Anonymisieren ist nicht umkehrbar, deshalb nur der Vereins-Administrator
  const darfAnonymisieren = darf('vereinsadmin');

  const [personen, setPersonen] = useState<Person[]>([]);
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<PersonenStatus | 'alle'>('alle');
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [intern, setIntern] = useState<EntwurfIntern>(LEER_INTERN);
  // Was am offenen Spieler haengt: entscheidet zwischen Loeschen und Anonymisieren
  const [bindung, setBindung] = useState<Bindung | null>(null);
  // Anonymisierte Spieler tragen einen Platzhalter und bleiben unveraenderlich
  const bearbeitbar = darfAendern && !entwurf?.anonymisiert_am;
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const pflicht = usePflicht<HTMLElement>();
  // Gespeicherter Stand des offenen Spielers, zum Vergleich mit den Eingaben
  const [ursprung, setUrsprung] = useState<unknown>(null);
  const eingetippt = entwurf ? `${entwurf.vorname} ${entwurf.nachname}`.trim() : '';
  const wechselErlaubt = useUngespeichert(
    'personen',
    entwurf !== null && darfAendern && weichtAb({ entwurf, intern }, ursprung),
    entwurf?.id ? `„${eingetippt}“` : eingetippt ? `Der neue Spieler „${eingetippt}“` : 'Der neue Spieler',
    () => speichern()
  );

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
    if (entwurf?.id === person.id) return;
    if (!(await wechselErlaubt())) return;
    pflicht.zuruecksetzen();
    setMeldung(null);
    setFehler(null);
    setEntwurf({ ...person });
    setIntern(LEER_INTERN);
    setBindung(null);
    setUrsprung({ entwurf: { ...person }, intern: LEER_INTERN });
    if (darfAendern && !person.anonymisiert_am) void bindungLaden(person.id).then((b) => setBindung(b));
    if (!darfSehen) return;
    const { data } = await supabase
      .from('personen_intern')
      .select('*')
      .eq('person_id', person.id)
      .maybeSingle();
    if (data) {
      const { person_id: _p, verein_id: _v, ...rest } = data;
      setIntern(rest);
      setUrsprung({ entwurf: { ...person }, intern: rest });
    }
  }

  async function neu() {
    if (!verein) return;
    if (!(await wechselErlaubt())) return;
    pflicht.zuruecksetzen();
    setMeldung(null);
    setFehler(null);
    setIntern(LEER_INTERN);
    const leer: Entwurf = {
      id: null,
      verein_id: verein.id,
      vorname: '',
      nachname: '',
      anzeigename: null,
      kuerzel: null,
      status: 'mitglied',
      name_oeffentlich: false,
      rating_ausgeblendet: false,
      anonymisiert_am: null
    };
    setEntwurf(leer);
    setUrsprung({ entwurf: leer, intern: LEER_INTERN });
  }

  async function speichern() {
    if (!entwurf || !verein) return;
    if (!pflicht.pruefen()) return;
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
    setUrsprung({ entwurf: { ...data }, intern });
    setMeldung('Gespeichert.');
    await laden(verein.id);
    return true;
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

  // Partien, Turnierteilnahmen, 14.1-Aufnahmen und verknuepfte Konten eines Spielers
  async function bindungLaden(id: string): Promise<Bindung> {
    const [partienAntwort, teilnahmeAntwort, aufnahmeAntwort, kontoAntwort] = await Promise.all([
      supabase.from('partien').select('id', { count: 'exact', head: true }).or(`spieler_a.eq.${id},spieler_b.eq.${id}`),
      supabase.from('turnier_teilnehmer').select('person_id', { count: 'exact', head: true }).eq('person_id', id),
      supabase.from('aufnahmen_141').select('partie_id', { count: 'exact', head: true }).eq('spieler', id),
      supabase.from('benutzer_personen').select('benutzer_id').eq('person_id', id)
    ]);
    const kontoIds = (kontoAntwort.data ?? []).map((z) => z.benutzer_id);
    let konten: string[] = [];
    if (kontoIds.length > 0) {
      const { data } = await supabase.from('benutzer').select('email').in('id', kontoIds);
      konten = (data ?? []).map((b) => b.email ?? 'ohne E-Mail');
    }
    return {
      partien: partienAntwort.count ?? 0,
      teilnahmen: teilnahmeAntwort.count ?? 0,
      aufnahmen: aufnahmeAntwort.count ?? 0,
      konten
    };
  }
  const hatErgebnisse = (b: Bindung | null) => !!b && b.partien + b.teilnahmen + b.aufnahmen > 0;

  // Eine Person wird nur geloescht, wenn nichts an ihr haengt. Ergebnisse
  // duerfen nicht verschwinden, deshalb gibt es sonst "Ausgetreten" oder,
  // fuer den Vereins-Administrator, "Anonymisieren".
  async function personLoeschen() {
    if (!verein || !entwurf?.id) return;
    const id = entwurf.id;
    const name = personName(entwurf as unknown as Person);
    setFehler(null);
    setMeldung(null);

    const { partien, teilnahmen, aufnahmen } = await bindungLaden(id);

    if (partien + teilnahmen + aufnahmen > 0) {
      const teile = [
        partien > 0 ? `${partien} Partien` : null,
        teilnahmen > 0 ? `${teilnahmen} Turnierteilnahmen` : null,
        aufnahmen > 0 ? `${aufnahmen} 14.1-Aufnahmen` : null
      ].filter(Boolean);
      const frage =
        `${name} kann nicht gelöscht werden: ${teile.join(', ')} hängen daran.\n\n` +
        'Stattdessen auf „Ausgetreten“ setzen? Der Spieler verschwindet dann aus Auswahllisten und Ranglisten, ' +
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

  // Name und vertrauliche Angaben entfernen, Ergebnisse behalten (Stufe 20,
  // Funktion person_anonymisieren). Nicht umkehrbar.
  async function anonymisieren() {
    if (!verein || !entwurf?.id) return;
    const id = entwurf.id;
    const name = personName(entwurf as unknown as Person);
    setFehler(null);
    setMeldung(null);
    const b = await bindungLaden(id);
    const bleibt = [
      b.partien > 0 ? `${b.partien} ${b.partien === 1 ? 'Partie' : 'Partien'}` : null,
      b.teilnahmen > 0 ? `${b.teilnahmen} ${b.teilnahmen === 1 ? 'Turnierteilnahme' : 'Turnierteilnahmen'}` : null,
      b.aufnahmen > 0 ? 'das 14.1-Protokoll (ohne Namen)' : null
    ].filter(Boolean);
    const frage =
      `${name} anonymisieren? Das lässt sich nicht rückgängig machen.\n\n` +
      '• Der Name wird zu „Ehemaliger Spieler …“.\n' +
      '• Gelöscht werden Kürzel, Anzeigename, Ein- und Austritt, Pass- und DBU-Nummer, Notiz, Turnier-Anmeldungen und Einladungen, dazu die Einträge im Änderungsprotokoll, die den Namen enthalten.\n' +
      (b.konten.length > 0
        ? `• Die Verknüpfung mit dem Konto ${b.konten.join(', ')} wird gelöst, seine Rollen in diesem Verein enden. Hat es in keinem anderen Verein eine Rolle, wird es gelöscht.\n`
        : '') +
      `• Erhalten bleiben: ${bleibt.join(', ')}.\n\n` +
      'Schon erzeugte PDFs, Aushänge und geteilte Texte kann CueDesk nicht ändern. In den Sicherungen verschwindet der Name nach spätestens 12 Wochen.';
    if (!(await fragen(frage, 'Anonymisieren'))) return;
    const { data: platzhalter, error } = await supabase.rpc('person_anonymisieren', { p_person: id });
    if (error) return setFehler(error.message);
    const { data } = await supabase.from('personen').select('*').eq('id', id).single();
    if (data) {
      setEntwurf({ ...data });
      setUrsprung({ entwurf: { ...data }, intern: LEER_INTERN });
    }
    setIntern(LEER_INTERN);
    setBindung(null);
    setMeldung(`${name} ist jetzt „${platzhalter}“. Die Ergebnisse bleiben erhalten.`);
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
                title={wert === 'alle' ? 'Alle Spieler zeigen' : `Nur Spieler mit Status „${STATUS_TEXT[wert]}“ zeigen`}
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
                  <span className="marke">{person.anonymisiert_am ? 'anonymisiert' : STATUS_TEXT[person.status]}</span>
                )}
              </button>
            </li>
          ))}
          {gefiltert.length === 0 && <li className="hinweis">Kein Spieler gefunden.</li>}
        </ul>

        {darfAendern && (
          <div className="listenfuss">
            <button type="button" title="Einen neuen Spieler anlegen" onClick={() => void neu()}>
              Spieler anlegen
            </button>
          </div>
        )}
      </aside>

      <section className="bearbeiten" ref={pflicht.bereich}>
        {!entwurf ? (
          <>
            {meldung && <p className="meldung">{meldung}</p>}
            {fehler && <p className="fehler">{fehler}</p>}
            <p className="hinweis">Links einen Spieler auswählen oder einen neuen anlegen.</p>
          </>
        ) : (
          <>
            <div className="bearbeitenkopf">
              <h2>
                {entwurf.id
                  ? `${entwurf.vorname} ${entwurf.nachname}`.trim()
                  : 'Neuer Spieler'}
              </h2>
              {bearbeitbar && (
                <div className="knopfpaar">
                  <Pflichthinweis hinweis={pflicht.hinweis} />
                  <button type="button" title="Änderungen an diesem Spieler speichern" onClick={() => void speichern()}>
                    Speichern
                  </button>
                </div>
              )}
            </div>

            <div className="felder">
              <Feld beschriftung="Vorname">
                <input
                  required={bearbeitbar}
                  value={entwurf.vorname}
                  disabled={!bearbeitbar}
                  onChange={(e) => setEntwurf({ ...entwurf, vorname: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Nachname">
                <input
                  required={bearbeitbar}
                  value={entwurf.nachname}
                  disabled={!bearbeitbar}
                  onChange={(e) => setEntwurf({ ...entwurf, nachname: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Anzeigename">
                <input
                  value={entwurf.anzeigename ?? ''}
                  disabled={!bearbeitbar}
                  onChange={(e) => setEntwurf({ ...entwurf, anzeigename: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Kürzel">
                <input
                  value={entwurf.kuerzel ?? ''}
                  maxLength={4}
                  disabled={!bearbeitbar}
                  onChange={(e) => setEntwurf({ ...entwurf, kuerzel: e.target.value })}
                />
              </Feld>
              <Feld beschriftung="Status">
                <select
                  value={entwurf.status}
                  disabled={!bearbeitbar}
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
                disabled={!bearbeitbar}
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
                      disabled={!bearbeitbar}
                      onChange={(e) => setIntern({ ...intern, eintritt: e.target.value || null })}
                    />
                  </Feld>
                  <Feld beschriftung="Austritt">
                    <input
                      type="date"
                      value={intern.austritt ?? ''}
                      disabled={!bearbeitbar}
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
                      disabled={!bearbeitbar}
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
                      disabled={!bearbeitbar}
                      onChange={(e) => setIntern({ ...intern, passnummer: e.target.value || null })}
                    />
                  </Feld>
                  <Feld beschriftung="DBU-Nr.">
                    <input
                      value={intern.dbu_nummer ?? ''}
                      disabled={!bearbeitbar}
                      onChange={(e) => setIntern({ ...intern, dbu_nummer: e.target.value || null })}
                    />
                  </Feld>
                </div>
                <label className="ankreuz">
                  <input
                    type="checkbox"
                    checked={intern.minderjaehrig}
                    disabled={!bearbeitbar}
                    onChange={(e) => setIntern({ ...intern, minderjaehrig: e.target.checked })}
                  />
                  <span>Minderjährig</span>
                </label>
                <Feld beschriftung="Notiz">
                  <input
                    value={intern.notiz ?? ''}
                    disabled={!bearbeitbar}
                    onChange={(e) => setIntern({ ...intern, notiz: e.target.value || null })}
                  />
                </Feld>
              </fieldset>
            )}

            {entwurf.anonymisiert_am && (
              <p className="hinweis">
                Anonymisiert am {new Date(entwurf.anonymisiert_am).toLocaleDateString('de-DE')}: Name, Kürzel und
                vertrauliche Angaben wurden entfernt, die Ergebnisse bleiben erhalten. Der Eintrag lässt sich nicht
                mehr bearbeiten.
              </p>
            )}

            {bearbeitbar && entwurf.id && (
              <div className="knopfpaar">
                <button type="button" title="Löscht den Spieler. Hat er schon Partien, bleibt er erhalten und wird auf „Ausgetreten“ gesetzt." className="gefahrknopf" onClick={() => void personLoeschen()}>
                  Spieler löschen
                </button>
                {darfAnonymisieren && hatErgebnisse(bindung) && (
                  <button
                    type="button"
                    title="Entfernt Name, Kürzel und vertrauliche Angaben; Ergebnisse, Platzierungen und Rating der Gegner bleiben erhalten. Nicht umkehrbar."
                    className="gefahrknopf"
                    onClick={() => void anonymisieren()}
                  >
                    Anonymisieren
                  </button>
                )}
                <span className="hinweis">
                  {hatErgebnisse(bindung)
                    ? darfAnonymisieren
                      ? 'An diesem Spieler hängen Ergebnisse. „Spieler löschen“ setzt ihn auf „Ausgetreten“; „Anonymisieren“ entfernt zusätzlich Name und vertrauliche Angaben, die Ergebnisse bleiben.'
                      : 'An diesem Spieler hängen Ergebnisse. „Spieler löschen“ setzt ihn auf „Ausgetreten“; anonymisieren kann nur der Vereins-Administrator.'
                    : 'Möglich, solange keine Partien, Turnierteilnahmen oder 14.1-Aufnahmen vorliegen. Sonst bleibt der Spieler erhalten und wird auf „Ausgetreten“ gesetzt, damit Ergebnisse und Rating stimmig bleiben.'}
                </span>
              </div>
            )}

            {darfAendern && entwurf.id && !entwurf.anonymisiert_am && (
              <AuskunftKnoepfe personId={entwurf.id} beschriftung="Auskunft über alle gespeicherten Daten (Art. 15/20 DSGVO):" />
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

