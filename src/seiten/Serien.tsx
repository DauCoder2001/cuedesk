import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import { herunterladen } from '../pdf';
import { serienwertung } from '../serien';
import { serienDateiname, serienPdf } from '../serienbericht';
import { DISZIPLIN_TEXT } from './Turniere';
import type { SerienTurnier } from '../serien';
import type { Disziplin, Person, Serie, Turnier } from '../datenbank.types';

// Serienwertung: Punkte aus den Platzierungen der Turniere einer Serie.
// Gerechnet wird beim Anzeigen, gespeichert wird nichts. Sportwart und
// Vereins-Admin legen Serien an, aendern sie und ordnen Turniere zu.

type Teilnahme = { turnier_id: string; person_id: string; endplatz: number | null };
type Formular = {
  id: string | null; // null: neue Serie
  name: string;
  saison: string;
  disziplin: Disziplin;
  streicher: string;
  bonus: string;
  aktiv: boolean;
};

const DATUM = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function Serien() {
  const { verein, darf } = useSitzung();
  const darfVerwalten = darf('vereinsadmin', 'sportwart');

  const [serien, setSerien] = useState<Serie[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [alleTurniere, setAlleTurniere] = useState<Turnier[]>([]);
  const [teilnahmen, setTeilnahmen] = useState<Teilnahme[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [formular, setFormular] = useState<Formular | null>(null);
  const [zuordnen, setZuordnen] = useState('');
  const [rueckfrage, fragen] = useRueckfrage();

  const serienLaden = useCallback(async () => {
    if (!verein) return;
    const { data, error } = await supabase
      .from('serien')
      .select('*')
      .eq('verein_id', verein.id)
      .order('aktiv', { ascending: false })
      .order('saison', { ascending: false })
      .order('name');
    if (error) return setFehler(error.message);
    setSerien(data ?? []);
    setGewaehlt((bisher) => (bisher && data?.some((s) => s.id === bisher) ? bisher : data?.[0]?.id ?? null));
  }, [verein]);

  useEffect(() => {
    void serienLaden();
  }, [serienLaden]);

  const ladeSerie = useCallback(async () => {
    if (!verein) return;
    const [{ data: turnierdaten }, { data: personendaten }] = await Promise.all([
      supabase.from('turniere').select('*').eq('verein_id', verein.id).order('datum'),
      supabase.from('personen').select('*').eq('verein_id', verein.id)
    ]);
    // Gewertet werden nur beendete Turniere, laufende haben noch keine Endplaetze
    const ids = (turnierdaten ?? []).filter((t) => t.serie_id === gewaehlt && t.status === 'beendet').map((t) => t.id);
    const { data: teilnahmedaten } = ids.length
      ? await supabase.from('turnier_teilnehmer').select('turnier_id, person_id, endplatz').in('turnier_id', ids)
      : { data: [] as Teilnahme[] };
    setAlleTurniere(turnierdaten ?? []);
    setTeilnahmen((teilnahmedaten ?? []) as Teilnahme[]);
    setPersonen(personendaten ?? []);
  }, [verein, gewaehlt]);

  useEffect(() => {
    void ladeSerie();
  }, [ladeSerie]);

  const namen = useMemo(() => {
    const map = new Map<string, string>();
    personen.forEach((person) => map.set(person.id, personName(person)));
    return map;
  }, [personen]);

  const serie = serien.find((eintrag) => eintrag.id === gewaehlt) ?? null;
  const turniere = useMemo(
    () => alleTurniere.filter((t) => t.serie_id === gewaehlt && t.status === 'beendet'),
    [alleTurniere, gewaehlt]
  );
  const offeneTurniere = alleTurniere.filter((t) => t.serie_id === gewaehlt && t.status !== 'beendet');

  const wertung = useMemo(() => {
    if (!serie) return [];
    const eingabe: SerienTurnier[] = turniere.map((turnier) => ({
      id: turnier.id,
      name: turnier.name,
      datum: turnier.datum,
      teilnehmer: turnier.teilnehmerzahl ?? teilnahmen.filter((t) => t.turnier_id === turnier.id).length,
      platzierungen: teilnahmen
        .filter((t) => t.turnier_id === turnier.id && t.endplatz !== null)
        .map((t) => ({ spieler: t.person_id, platz: t.endplatz as number }))
    }));
    return serienwertung(eingabe, { streicher: serie.streicher, bonus: serie.bonus }, (id) => namen.get(id) ?? '');
  }, [serie, turniere, teilnahmen, namen]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  // ---------- Verwaltung ----------

  function neueSerie() {
    setFormular({
      id: null,
      name: '',
      saison: '',
      disziplin: serie?.disziplin ?? '8-ball',
      streicher: '0',
      bonus: '1',
      aktiv: true
    });
  }

  function serieAendern(s: Serie) {
    setFormular({
      id: s.id,
      name: s.name,
      saison: s.saison ?? '',
      disziplin: s.disziplin,
      streicher: String(s.streicher),
      bonus: String(s.bonus),
      aktiv: s.aktiv
    });
  }

  async function speichern() {
    if (!verein || !formular) return;
    const streicher = Number(formular.streicher);
    const bonus = Number(formular.bonus);
    if (!formular.name.trim()) return setFehler('Bitte einen Namen eingeben.');
    if (!Number.isInteger(streicher) || streicher < 0) return setFehler('Gewertete Turniere: 0 (alle) oder eine positive Zahl.');
    if (!Number.isInteger(bonus) || bonus < 0) return setFehler('Sieger-Bonus: 0 oder eine positive Zahl.');
    const daten = {
      name: formular.name.trim(),
      saison: formular.saison.trim() || null,
      disziplin: formular.disziplin,
      streicher,
      bonus,
      aktiv: formular.aktiv
    };
    const antwort = formular.id
      ? await supabase.from('serien').update(daten).eq('id', formular.id).select('id').single()
      : await supabase.from('serien').insert({ ...daten, verein_id: verein.id }).select('id').single();
    if (antwort.error) return setFehler(antwort.error.message);
    setFehler(null);
    setFormular(null);
    setGewaehlt(antwort.data.id);
    await serienLaden();
  }

  async function serieLoeschen() {
    if (!formular?.id) return;
    const zugeordnet = alleTurniere.filter((t) => t.serie_id === formular.id).length;
    const frage =
      `Serie „${formular.name}“ löschen?` +
      (zugeordnet ? `\n\n${zugeordnet} Turniere verlieren dabei ihre Zuordnung, die Turniere selbst bleiben erhalten.` : '');
    if (!(await fragen(frage, 'Löschen'))) return;
    const { error } = await supabase.from('serien').delete().eq('id', formular.id);
    if (error) return setFehler(error.message);
    setFormular(null);
    setGewaehlt(null);
    await serienLaden();
  }

  async function turnierZuordnen(turnierId: string, serieId: string | null) {
    const { error } = await supabase.from('turniere').update({ serie_id: serieId }).eq('id', turnierId);
    if (error) return setFehler(error.message);
    setZuordnen('');
    await ladeSerie();
  }

  function pdf() {
    if (!serie) return;
    const bytes = serienPdf({
      name: serie.name,
      saison: serie.saison,
      disziplin: DISZIPLIN_TEXT[serie.disziplin],
      streicher: serie.streicher,
      bonus: serie.bonus,
      stand: new Date(),
      turniere,
      spieler: wertung,
      anzeige: (id) => namen.get(id) ?? 'unbekannt'
    });
    herunterladen(bytes, serienDateiname(serie.name, serie.saison));
  }

  // Turniere, die dieser Serie noch zugeordnet werden koennen
  const zuordenbar = alleTurniere
    .filter((t) => t.serie_id !== gewaehlt)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <h2>Serienwertung</h2>
          <div className="knopfpaar">
            {serie && turniere.length > 0 && (
              <button type="button" title="Die Serienwertung als PDF zum Drucken oder Aushängen" onClick={pdf}>
                Rangliste (PDF)
              </button>
            )}
            {darfVerwalten && serie && !formular && (
              <button type="button" title="Name, Saison, Disziplin und Wertung dieser Serie ändern" onClick={() => serieAendern(serie)}>
                Serie ändern
              </button>
            )}
            {darfVerwalten && !formular && (
              <button type="button" title="Eine neue Serienwertung anlegen" onClick={neueSerie}>
                Neue Serie
              </button>
            )}
          </div>
        </div>
        <div className="filterzeile">
          {serien.map((eintrag) => (
            <button
              key={eintrag.id}
              type="button"
              className={gewaehlt === eintrag.id ? 'chip aktiv' : 'chip'}
              title="Diese Serie anzeigen"
              onClick={() => {
                setGewaehlt(eintrag.id);
                setFormular(null);
              }}
            >
              {eintrag.name}
              {eintrag.saison ? ` ${eintrag.saison}` : ''}
              {!eintrag.aktiv ? ' (beendet)' : ''}
            </button>
          ))}
          {serien.length === 0 && <span className="hinweis">Noch keine Serie angelegt.</span>}
        </div>
        {serie && !formular && (
          <p className="hinweis">
            {DISZIPLIN_TEXT[serie.disziplin]} · {turniere.length} Turniere ·{' '}
            {serie.streicher > 0 ? `gewertet: beste ${serie.streicher}` : 'alle Turniere zählen'} ·{' '}
            {serie.bonus > 0 ? `Sieger-Bonus +${serie.bonus}` : 'ohne Sieger-Bonus'} · Punkte = Teilnehmerzahl + 1 − Platz
            {!serie.aktiv && ' · beendet'}
          </p>
        )}

        {formular && (
          <div className="kasten">
            <div className="feldkopf">{formular.id ? 'Serie ändern' : 'Neue Serie'}</div>
            <div className="felder">
              <label className="feld">
                <span>Name</span>
                <input
                  value={formular.name}
                  onChange={(e) => setFormular({ ...formular, name: e.target.value })}
                  placeholder="8-Ball Serie am 3. Freitag"
                />
              </label>
              <label className="feld">
                <span>Saison</span>
                <input value={formular.saison} onChange={(e) => setFormular({ ...formular, saison: e.target.value })} placeholder="26/27" />
              </label>
              <label className="feld">
                <span>Disziplin</span>
                <select value={formular.disziplin} onChange={(e) => setFormular({ ...formular, disziplin: e.target.value as Disziplin })}>
                  {(Object.keys(DISZIPLIN_TEXT) as Disziplin[]).map((d) => (
                    <option key={d} value={d}>
                      {DISZIPLIN_TEXT[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feld">
                <span>Gewertet: beste (0 = alle)</span>
                <input inputMode="numeric" value={formular.streicher} onChange={(e) => setFormular({ ...formular, streicher: e.target.value })} />
              </label>
              <label className="feld">
                <span>Sieger-Bonus</span>
                <input inputMode="numeric" value={formular.bonus} onChange={(e) => setFormular({ ...formular, bonus: e.target.value })} />
              </label>
            </div>
            <label className="ankreuz">
              <input type="checkbox" checked={formular.aktiv} onChange={(e) => setFormular({ ...formular, aktiv: e.target.checked })} />
              <span>
                Serie läuft
                <small>Nur laufende Serien stehen beim Anlegen eines Turniers zur Auswahl.</small>
              </span>
            </label>
            <div className="knopfpaar">
              <button type="button" title="Die Angaben zur Serie speichern" onClick={() => void speichern()}>
                Speichern
              </button>
              <button type="button" onClick={() => setFormular(null)}>
                Abbrechen
              </button>
              {formular.id && (
                <button type="button" title="Löscht die Serie. Die zugeordneten Turniere bleiben erhalten." className="gefahrknopf" onClick={() => void serieLoeschen()}>
                  Serie löschen
                </button>
              )}
            </div>
          </div>
        )}
        {fehler && <p className="fehler">{fehler}</p>}
      </section>

      <section className="block">
        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Platz</th>
              <th>Name</th>
              {turniere.map((turnier) => (
                <th key={turnier.id} style={{ width: '90px' }}>
                  {new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  <small title={turnier.name}>{turnier.name.length > 12 ? `${turnier.name.slice(0, 12)}…` : turnier.name}</small>
                </th>
              ))}
              <th style={{ width: '80px' }}>Punkte</th>
            </tr>
          </thead>
          <tbody>
            {wertung.map((spieler) => (
              <tr key={spieler.spieler}>
                <td>{spieler.zeigePlatz ? spieler.platz : ''}</td>
                <td>{namen.get(spieler.spieler) ?? 'unbekannt'}</td>
                {turniere.map((turnier) => {
                  const ergebnis = spieler.ergebnisse[turnier.id];
                  if (!ergebnis) return <td key={turnier.id}>—</td>;
                  return (
                    <td key={turnier.id} className={ergebnis.gestrichen ? 'gestrichen' : ''}>
                      {ergebnis.punkte}
                      <small> ({ergebnis.platz}.)</small>
                    </td>
                  );
                })}
                <td>
                  <strong>{spieler.summe}</strong>
                </td>
              </tr>
            ))}
            {wertung.length === 0 && (
              <tr>
                <td colSpan={turniere.length + 3} className="hinweis">
                  Für diese Serie liegen noch keine Platzierungen vor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {serie && serie.streicher > 0 && <p className="hinweis">Durchgestrichene Werte zählen nicht für die Summe.</p>}
        {offeneTurniere.length > 0 && (
          <p className="hinweis">
            Noch nicht beendet und deshalb nicht gewertet: {offeneTurniere.map((t) => `${t.name} (${DATUM(t.datum)})`).join(', ')}.
          </p>
        )}
      </section>

      {darfVerwalten && serie && (
        <section className="block">
          <h2>Turniere der Serie</h2>
          <table className="tabelle">
            <tbody>
              {alleTurniere
                .filter((t) => t.serie_id === gewaehlt)
                .map((t) => (
                  <tr key={t.id}>
                    <td style={{ width: '110px' }}>{DATUM(t.datum)}</td>
                    <td>
                      {t.name}
                      {t.quelle === 'import' && <span className="marke">aus Turnier light</span>}
                    </td>
                    <td className="rechts">
                      <button type="button" title="Das Turnier zählt dann nicht mehr für diese Serie." className="klein" onClick={() => void turnierZuordnen(t.id, null)}>
                        aus der Serie nehmen
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="zeile">
            <select value={zuordnen} onChange={(e) => setZuordnen(e.target.value)}>
              <option value="">Turnier auswählen</option>
              {zuordenbar.map((t) => {
                const andere = serien.find((s) => s.id === t.serie_id);
                return (
                  <option key={t.id} value={t.id}>
                    {DATUM(t.datum)} · {t.name}
                    {andere ? ` (bisher: ${andere.name})` : ''}
                  </option>
                );
              })}
            </select>
            <button type="button" title="Das gewählte Turnier zählt ab jetzt für diese Serie." disabled={!zuordnen} onClick={() => void turnierZuordnen(zuordnen, serie.id)}>
              Der Serie zuordnen
            </button>
          </div>
          <p className="hinweis">Ein Turnier gehört zu höchstens einer Serie. Gewertet wird es, sobald es beendet ist.</p>
        </section>
      )}
      {rueckfrage}
    </div>
  );
}
