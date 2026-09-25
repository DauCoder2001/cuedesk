import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { ANWENDUNGSADRESSE } from '../adresse';
import { funktionsFehlerText } from '../funktionsfehler';
import { useSitzung } from '../sitzung';
import type { Benutzer, Person, Rolle } from '../datenbank.types';

type Konto = Benutzer & {
  rollen: Rolle[];
  person_id: string | null;
  darf_einladen: boolean;
};

const ROLLEN: { wert: Rolle; name: string; erklaerung: string }[] = [
  { wert: 'vereinsadmin', name: 'Vereins-Administrator', erklaerung: 'Benutzer, Rollen, Geräte, Löschen' },
  { wert: 'sportwart', name: 'Sportwart', erklaerung: 'Spieler, Serien, Rating' },
  { wert: 'turnierleiter', name: 'Turnierleiter', erklaerung: 'Turniere, Auslosung, Ergebnisse' },
  { wert: 'mitglied', name: 'Mitglied', erklaerung: 'Eigene Statistik, Ranglisten' }
];

export default function BenutzerRollen() {
  const { verein, benutzer: ichSelbst, darf } = useSitzung();
  const darfVerwalten = darf('vereinsadmin');

  const [konten, setKonten] = useState<Konto[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [darfEinladen, setDarfEinladen] = useState(false);
  const [zeigeEinladung, setZeigeEinladung] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [entziehenBestaetigen, setEntziehenBestaetigen] = useState(false);

  // Formular fuer die Einladung
  const [email, setEmail] = useState('');
  const [einladungsRollen, setEinladungsRollen] = useState<Rolle[]>(['mitglied']);
  const [personWahl, setPersonWahl] = useState<string>('');
  const [neuVorname, setNeuVorname] = useState('');
  const [neuNachname, setNeuNachname] = useState('');
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (!verein) return;
    void laden();
    void supabase
      .rpc('darf_einladen', { p_verein: verein.id })
      .then(({ data }) => setDarfEinladen(Boolean(data)));
  }, [verein]);

  async function laden() {
    if (!verein) return;
    const [rollenAntwort, personenAntwort, rechteAntwort, verknuepfungAntwort] = await Promise.all([
      supabase.from('benutzer_rollen').select('benutzer_id, rolle').eq('verein_id', verein.id),
      supabase.from('personen').select('*').eq('verein_id', verein.id).order('nachname'),
      supabase.from('benutzer_rechte').select('*').eq('verein_id', verein.id),
      supabase.from('benutzer_personen').select('benutzer_id, person_id').eq('verein_id', verein.id)
    ]);

    if (rollenAntwort.error) {
      setFehler(rollenAntwort.error.message);
      return;
    }

    const ids = [...new Set((rollenAntwort.data ?? []).map((zeile) => zeile.benutzer_id))];
    const kontenAntwort = ids.length
      ? await supabase.from('benutzer').select('*').in('id', ids)
      : { data: [], error: null };

    const liste: Konto[] = (kontenAntwort.data ?? []).map((konto) => ({
      ...konto,
      rollen: (rollenAntwort.data ?? [])
        .filter((zeile) => zeile.benutzer_id === konto.id)
        .map((zeile) => zeile.rolle),
      person_id:
        (verknuepfungAntwort.data ?? []).find((zeile) => zeile.benutzer_id === konto.id)?.person_id ??
        null,
      darf_einladen:
        (rechteAntwort.data ?? []).find((zeile) => zeile.benutzer_id === konto.id)?.darf_einladen ??
        false
    }));

    liste.sort((a, b) => (a.anzeigename ?? a.email ?? '').localeCompare(b.anzeigename ?? b.email ?? ''));
    setKonten(liste);
    setPersonen(personenAntwort.data ?? []);
  }

  const konto = useMemo(() => konten.find((eintrag) => eintrag.id === gewaehlt) ?? null, [konten, gewaehlt]);

  async function rolleUmschalten(rolle: Rolle, an: boolean) {
    if (!verein || !konto) return;
    setFehler(null);
    setMeldung(null);
    const { error } = an
      ? await supabase
          .from('benutzer_rollen')
          .insert({ benutzer_id: konto.id, verein_id: verein.id, rolle })
      : await supabase
          .from('benutzer_rollen')
          .delete()
          .eq('benutzer_id', konto.id)
          .eq('verein_id', verein.id)
          .eq('rolle', rolle);
    if (error) {
      setFehler(error.message);
      return;
    }
    await laden();
  }

  async function einladungsrechtUmschalten(an: boolean) {
    if (!verein || !konto) return;
    const { error } = await supabase
      .from('benutzer_rechte')
      .upsert({ benutzer_id: konto.id, verein_id: verein.id, darf_einladen: an });
    if (error) {
      setFehler(error.message);
      return;
    }
    await laden();
  }

  async function personVerknuepfen(personId: string) {
    if (!verein || !konto) return;
    const { error } = personId
      ? await supabase
          .from('benutzer_personen')
          .upsert({ benutzer_id: konto.id, verein_id: verein.id, person_id: personId })
      : await supabase
          .from('benutzer_personen')
          .delete()
          .eq('benutzer_id', konto.id)
          .eq('verein_id', verein.id);
    if (error) {
      setFehler(error.message);
      return;
    }
    setMeldung('Gespeichert.');
    await laden();
  }

  async function zugangEntziehen() {
    if (!verein || !konto) return;
    const { error } = await supabase
      .from('benutzer_rollen')
      .delete()
      .eq('benutzer_id', konto.id)
      .eq('verein_id', verein.id);
    if (error) {
      setFehler(error.message);
      return;
    }
    setGewaehlt(null);
    setEntziehenBestaetigen(false);
    await laden();
  }

  async function erneutSchicken(adresse: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: { shouldCreateUser: false, emailRedirectTo: ANWENDUNGSADRESSE }
    });
    setFehler(error ? error.message : null);
    setMeldung(error ? null : 'Anmeldelink erneut verschickt.');
  }

  async function einladen() {
    if (!verein) return;
    setFehler(null);
    setMeldung(null);
    const adresse = email.trim().toLowerCase();
    if (!adresse.includes('@')) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    const legtNeuAn = personWahl === 'neu';
    if (legtNeuAn && (!neuVorname.trim() || !neuNachname.trim())) {
      setFehler('Für einen neuen Spieler sind Vorname und Nachname nötig.');
      return;
    }

    setSendet(true);
    const { data, error } = await supabase.functions.invoke('einladung', {
      body: {
        verein_id: verein.id,
        email: adresse,
        rollen: einladungsRollen,
        person_id: legtNeuAn || !personWahl ? null : personWahl,
        neue_person: legtNeuAn
          ? { vorname: neuVorname.trim(), nachname: neuNachname.trim() }
          : null,
        weiterleitung: ANWENDUNGSADRESSE
      }
    });
    setSendet(false);

    if (error) {
      setFehler(await funktionsFehlerText(error));
      return;
    }
    if (data?.fehler) {
      setFehler(data.fehler);
      return;
    }
    setMeldung(data?.meldung ?? 'Einladung verschickt.');
    setEmail('');
    setNeuVorname('');
    setNeuNachname('');
    setPersonWahl('');
    setEinladungsRollen(['mitglied']);
    setZeigeEinladung(false);
    await laden();
  }

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;
  if (!darfVerwalten && !darfEinladen) {
    return <p className="hinweis">Für diesen Bereich fehlen dir die Rechte.</p>;
  }

  const freiePersonen = personen.filter(
    (person) => !konten.some((eintrag) => eintrag.person_id === person.id)
  );

  return (
    <div className="zweispaltig">
      <aside className="liste">
        <div className="listenkopf">
          <span className="hinweis">Konten</span>
        </div>
        <ul>
          {konten.map((eintrag) => (
            <li key={eintrag.id}>
              <button
                type="button"
                className={gewaehlt === eintrag.id ? 'eintrag aktiv' : 'eintrag'}
                onClick={() => {
                  setGewaehlt(eintrag.id);
                  setMeldung(null);
                  setFehler(null);
                }}
              >
                <span className="kuerzel">{zeichen(eintrag)}</span>
                <span className="name">
                  {eintrag.anzeigename ?? eintrag.email}
                  <small>{rollenText(eintrag.rollen)}</small>
                </span>
                {!eintrag.angemeldet_am && <span className="marke">eingeladen</span>}
              </button>
            </li>
          ))}
          {konten.length === 0 && <li className="hinweis">Noch keine Konten.</li>}
        </ul>
        {darfEinladen && (
          <div className="listenfuss">
            <button type="button" title={zeigeEinladung ? 'Das Einladungsformular schließen' : 'Jemanden per E-Mail zu CueDesk einladen'} onClick={() => setZeigeEinladung((wert) => !wert)}>
              {zeigeEinladung ? 'Einladen abbrechen' : 'Einladen'}
            </button>
          </div>
        )}
      </aside>

      <section className="bearbeiten">
        {zeigeEinladung ? (
          <>
            <div className="bearbeitenkopf">
              <h2>Einladen</h2>
              <button type="button" title="Schickt eine Einladung mit Anmeldelink an diese Adresse." onClick={() => void einladen()} disabled={sendet}>
                {sendet ? 'Wird verschickt' : 'Einladung schicken'}
              </button>
            </div>

            <div className="felder">
              <label className="feld">
                <span>E-Mail-Adresse</span>
                <input
                  type="email"
                  value={email}
                  placeholder="name@beispiel.de"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="feld">
                <span>Spieler zuordnen</span>
                <select value={personWahl} onChange={(e) => setPersonWahl(e.target.value)}>
                  <option value="">— keine —</option>
                  <option value="neu">— neuen Spieler anlegen —</option>
                  {freiePersonen.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.nachname}, {person.vorname}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {personWahl === 'neu' && (
              <div className="felder">
                <label className="feld">
                  <span>Vorname</span>
                  <input value={neuVorname} onChange={(e) => setNeuVorname(e.target.value)} />
                </label>
                <label className="feld">
                  <span>Nachname</span>
                  <input value={neuNachname} onChange={(e) => setNeuNachname(e.target.value)} />
                </label>
              </div>
            )}

            <div>
              <div className="feldkopf">Rollen</div>
              <div className="rollenraster">
                {ROLLEN.map((rolle) => {
                  const erlaubt = darfVerwalten || rolle.wert === 'mitglied';
                  const an = einladungsRollen.includes(rolle.wert);
                  return (
                    <label key={rolle.wert} className={an ? 'rolle an' : 'rolle'}>
                      <input
                        type="checkbox"
                        checked={an}
                        disabled={!erlaubt}
                        onChange={(e) =>
                          setEinladungsRollen((bisher) =>
                            e.target.checked
                              ? [...bisher, rolle.wert]
                              : bisher.filter((wert) => wert !== rolle.wert)
                          )
                        }
                      />
                      <span>
                        {rolle.name}
                        <small>{rolle.erklaerung}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
              {!darfVerwalten && (
                <p className="hinweis">
                  Du darfst einladen, aber nur mit der Rolle Mitglied. Weitere Rollen vergibt der
                  Vereins-Administrator.
                </p>
              )}
            </div>

            {fehler && <p className="fehler">{fehler}</p>}
            {meldung && <p className="meldung">{meldung}</p>}
          </>
        ) : !konto ? (
          <p className="hinweis">Links ein Konto auswählen.</p>
        ) : (
          <>
            <div className="bearbeitenkopf">
              <h2>{konto.anzeigename ?? konto.email}</h2>
              {!konto.angemeldet_am && konto.email && (
                <button type="button" title="Schickt den Anmeldelink noch einmal an diese Adresse." onClick={() => void erneutSchicken(konto.email!)}>
                  Link erneut schicken
                </button>
              )}
            </div>
            <p className="hinweis">
              {konto.email}
              {konto.angemeldet_am
                ? ` · zuletzt angemeldet ${new Date(konto.angemeldet_am).toLocaleDateString('de-DE')}`
                : ' · noch nie angemeldet'}
            </p>
            {konto.systemadmin && (
              <p className="hinweis" title="Gilt für ganz CueDesk, nicht nur für diesen Verein">
                Super-Admin von CueDesk – verwaltet in der Konsole, nicht hier.
              </p>
            )}

            <div>
              <div className="feldkopf">Rollen im Verein</div>
              <div className="rollenraster">
                {ROLLEN.map((rolle) => {
                  const an = konto.rollen.includes(rolle.wert);
                  const selbstsperre =
                    rolle.wert === 'vereinsadmin' && konto.id === ichSelbst?.id && an;
                  return (
                    <label key={rolle.wert} className={an ? 'rolle an' : 'rolle'}>
                      <input
                        type="checkbox"
                        checked={an}
                        disabled={!darfVerwalten || selbstsperre}
                        onChange={(e) => void rolleUmschalten(rolle.wert, e.target.checked)}
                      />
                      <span>
                        {rolle.name}
                        <small>
                          {selbstsperre ? 'Kann man sich nicht selbst entziehen' : rolle.erklaerung}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {darfVerwalten && (
              <label className="ankreuz">
                <input
                  type="checkbox"
                  checked={konto.darf_einladen}
                  onChange={(e) => void einladungsrechtUmschalten(e.target.checked)}
                />
                <span>
                  Darf einladen
                  <small>
                    Für Vorstandsmitglieder und ausgewählte Personen. Sie laden nur mit der Rolle
                    Mitglied ein. Vereins-Administrator und Sportwart dürfen ohnehin.
                  </small>
                </span>
              </label>
            )}

            <label className="feld">
              <span>Verknüpfter Spieler</span>
              <select
                value={konto.person_id ?? ''}
                disabled={!darfVerwalten}
                onChange={(e) => void personVerknuepfen(e.target.value)}
              >
                <option value="">— keine —</option>
                {personen
                  .filter(
                    (person) =>
                      person.id === konto.person_id ||
                      !konten.some((eintrag) => eintrag.person_id === person.id)
                  )
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.nachname}, {person.vorname}
                    </option>
                  ))}
              </select>
            </label>

            {darfVerwalten && konto.id !== ichSelbst?.id && (
              <div className="gefahr">
                <div>
                  Zugang entziehen
                  <small>
                    {entziehenBestaetigen
                      ? 'Wirklich alle Rollen entfernen? Spieler und Ergebnisse bleiben.'
                      : 'Alle Rollen werden entfernt. Spieler und Ergebnisse bleiben.'}
                  </small>
                </div>
                {entziehenBestaetigen ? (
                  <div className="knopfpaar">
                    <button type="button" onClick={() => setEntziehenBestaetigen(false)}>
                      Abbrechen
                    </button>
                    <button type="button" title="Entfernt alle Rollen dieses Kontos. Spieler und Ergebnisse bleiben." onClick={() => void zugangEntziehen()}>
                      Ja, entziehen
                    </button>
                  </div>
                ) : (
                  <button type="button" title="Diesem Konto den Zugang zum Verein entziehen. Es folgt eine Rückfrage." onClick={() => setEntziehenBestaetigen(true)}>
                    Entziehen
                  </button>
                )}
              </div>
            )}

            {fehler && <p className="fehler">{fehler}</p>}
            {meldung && <p className="meldung">{meldung}</p>}
          </>
        )}
      </section>
    </div>
  );
}

function zeichen(konto: Konto) {
  const quelle = konto.anzeigename ?? konto.email ?? '?';
  const teile = quelle.split(/[\s.@]+/).filter(Boolean);
  return (teile[0]?.charAt(0) ?? '?').toUpperCase() + (teile[1]?.charAt(0) ?? '').toUpperCase();
}

function rollenText(rollen: Rolle[]) {
  if (rollen.length === 0) return 'keine Rolle';
  return ROLLEN.filter((rolle) => rollen.includes(rolle.wert))
    .map((rolle) => rolle.name)
    .join(', ');
}
