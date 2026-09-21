import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { serienwertung } from '../serien';
import type { SerienTurnier } from '../serien';
import type { Person, Serie, Turnier } from '../datenbank.types';

// Serienwertung: Punkte aus den Platzierungen der Turniere einer Serie.
// Gerechnet wird beim Anzeigen, gespeichert wird nichts.

type Teilnahme = { turnier_id: string; person_id: string; endplatz: number | null };

export default function Serien() {
  const { verein } = useSitzung();

  const [serien, setSerien] = useState<Serie[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [teilnahmen, setTeilnahmen] = useState<Teilnahme[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!verein) return;
    void (async () => {
      const { data, error } = await supabase
        .from('serien')
        .select('*')
        .eq('verein_id', verein.id)
        .order('saison', { ascending: false })
        .order('name');
      if (error) {
        setFehler(error.message);
        return;
      }
      setSerien(data ?? []);
      setGewaehlt((bisher) => bisher ?? data?.[0]?.id ?? null);
    })();
  }, [verein]);

  const ladeSerie = useCallback(async () => {
    if (!verein || !gewaehlt) return;
    const { data: turnierdaten } = await supabase
      .from('turniere')
      .select('*')
      .eq('verein_id', verein.id)
      .eq('serie_id', gewaehlt)
      .order('datum');

    const ids = (turnierdaten ?? []).map((t) => t.id);
    const [{ data: teilnahmedaten }, { data: personendaten }] = await Promise.all([
      ids.length
        ? supabase
            .from('turnier_teilnehmer')
            .select('turnier_id, person_id, endplatz')
            .in('turnier_id', ids)
        : Promise.resolve({ data: [] as Teilnahme[] }),
      supabase.from('personen').select('*').eq('verein_id', verein.id)
    ]);

    setTurniere(turnierdaten ?? []);
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

  const wertung = useMemo(() => {
    if (!serie) return [];
    const eingabe: SerienTurnier[] = turniere.map((turnier) => ({
      id: turnier.id,
      name: turnier.name,
      datum: turnier.datum,
      teilnehmer:
        turnier.teilnehmerzahl ??
        teilnahmen.filter((t) => t.turnier_id === turnier.id).length,
      platzierungen: teilnahmen
        .filter((t) => t.turnier_id === turnier.id && t.endplatz !== null)
        .map((t) => ({ spieler: t.person_id, platz: t.endplatz as number }))
    }));
    return serienwertung(eingabe, { streicher: serie.streicher, bonus: serie.bonus }, (id) =>
      namen.get(id) ?? ''
    );
  }, [serie, turniere, teilnahmen, namen]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        <h2>Serienwertung</h2>
        <div className="filterzeile">
          {serien.map((eintrag) => (
            <button
              key={eintrag.id}
              type="button"
              className={gewaehlt === eintrag.id ? 'chip aktiv' : 'chip'}
              onClick={() => setGewaehlt(eintrag.id)}
            >
              {eintrag.name}
              {eintrag.saison ? ` ${eintrag.saison}` : ''}
            </button>
          ))}
          {serien.length === 0 && <span className="hinweis">Noch keine Serie angelegt.</span>}
        </div>
        {serie && (
          <p className="hinweis">
            {turniere.length} Turniere ·{' '}
            {serie.streicher > 0 ? `gewertet: beste ${serie.streicher}` : 'alle Turniere zählen'} ·{' '}
            {serie.bonus > 0 ? `Sieger-Bonus +${serie.bonus}` : 'ohne Sieger-Bonus'} · Punkte =
            Teilnehmerzahl + 1 − Platz
          </p>
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
                  {new Date(turnier.datum).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit'
                  })}
                  <small title={turnier.name}>
                    {turnier.name.length > 12 ? `${turnier.name.slice(0, 12)}…` : turnier.name}
                  </small>
                </th>
              ))}
              <th style={{ width: '80px' }}>Punkte</th>
            </tr>
          </thead>
          <tbody>
            {wertung.map((spieler, platz) => (
              <tr key={spieler.spieler}>
                <td>{platz + 1}</td>
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
        {serie && serie.streicher > 0 && (
          <p className="hinweis">Durchgestrichene Werte zählen nicht für die Summe.</p>
        )}
      </section>
    </div>
  );
}
