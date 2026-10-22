import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import { ART_NAME, TEAM_VORGABE, einsaetze, hoechstensMatches, pruefen, vorschlag } from '../teamvergleich';
import type { MatchArt, TeamSeite, TeamvergleichEinstellungen, VorschlagMatch } from '../teamvergleich';
import { DISZIPLIN_TEXT, STATUS_TEXT } from './Turniere';
import type { TurnierEinstellungen } from './Turniere';
import type { Partie, Person, Turnier, TurnierTeilnehmer } from '../datenbank.types';

// Teamvergleich (Mosconi-Format), Vorbereitung: Teams zusammenstellen,
// Kapitaene festlegen, Spielplan vorschlagen lassen, anpassen und uebernehmen.
// Die Regeln stehen in src/teamvergleich.ts. Seite A = Team A (Rot) in jeder Partie.

const SEITEN: TeamSeite[] = ['A', 'B'];
const FARBE: Record<TeamSeite, string> = { A: 'Rot', B: 'Blau' };

const datumLang = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

// Schluessel eines Platzes im Plan: Match (Index) und Seite/Position
type Platz = { index: number; seite: 'a' | 'b'; pos: number };

export default function TeamvergleichAnsicht({
  turnierId,
  zurueck,
  aendern,
  zurueckText = 'Turniere'
}: {
  turnierId: string;
  zurueck: () => void;
  aendern: () => void;
  zurueckText?: string;
}) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const [rueckfrage, fragen] = useRueckfrage();

  const [turnier, setTurnier] = useState<Turnier | null>(null);
  const [nichtGefunden, setNichtGefunden] = useState(false);
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [suche, setSuche] = useState<Record<TeamSeite, string>>({ A: '', B: '' });
  const [gastName, setGastName] = useState<Record<TeamSeite, string>>({ A: '', B: '' });
  const [freierKapitaen, setFreierKapitaen] = useState<Record<TeamSeite, string>>({ A: '', B: '' });
  // 'anderer Name' gewaehlt, aber noch nichts eingegeben
  const [freiOffen, setFreiOffen] = useState<Record<TeamSeite, boolean>>({ A: false, B: false });
  const [plan, setPlan] = useState<VorschlagMatch[] | null>(null);
  const [variante, setVariante] = useState(0);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!verein) return;
    const [t, tn, pe, pa] = await Promise.all([
      supabase.from('turniere').select('*').eq('id', turnierId).maybeSingle(),
      supabase.from('turnier_teilnehmer').select('*').eq('turnier_id', turnierId),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung')
    ]);
    if (t.error) setFehler(t.error.message);
    setTurnier(t.data ?? null);
    setNichtGefunden(!t.error && !t.data);
    setTeilnehmer(tn.data ?? []);
    setPersonen(pe.data ?? []);
    setPartien(pa.data ?? []);
  }, [verein, turnierId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const einstellungen = (turnier?.einstellungen ?? {}) as TurnierEinstellungen;
  const tv: TeamvergleichEinstellungen = einstellungen.teamvergleich ?? TEAM_VORGABE;
  const person = useCallback((id: string) => personen.find((p) => p.id === id), [personen]);
  const anzeige = useCallback((id: string) => {
    const p = person(id);
    return p ? personName(p) : '?';
  }, [person]);
  const nachName = (a: string, b: string) => anzeige(a).localeCompare(anzeige(b), 'de');
  const team = (seite: TeamSeite) =>
    teilnehmer.filter((t) => t.gruppe === seite).map((t) => t.person_id).sort(nachName);
  const teamA = team('A');
  const teamB = team('B');
  const ohneTeam = teilnehmer.filter((t) => t.gruppe !== 'A' && t.gruppe !== 'B').map((t) => t.person_id).sort(nachName);
  const teamVon = (id: string): TeamSeite | null => (teamA.includes(id) ? 'A' : teamB.includes(id) ? 'B' : null);

  // Gespeicherter Spielplan: aus den Partien, solange kein neuer Vorschlag offen ist
  const gespeichert: VorschlagMatch[] = useMemo(
    () =>
      partien.map((p) => ({
        block: p.runde ?? 1,
        art: (p.phase as MatchArt) ?? 'einzel',
        paarung: p.paarung ?? 1,
        a: [p.spieler_a, p.partner_a].filter((x): x is string => Boolean(x)),
        b: [p.spieler_b, p.partner_b].filter((x): x is string => Boolean(x))
      })),
    [partien]
  );
  const angezeigt = plan ?? gespeichert;
  const vorbereitung = turnier?.status === 'geplant';
  const bearbeitbar = darfLeiten && vorbereitung;

  // Plan pruefen: jeder Platz besetzt, aus dem richtigen Team, niemand doppelt im Block
  const planFehler = useMemo(() => {
    const doppelt = new Set<number>();
    const falsch = new Set<number>();
    const bloecke = new Map<number, string[]>();
    angezeigt.forEach((m, i) => {
      const ids = [...m.a, ...m.b];
      const soll = m.art === 'team' ? 0 : m.art === 'doppel' ? 2 : 1;
      if (m.a.length !== soll || m.b.length !== soll || m.a.some((id) => !teamA.includes(id)) || m.b.some((id) => !teamB.includes(id))) {
        falsch.add(i);
      }
      bloecke.set(m.block, [...(bloecke.get(m.block) ?? []), ...ids]);
    });
    angezeigt.forEach((m, i) => {
      const imBlock = bloecke.get(m.block) ?? [];
      if ([...m.a, ...m.b].some((id) => imBlock.filter((x) => x === id).length > 1)) doppelt.add(i);
    });
    return { doppelt, falsch };
  }, [angezeigt, teamA, teamB]);

  if (!verein) return null;
  if (!turnier) {
    return (
      <div className="einspaltig">
        <section className="block">
          <button type="button" className="zurueck" onClick={zurueck}>
            ← {zurueckText}
          </button>
          <p className="hinweis">{nichtGefunden ? 'Dieses Turnier gibt es nicht mehr.' : fehler ?? 'Lädt.'}</p>
        </section>
      </div>
    );
  }

  const teamFehler = pruefen(teamA, teamB, tv.ziel, tv.race);

  // ---------- Teams ----------

  async function teamSetzen(personId: string, seite: TeamSeite) {
    if (!turnier) return;
    setFehler(null);
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .upsert({ turnier_id: turnier.id, person_id: personId, verein_id: turnier.verein_id, gruppe: seite }, { onConflict: 'turnier_id,person_id' });
    if (error) return setFehler(error.message);
    setSuche({ ...suche, [seite]: '' });
    await laden();
  }

  async function entfernen(personId: string) {
    if (!turnier) return;
    setFehler(null);
    const { error } = await supabase.from('turnier_teilnehmer').delete().eq('turnier_id', turnier.id).eq('person_id', personId);
    if (error) return setFehler(error.message);
    // War er Kapitaen, ist er es nicht mehr
    const seite = teamVon(personId);
    if (seite && tv.teams[seite].kapitaenId === personId) await kapitaenSetzen(seite, { kapitaenId: null, kapitaen: null });
    await laden();
  }

  async function gastAnlegen(seite: TeamSeite) {
    if (!turnier) return;
    setFehler(null);
    const text = gastName[seite].trim().replace(/\s+/g, ' ');
    if (text.length < 2) return setFehler('Bitte den Namen des Gastes eingeben.');
    const teile = text.split(' ');
    const nachname = teile.length > 1 ? (teile.pop() as string) : '';
    const { data, error } = await supabase
      .from('personen')
      .insert({ verein_id: turnier.verein_id, vorname: teile.join(' '), nachname, anzeigename: text, status: 'gast' })
      .select('id')
      .single();
    if (error || !data) {
      return setFehler(
        error?.message.includes('row-level security')
          ? 'Gäste anlegen dürfen nur Vereins-Admin, Sportwart und Turnierleiter.'
          : error?.message ?? 'Gast nicht angelegt.'
      );
    }
    setGastName({ ...gastName, [seite]: '' });
    await teamSetzen(data.id, seite);
  }

  async function tvSpeichern(neu: TeamvergleichEinstellungen) {
    if (!turnier) return;
    const { error } = await supabase
      .from('turniere')
      .update({ einstellungen: { ...einstellungen, teamvergleich: neu } })
      .eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function kapitaenSetzen(seite: TeamSeite, wert: { kapitaenId: string | null; kapitaen: string | null }) {
    await tvSpeichern({ ...tv, teams: { ...tv.teams, [seite]: { ...tv.teams[seite], ...wert } } });
  }

  // ---------- Spielplan ----------

  function vorschlagErzeugen(neueVariante: number) {
    setFehler(null);
    setMeldung(null);
    setVariante(neueVariante);
    setPlan(vorschlag(teamA, teamB, tv.ziel, neueVariante));
  }

  function platzAendern({ index, seite, pos }: Platz, id: string) {
    const basis = plan ?? gespeichert;
    setPlan(basis.map((m, i) => (i !== index ? m : { ...m, [seite]: m[seite].map((x, j) => (j === pos ? id : x)) })));
  }

  async function planUebernehmen() {
    if (!turnier || !plan) return;
    setFehler(null);
    if (teamFehler.length > 0) return setFehler(teamFehler.join(' '));
    if (planFehler.doppelt.size > 0) return setFehler('Ein Spieler steht doppelt im selben Block (rot markiert).');
    if (planFehler.falsch.size > 0) return setFehler('Ein Platz ist leer oder mit einem Spieler des anderen Teams besetzt.');
    if (partien.length > 0 && !(await fragen('Den bisherigen Spielplan ersetzen?', 'Ersetzen'))) return;
    setArbeitet(true);
    const { error: weg } = await supabase.from('partien').delete().eq('turnier_id', turnier.id).eq('status', 'geplant');
    if (weg) {
      setArbeitet(false);
      return setFehler(weg.message);
    }
    const zeilen = plan.map((m) => ({
      verein_id: turnier.verein_id,
      turnier_id: turnier.id,
      datum: turnier.datum,
      disziplin: turnier.disziplin,
      phase: m.art,
      runde: m.block,
      paarung: m.paarung,
      spieler_a: m.a[0] ?? null,
      spieler_b: m.b[0] ?? null,
      partner_a: m.art === 'doppel' ? m.a[1] : null,
      partner_b: m.art === 'doppel' ? m.b[1] : null,
      doppel: m.art === 'doppel',
      race_to: tv.race[m.art],
      rating_werten: m.art === 'einzel' && Boolean(tv.einzelFuersRating),
      status: 'geplant' as const
    }));
    const { error } = await supabase.from('partien').insert(zeilen);
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setPlan(null);
    setMeldung(`Spielplan übernommen: ${zeilen.length} Matches. Bis zum Start lässt er sich weiter ändern.`);
    await laden();
  }

  async function loeschen() {
    if (!turnier || !verein) return;
    if (!(await fragen(`„${turnier.name}“ mit Teams und Spielplan löschen?`, 'Löschen', { schutzwort: verein.id }))) return;
    const { error } = await supabase.from('turniere').delete().eq('id', turnier.id);
    if (error) return setFehler(error.message);
    zurueck();
  }

  // Spieler im gespeicherten Plan, die in keinem Team mehr stehen oder das Team gewechselt haben
  const planVeraltet =
    !plan && gespeichert.some((m) => m.a.some((id) => !teamA.includes(id)) || m.b.some((id) => !teamB.includes(id)));
  const zahl = einsaetze(angezeigt);
  const zahlen = [...teamA, ...teamB].map((id) => zahl.get(id) ?? 0);
  const bloecke = [...new Set(angezeigt.map((m) => m.block))];

  // ---------- Anzeige ----------

  const teamKasten = (seite: TeamSeite) => {
    const ids = seite === 'A' ? teamA : teamB;
    const anderes: TeamSeite = seite === 'A' ? 'B' : 'A';
    const k = tv.teams[seite];
    const frei = (Boolean(k.kapitaen) && !k.kapitaenId) || freiOffen[seite];
    const treffer =
      suche[seite].trim().length > 0
        ? personen
            .filter((p) => p.status !== 'ausgetreten' && !teilnehmer.some((t) => t.person_id === p.id && (t.gruppe === 'A' || t.gruppe === 'B')))
            .filter((p) => `${p.vorname} ${p.nachname} ${p.anzeigename ?? ''}`.toLowerCase().includes(suche[seite].toLowerCase()))
            .sort((x, y) => personName(x).localeCompare(personName(y), 'de'))
            .slice(0, 8)
        : [];
    return (
      <section className="block" key={seite}>
        <h2>
          <span className={`teammarke team-${seite}`}>{k.name}</span> ({ids.length})
        </h2>
        <label className="feld">
          <span>Kapitän</span>
          <select
            disabled={!bearbeitbar}
            value={k.kapitaenId ?? (frei ? 'frei' : '')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'frei') {
                setFreierKapitaen({ ...freierKapitaen, [seite]: k.kapitaen ?? '' });
                setFreiOffen({ ...freiOffen, [seite]: true });
              } else {
                setFreiOffen({ ...freiOffen, [seite]: false });
                void kapitaenSetzen(seite, { kapitaenId: v || null, kapitaen: null });
              }
            }}
          >
            <option value="">keiner</option>
            {ids.map((id) => (
              <option key={id} value={id}>
                {anzeige(id)}
              </option>
            ))}
            <option value="frei">anderer Name (spielt nicht mit)</option>
          </select>
        </label>
        {frei && (
          <div className="zeile">
            <input
              aria-label="Name des Kapitäns"
              placeholder="Name des Kapitäns"
              disabled={!bearbeitbar}
              value={freierKapitaen[seite] || k.kapitaen || ''}
              onChange={(e) => setFreierKapitaen({ ...freierKapitaen, [seite]: e.target.value })}
              onBlur={() => {
                const name = freierKapitaen[seite].trim();
                if (name && name !== k.kapitaen) void kapitaenSetzen(seite, { kapitaenId: null, kapitaen: name });
              }}
            />
          </div>
        )}
        <table className="tabelle kompakt voll">
          <tbody>
            {ids.map((id) => (
              <tr key={id}>
                <td className="namenspalte">
                  {anzeige(id)}
                  {person(id)?.status === 'gast' && <span className="marke">Gast</span>}
                  {k.kapitaenId === id && <span className="marke">Kapitän</span>}
                </td>
                {bearbeitbar && (
                  <td className="rechts">
                    <button type="button" className="klein" title={`In ${tv.teams[anderes].name} verschieben`} onClick={() => void teamSetzen(id, anderes)}>
                      → {FARBE[anderes]}
                    </button>{' '}
                    <button type="button" className="klein" title="Aus dem Team nehmen" onClick={() => void entfernen(id)}>
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {bearbeitbar && (
          <>
            <div className="zeile raster">
              <input placeholder="Mitglied suchen" value={suche[seite]} onChange={(e) => setSuche({ ...suche, [seite]: e.target.value })} />
            </div>
            {treffer.length > 0 && (
              <div className="filterzeile">
                {treffer.map((p) => (
                  <button key={p.id} type="button" className="chip" title={`In ${k.name} aufnehmen`} onClick={() => void teamSetzen(p.id, seite)}>
                    + {personName(p)}
                    {p.status === 'gast' ? ' (Gast)' : ''}
                  </button>
                ))}
              </div>
            )}
            <div className="zeile raster">
              <input
                placeholder="Neuer Gast: Vor- und Nachname"
                value={gastName[seite]}
                onChange={(e) => setGastName({ ...gastName, [seite]: e.target.value })}
              />
              <button type="button" title={`Legt den Namen als Gast an und nimmt ihn in ${k.name} auf.`} onClick={() => void gastAnlegen(seite)}>
                Gast hinzufügen
              </button>
            </div>
          </>
        )}
      </section>
    );
  };

  const auswahl = (m: VorschlagMatch, index: number, seite: 'a' | 'b', pos: number) => {
    const ids = seite === 'a' ? teamA : teamB;
    const wert = m[seite][pos] ?? '';
    if (!bearbeitbar) return <span>{wert ? anzeige(wert) : '–'}</span>;
    return (
      <select
        aria-label={`Spieler ${seite === 'a' ? tv.teams.A.name : tv.teams.B.name}`}
        value={wert}
        onChange={(e) => platzAendern({ index, seite, pos }, e.target.value)}
      >
        {!ids.includes(wert) && <option value={wert}>{wert ? `${anzeige(wert)} (nicht im Team)` : '–'}</option>}
        {ids.map((id) => (
          <option key={id} value={id}>
            {anzeige(id)}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="einspaltig">
      <section className="block">
        <button type="button" title={`Zurück zur Seite „${zurueckText}“`} className="zurueck" onClick={zurueck}>
          ← {zurueckText}
        </button>
        <div className="bearbeitenkopf">
          <h2>
            {turnier.name} <span className="marke">{STATUS_TEXT[turnier.status]}</span>
          </h2>
          {bearbeitbar && (
            <div className="knopfpaar">
              <button type="button" title="Name, Datum, Disziplin, Ziel, Race to und Teamnamen ändern" onClick={aendern}>
                Turnier ändern
              </button>
              <button type="button" className="gefahrknopf" title="Löscht das Turnier mit Teams und Spielplan. Braucht das Schutzwort." onClick={() => void loeschen()}>
                Turnier löschen
              </button>
            </div>
          )}
        </div>
        <p className="hinweis">
          {datumLang(turnier.datum)} · {DISZIPLIN_TEXT[turnier.disziplin]} · Teamvergleich · Sieg bei {tv.ziel} Punkten · Race to{' '}
          {tv.race.team}/{tv.race.doppel}/{tv.race.einzel} (Team-Match/Doppel/Einzel) ·{' '}
          {tv.einzelFuersRating ? 'Einzel zählen fürs Rating' : 'zählt nicht fürs Rating'}
        </p>
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      <div className="turnierzweier">{SEITEN.map(teamKasten)}</div>

      {ohneTeam.length > 0 && (
        <section className="block">
          <h2>Ohne Team ({ohneTeam.length})</h2>
          <p className="hinweis">Angemeldet, aber noch keinem Team zugeordnet.</p>
          <table className="tabelle kompakt voll">
            <tbody>
              {ohneTeam.map((id) => (
                <tr key={id}>
                  <td className="namenspalte">{anzeige(id)}</td>
                  {bearbeitbar && (
                    <td className="rechts">
                      <button type="button" className="klein" onClick={() => void teamSetzen(id, 'A')}>
                        → {FARBE.A}
                      </button>{' '}
                      <button type="button" className="klein" onClick={() => void teamSetzen(id, 'B')}>
                        → {FARBE.B}
                      </button>{' '}
                      <button type="button" className="klein" title="Aus dem Turnier nehmen" onClick={() => void entfernen(id)}>
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="block">
        <div className="bearbeitenkopf">
          <h2>
            Spielplan
            {angezeigt.length > 0 && ` (${angezeigt.length} Matches, höchstens ${hoechstensMatches(tv.ziel)} nötig)`}
          </h2>
          {bearbeitbar && (
            <div className="knopfpaar">
              <button
                type="button"
                title="Plant die Blöcke: Team-Match, dann Doppel und Einzel im Wechsel, mit gleichmäßigen Einsätzen."
                disabled={teamFehler.length > 0}
                onClick={() => vorschlagErzeugen(0)}
              >
                Vorschlag erzeugen
              </button>
              <button
                type="button"
                title="Ein anderer, ebenso gleichmäßiger Vorschlag"
                disabled={teamFehler.length > 0 || angezeigt.length === 0}
                onClick={() => vorschlagErzeugen(variante + 1)}
              >
                Neuer Vorschlag
              </button>
            </div>
          )}
        </div>
        {bearbeitbar && teamFehler.length > 0 && <p className="hinweis">{teamFehler.join(' ')}</p>}
        {planVeraltet && (
          <p className="fehler">Die Teams haben sich geändert, der Spielplan passt nicht mehr. Bitte neu erzeugen oder die Namen anpassen.</p>
        )}
        {angezeigt.length === 0 ? (
          <p className="hinweis">Noch kein Spielplan. Erst die Teams zusammenstellen, dann „Vorschlag erzeugen“.</p>
        ) : (
          <>
            {zahlen.length > 0 && (
              <p className="hinweis">
                Einsätze je Spieler: {Math.min(...zahlen)}
                {Math.max(...zahlen) !== Math.min(...zahlen) ? ` bis ${Math.max(...zahlen)}` : ''}
                {plan ? ' · Vorschlag, noch nicht übernommen' : ''}
              </p>
            )}
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Art</th>
                  <th>
                    <span className="teammarke team-A">{tv.teams.A.name}</span>
                  </th>
                  <th></th>
                  <th>
                    <span className="teammarke team-B">{tv.teams.B.name}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bloecke.flatMap((nr) =>
                  angezeigt
                    .map((m, index) => ({ m, index }))
                    .filter(({ m }) => m.block === nr)
                    .map(({ m, index }, j) => (
                      <tr
                        key={`${nr}-${m.paarung}`}
                        className={[
                          j === 0 ? 'blockanfang' : '',
                          planFehler.doppelt.has(index) || planFehler.falsch.has(index) ? 'planfehler' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <td>{j === 0 ? nr : ''}</td>
                        <td>{j === 0 ? ART_NAME[m.art] : ''}</td>
                        <td>
                          {m.art === 'team' ? tv.teams.A.name : auswahl(m, index, 'a', 0)}
                          {m.art === 'doppel' && <> / {auswahl(m, index, 'a', 1)}</>}
                        </td>
                        <td>–</td>
                        <td>
                          {m.art === 'team' ? tv.teams.B.name : auswahl(m, index, 'b', 0)}
                          {m.art === 'doppel' && <> / {auswahl(m, index, 'b', 1)}</>}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
            {bearbeitbar && plan && (
              <div className="zeile">
                <button type="button" disabled={arbeitet} title="Legt die Matches an. Bis zum Start lässt sich der Plan weiter ändern." onClick={() => void planUebernehmen()}>
                  Spielplan übernehmen
                </button>
                <button type="button" disabled={arbeitet} title="Den Vorschlag verwerfen" onClick={() => setPlan(null)}>
                  Verwerfen
                </button>
              </div>
            )}
          </>
        )}
        {!vorbereitung && <p className="hinweis">Der Abend selbst (Start, Blöcke an den Tablets, Stand) folgt im nächsten Ausbauschritt.</p>}
      </section>
      {rueckfrage}
    </div>
  );
}
