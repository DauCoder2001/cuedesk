import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import { LIGEN, aufstellungPruefen, spielplan, wertung } from '../liga';
import { STATUS_TEXT } from './Turniere';
import type { LigaSpiel } from '../liga';
import type { TurnierEinstellungen } from './Turniere';
import type { Partie, Person, Turnier, TurnierTeilnehmer } from '../datenbank.types';

// Ein Liga-Spieltag (Begegnung): Aufstellung, acht Einzelpartien, Partie- und
// Matchpunkte, Abschluss. Die Regeln stehen in src/liga.ts, die Ergebnisse in
// denselben Tabellen wie alle anderen Partien.

const DISZIPLIN_KURZ: Record<string, string> = {
  '14-1': '14.1-endlos',
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball'
};

const datumLang = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

export default function LigaAnsicht({ turnierId, zurueck }: { turnierId: string; zurueck: () => void }) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const istAdmin = darf('vereinsadmin');

  const [turnier, setTurnier] = useState<Turnier | null>(null);
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [gastName, setGastName] = useState('');
  // Halbe Aufstellung: solange nur eine Seite gewaehlt ist, gibt es noch keine
  // Partie in der Datenbank. Die Wahl haelt deshalb die Ansicht fest.
  const [wahl, setWahl] = useState<Record<number, { eigen?: string | null; gegen?: string | null }>>({});
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  const laden = useCallback(async () => {
    if (!verein) return;
    const [t, tn, p, pe] = await Promise.all([
      supabase.from('turniere').select('*').eq('id', turnierId).maybeSingle(),
      supabase.from('turnier_teilnehmer').select('*').eq('turnier_id', turnierId),
      supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung'),
      supabase.from('personen').select('*').eq('verein_id', verein.id)
    ]);
    if (t.error) setFehler(t.error.message);
    setTurnier(t.data ?? null);
    setTeilnehmer(tn.data ?? []);
    setPartien(p.data ?? []);
    setPersonen(pe.data ?? []);
  }, [verein, turnierId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const anzeige = useCallback(
    (id: string | null) => {
      if (!id) return '';
      const p = personen.find((x) => x.id === id);
      return p ? p.anzeigename || `${p.vorname} ${p.nachname}`.trim() : '?';
    },
    [personen]
  );

  const einstellungen = (turnier?.einstellungen ?? {}) as TurnierEinstellungen;
  const liga = einstellungen.liga;
  const spiele = useMemo(() => (liga ? spielplan(liga.ziele) : []), [liga]);

  // Partie zu einem Spiel des Plans (Runde 1 = Hinrunde, 2 = Rueckrunde)
  const partieVon = useCallback(
    (s: LigaSpiel) => partien.find((p) => p.runde === (s.runde === 'hin' ? 1 : 2) && p.paarung === s.paarung) ?? null,
    [partien]
  );

  // Eigene Spieler stehen je nach Heimrecht auf Seite A oder B
  const eigeneSeiteIstA = liga?.heim ?? true;
  const ausPartie = (p: Partie | null, seite: 'eigen' | 'gegner') =>
    p ? ((seite === 'eigen') === eigeneSeiteIstA ? p.spieler_a : p.spieler_b) : null;
  const eigenerSpieler = (s: LigaSpiel) => {
    const gemerkt = wahl[s.nr]?.eigen;
    return gemerkt !== undefined ? gemerkt : ausPartie(partieVon(s), 'eigen');
  };
  const gegnerSpieler = (s: LigaSpiel) => {
    const gemerkt = wahl[s.nr]?.gegen;
    return gemerkt !== undefined ? gemerkt : ausPartie(partieVon(s), 'gegner');
  };

  const ergebnisse = useMemo(
    () =>
      spiele.map((s) => {
        const p = partieVon(s);
        // Der Rating-Haken einer Partie ändert die Partiepunkte nicht
        return {
          nr: s.nr,
          heim: p ? (eigeneSeiteIstA ? p.ergebnis_a : p.ergebnis_b) : null,
          gast: p ? (eigeneSeiteIstA ? p.ergebnis_b : p.ergebnis_a) : null
        };
      }),
    [spiele, partieVon, eigeneSeiteIstA]
  );
  const punkte = useMemo(() => wertung(ergebnisse), [ergebnisse]);

  const eigeneMitglieder = useMemo(
    () =>
      personen
        .filter((p) => p.status === 'mitglied')
        .sort((a, b) => personName(a).localeCompare(personName(b), 'de')),
    [personen]
  );
  const gaeste = useMemo(
    () => personen.filter((p) => p.status === 'gast').sort((a, b) => personName(a).localeCompare(personName(b), 'de')),
    [personen]
  );

  const fehlerAufstellung = useMemo(() => {
    if (spiele.length === 0) return [];
    const plan: Record<number, string | null> = {};
    spiele.forEach((s) => (plan[s.nr] = eigenerSpieler(s)));
    return aufstellungPruefen(spiele, plan, (id) => anzeige(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiele, partien, wahl, anzeige, eigeneSeiteIstA]);

  if (!verein) return null;
  if (!turnier || !liga) {
    return (
      <div className="einspaltig">
        <p className="hinweis">Lädt.</p>
      </div>
    );
  }

  const bearbeitbar = darfLeiten && turnier.status !== 'beendet';

  // ---------- Aufstellung und Ergebnisse ----------

  // Legt die Partie an, sobald beide Spieler feststehen, und aendert sie sonst
  async function spielerSetzen(s: LigaSpiel, wer: 'eigen' | 'gegner', personId: string | null) {
    if (!turnier || !liga) return;
    const vorhanden = partieVon(s);
    const eigen = wer === 'eigen' ? personId : eigenerSpieler(s);
    const gegen = wer === 'gegner' ? personId : gegnerSpieler(s);
    setFehler(null);
    setWahl((bisher) => ({ ...bisher, [s.nr]: { eigen, gegen } }));

    if (!eigen || !gegen) {
      // Ohne beide Spieler gibt es noch keine Partie; eine bestehende entfaellt
      if (vorhanden) {
        await supabase.from('partien').delete().eq('id', vorhanden.id);
        await laden();
      }
      return;
    }
    const spieler_a = eigeneSeiteIstA ? eigen : gegen;
    const spieler_b = eigeneSeiteIstA ? gegen : eigen;
    if (spieler_a === spieler_b) return setFehler('Ein Spieler kann nicht gegen sich selbst antreten.');

    if (vorhanden) {
      const { error } = await supabase.from('partien').update({ spieler_a, spieler_b }).eq('id', vorhanden.id);
      if (error) return setFehler(error.message);
    } else {
      const { error } = await supabase.from('partien').insert({
        verein_id: turnier.verein_id,
        turnier_id: turnier.id,
        disziplin: s.disziplin,
        datum: turnier.datum,
        phase: s.runde,
        runde: s.runde === 'hin' ? 1 : 2,
        paarung: s.paarung,
        spieler_a,
        spieler_b,
        race_to: s.ziel,
        vorgabe_a: 0,
        vorgabe_b: 0,
        status: 'geplant'
      });
      if (error) return setFehler(error.message);
    }
    await teilnehmerPflegen([eigen, gegen]);
    await laden();
  }

  // Wer in der Begegnung spielt, steht auch in der Teilnehmerliste
  async function teilnehmerPflegen(ids: (string | null)[]) {
    if (!turnier) return;
    const neue = ids.filter((id): id is string => Boolean(id) && !teilnehmer.some((t) => t.person_id === id));
    if (neue.length === 0) return;
    await supabase
      .from('turnier_teilnehmer')
      .insert(neue.map((id) => ({ turnier_id: turnier.id, person_id: id, verein_id: turnier.verein_id })));
  }

  async function ergebnisSetzen(s: LigaSpiel, eigenWert: number | null, gegenWert: number | null) {
    const p = partieVon(s);
    if (!p) return setFehler('Erst beide Spieler eintragen.');
    const ergebnis_a = eigeneSeiteIstA ? eigenWert : gegenWert;
    const ergebnis_b = eigeneSeiteIstA ? gegenWert : eigenWert;
    const leer = ergebnis_a === null || ergebnis_b === null;
    const neu = {
      ergebnis_a,
      ergebnis_b,
      status: (leer ? 'geplant' : 'beendet') as Partie['status'],
      beendet: leer ? null : p.beendet ?? new Date().toISOString()
    };
    const { error } = await supabase.from('partien').update(neu).eq('id', p.id);
    if (error) return setFehler(error.message);
    setPartien((liste) => liste.map((x) => (x.id === p.id ? { ...x, ...neu } : x)));
  }

  async function partieWertung(s: LigaSpiel, werten: boolean) {
    const p = partieVon(s);
    if (!p) return;
    const { error } = await supabase.from('partien').update({ rating_werten: werten }).eq('id', p.id);
    if (error) return setFehler(error.message);
    setPartien((liste) => liste.map((x) => (x.id === p.id ? { ...x, rating_werten: werten } : x)));
  }

  async function gastAnlegen() {
    if (!turnier || !liga) return;
    const text = gastName.trim().replace(/\s+/g, ' ');
    if (text.length < 2) return setFehler('Bitte den Namen des gegnerischen Spielers eingeben.');
    const teile = text.split(' ');
    const nachname = teile.length > 1 ? (teile.pop() as string) : '';
    const { error } = await supabase.from('personen').insert({
      verein_id: turnier.verein_id,
      vorname: teile.join(' '),
      nachname,
      anzeigename: `${text} (${liga.gegner})`,
      status: 'gast'
    });
    if (error) {
      return setFehler(
        error.message.includes('row-level security')
          ? 'Gäste anlegen dürfen Vereins-Admin, Sportwart und Turnierleiter.'
          : error.message
      );
    }
    setGastName('');
    await laden();
  }

  async function ratingUmschalten() {
    if (!turnier) return;
    const { error } = await supabase.from('turniere').update({ rating_werten: !turnier.rating_werten }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function abschliessen() {
    if (!turnier) return;
    if (punkte.offen > 0 && !(await fragen(`Noch ${punkte.offen} Partien ohne Ergebnis. Trotzdem abschließen?`))) return;
    if (!(await fragen('Spieltag abschließen?\nDas Rating wird danach neu berechnet.', 'Abschließen'))) return;
    setArbeitet(true);
    const { error } = await supabase.from('turniere').update({ status: 'beendet' }).eq('id', turnier.id);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    const rating = await supabase.functions.invoke('rating', { body: { verein_id: turnier.verein_id } });
    setArbeitet(false);
    setMeldung(rating.error ? 'Spieltag abgeschlossen. Das Rating wird heute Nacht neu berechnet.' : 'Spieltag abgeschlossen, Rating neu berechnet.');
    await laden();
  }

  async function wiederOeffnen() {
    if (!turnier || !(await fragen('Spieltag wieder öffnen?', 'Wieder öffnen'))) return;
    const { error } = await supabase.from('turniere').update({ status: 'laeuft' }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function loeschen() {
    if (!turnier || !(await fragen(`Spieltag „${turnier.name}“ mit allen Partien löschen?`, 'Löschen'))) return;
    const { error } = await supabase.from('turniere').delete().eq('id', turnier.id);
    if (error) return setFehler(error.message);
    zurueck();
  }

  // ---------- Anzeige ----------

  const eigenerName = liga.eigene || verein.name;
  const reihen: { runde: 'hin' | 'rueck'; titel: string }[] = [
    { runde: 'hin', titel: 'Hinrunde' },
    { runde: 'rueck', titel: 'Rückrunde' }
  ];

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <div>
            <button type="button" className="zurueck" onClick={zurueck}>
              ← Turniere
            </button>
            <h2>
              {LIGEN[liga.liga].name} · {liga.spieltag}. Spieltag
            </h2>
            <p className="hinweis">
              {datumLang(turnier.datum)} · {eigenerName} gegen {liga.gegner} · {liga.heim ? 'Heimspiel' : 'Auswärtsspiel'} ·
              14.1 {liga.ziele.punkte141} Punkte / {liga.ziele.aufnahmen141} Aufnahmen · 8-Ball {liga.ziele['8-ball']} ·
              9-Ball {liga.ziele['9-ball']} · 10-Ball {liga.ziele['10-ball']} Gewinnsätze
              {!turnier.rating_werten && ' · zählt nicht fürs Rating'}
            </p>
          </div>
          <div className="knopfpaar">
            <span className={`marke ${turnier.status === 'laeuft' ? 'livelaeuft' : ''}`}>{STATUS_TEXT[turnier.status]}</span>
            {bearbeitbar && (
              <button type="button" onClick={() => void ratingUmschalten()}>
                {turnier.rating_werten ? 'Nicht fürs Rating werten' : 'Fürs Rating werten'}
              </button>
            )}
            {bearbeitbar && (
              <button type="button" onClick={() => void abschliessen()} disabled={arbeitet}>
                Abschließen
              </button>
            )}
            {istAdmin && turnier.status === 'beendet' && (
              <button type="button" onClick={() => void wiederOeffnen()}>
                Wieder öffnen
              </button>
            )}
          </div>
        </div>
        <div className="kennzahlen">
          <div>
            <span>Partiepunkte</span>
            <strong>
              {punkte.partiepunkte[0]} : {punkte.partiepunkte[1]}
            </strong>
            <small>
              {eigenerName} gegen {liga.gegner}
            </small>
          </div>
          <div>
            <span>Matchpunkte</span>
            <strong>{punkte.entschieden ? `${punkte.matchpunkte[0]} : ${punkte.matchpunkte[1]}` : '–'}</strong>
            <small>
              {punkte.entschieden
                ? 'endgültig'
                : `Zwischenstand ${punkte.matchpunkte[0]} : ${punkte.matchpunkte[1]}, noch ${punkte.offen} Partien offen`}
            </small>
          </div>
        </div>
        {fehlerAufstellung.length > 0 && (
          <div className="pausehinweis">
            <strong>Aufstellung prüfen:</strong> {fehlerAufstellung.join(' ')}
          </div>
        )}
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      {reihen.map((r) => (
        <section key={r.runde} className="block">
          <h2>{r.titel}</h2>
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Nr.</th>
                <th>Disziplin</th>
                <th>{eigenerName}</th>
                <th>{liga.gegner}</th>
                <th className="rechts">Ergebnis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {spiele
                .filter((s) => s.runde === r.runde)
                .map((s) => {
                  const p = partieVon(s);
                  return (
                    <Spielzeile
                      key={s.nr}
                      spiel={s}
                      partie={p}
                      eigen={eigenerSpieler(s)}
                      gegen={gegnerSpieler(s)}
                      eigeneWahl={eigeneMitglieder}
                      gegnerWahl={gaeste}
                      anzeige={anzeige}
                      bearbeitbar={bearbeitbar}
                      eigeneSeiteIstA={eigeneSeiteIstA}
                      spielerSetzen={(wer, id) => void spielerSetzen(s, wer, id)}
                      ergebnisSetzen={(a, b) => void ergebnisSetzen(s, a, b)}
                      wertungSetzen={(werten) => void partieWertung(s, werten)}
                    />
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}

      {bearbeitbar && (
        <section className="block">
          <h2>Gegnerische Spieler</h2>
          <div className="zeile">
            <input
              placeholder="Vor- und Nachname"
              value={gastName}
              onChange={(e) => setGastName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void gastAnlegen()}
            />
            <button type="button" onClick={() => void gastAnlegen()}>
              Als Gast anlegen
            </button>
          </div>
          <p className="hinweis">
            Der Name bekommt die Mannschaft angehängt, zum Beispiel „Meier ({liga.gegner})“. Gäste stehen in keiner
            Rangliste, ihre Stärke zählt aber für das Rating deiner Spieler.
          </p>
          <div className="knopfpaar">
            <button type="button" className="gefahrknopf" onClick={() => void loeschen()}>
              Spieltag löschen
            </button>
          </div>
        </section>
      )}
      {rueckfrage}
    </div>
  );
}

// Eine Zeile des Spielberichts: zwei Spieler und das Ergebnis. Gespeichert
// wird beim Verlassen der Zeile, wie im Turnier-Spielplan.
function Spielzeile(props: {
  spiel: LigaSpiel;
  partie: Partie | null;
  eigen: string | null;
  gegen: string | null;
  eigeneWahl: Person[];
  gegnerWahl: Person[];
  anzeige: (id: string | null) => string;
  bearbeitbar: boolean;
  eigeneSeiteIstA: boolean;
  spielerSetzen: (wer: 'eigen' | 'gegner', id: string | null) => void;
  ergebnisSetzen: (eigen: number | null, gegen: number | null) => void;
  wertungSetzen: (werten: boolean) => void;
}) {
  const { spiel, partie } = props;
  const wert = (w: number | null | undefined) => (w === null || w === undefined ? '' : String(w));
  const eigenErgebnis = partie ? (props.eigeneSeiteIstA ? partie.ergebnis_a : partie.ergebnis_b) : null;
  const gegenErgebnis = partie ? (props.eigeneSeiteIstA ? partie.ergebnis_b : partie.ergebnis_a) : null;
  const [a, setA] = useState(wert(eigenErgebnis));
  const [b, setB] = useState(wert(gegenErgebnis));

  useEffect(() => {
    setA(wert(eigenErgebnis));
    setB(wert(gegenErgebnis));
  }, [eigenErgebnis, gegenErgebnis]);

  const zahl = (t: string) => (t.trim() === '' ? null : Number(t));
  const uebernehmen = () => {
    if (zahl(a) === eigenErgebnis && zahl(b) === gegenErgebnis) return;
    props.ergebnisSetzen(zahl(a), zahl(b));
  };

  const auswahl = (wer: 'eigen' | 'gegner', gewaehlt: string | null, liste: Person[]) =>
    props.bearbeitbar ? (
      <select value={gewaehlt ?? ''} onChange={(e) => props.spielerSetzen(wer, e.target.value || null)}>
        <option value="">– offen –</option>
        {liste.map((p) => (
          <option key={p.id} value={p.id}>
            {p.anzeigename || personName(p)}
          </option>
        ))}
      </select>
    ) : (
      <span>{props.anzeige(gewaehlt) || '–'}</span>
    );

  const fertig = eigenErgebnis !== null && gegenErgebnis !== null;
  return (
    <tr className={fertig ? 'gespielt' : ''}>
      <td>{spiel.nr}</td>
      <td>
        {DISZIPLIN_KURZ[spiel.disziplin]}
        <small>
          {' '}
          {spiel.disziplin === '14-1' ? `${spiel.ziel} Pkt. / ${spiel.aufnahmen} Aufn.` : `${spiel.ziel} Gewinnsätze`}
        </small>
      </td>
      <td>{auswahl('eigen', props.eigen, props.eigeneWahl)}</td>
      <td>{auswahl('gegner', props.gegen, props.gegnerWahl)}</td>
      <td className="rechts">
        {props.bearbeitbar && partie ? (
          <>
            <input className="zahlfeld" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={uebernehmen} />
            {' : '}
            <input className="zahlfeld" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={uebernehmen} />
          </>
        ) : (
          <span>{fertig ? `${eigenErgebnis} : ${gegenErgebnis}` : '–'}</span>
        )}
      </td>
      <td className="rechts">
        {partie && props.bearbeitbar && (
          <label className="ankreuz" title="Diese Partie fürs Rating werten">
            <input type="checkbox" checked={partie.rating_werten} onChange={(e) => props.wertungSetzen(e.target.checked)} />
            Rating
          </label>
        )}
      </td>
    </tr>
  );
}
