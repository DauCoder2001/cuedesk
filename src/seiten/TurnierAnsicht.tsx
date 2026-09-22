import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { vorgabe } from '../vorgabe';
import { useRueckfrage } from '../rueckfrage';
import { angefangen, auslosen, bergerRunden, hoechstwert, rangliste, spielBeendet } from '../turnier';
import type { RanglistenPartie } from '../turnier';
import { DISZIPLIN_TEXT, MODUS_TEXT, STATUS_TEXT } from './Turniere';
import type { TurnierEinstellungen } from './Turniere';
import type { Partie, Person, RatingQuelle, Turnier, TurnierTeilnehmer } from '../datenbank.types';

// Ein Turnier im Modus Einzelgruppe: Teilnehmer, Auslosung, Spielplan,
// Rangliste und Abschluss. Uebernommene Altturniere werden nur angezeigt.

type Aenderungszeile = { zeitpunkt: string; nachher: Partial<Partie> | null; aktion: string };
type Rueckgaengig = { partieId: string; vorher: Pick<Partie, 'ergebnis_a' | 'ergebnis_b' | 'status' | 'beendet'> };

const QUELLE_KURZ: Partial<Record<RatingQuelle, string>> = {
  vorlaeufig: 'vorläufig',
  'andere-disziplin': 'aus anderer Disziplin',
  vereinsschnitt: 'Vereinsschnitt',
  'von-hand': 'von Hand',
  gast: 'Gast',
  startwert: 'Startwert'
};

const zeitText = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export default function TurnierAnsicht({ turnierId, zurueck }: { turnierId: string; zurueck: () => void }) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const istAdmin = darf('vereinsadmin');

  const [turnier, setTurnier] = useState<Turnier | null>(null);
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [ratings, setRatings] = useState<Map<string, { wert: number; quelle: RatingQuelle }>>(new Map());
  const [tische, setTische] = useState<Map<string, number>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [suche, setSuche] = useState('');
  const [gastName, setGastName] = useState('');
  const [runde, setRunde] = useState<number | null>(null);
  const [verlauf, setVerlauf] = useState<{ partie: Partie; zeilen: Aenderungszeile[] } | null>(null);
  const [stapel, setStapel] = useState<Rueckgaengig[]>([]);
  const [rueckfrage, fragen] = useRueckfrage();

  const laden = useCallback(async () => {
    if (!verein) return;
    const [t, tn, p, pe, ti] = await Promise.all([
      supabase.from('turniere').select('*').eq('id', turnierId).maybeSingle(),
      supabase.from('turnier_teilnehmer').select('*').eq('turnier_id', turnierId),
      supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung'),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('tische').select('id, nummer').eq('verein_id', verein.id)
    ]);
    if (t.error) setFehler(t.error.message);
    setTurnier(t.data ?? null);
    setTeilnehmer(tn.data ?? []);
    setPartien(p.data ?? []);
    setPersonen(pe.data ?? []);
    setTische(new Map((ti.data ?? []).map((x) => [x.id, x.nummer])));

    // Aktuelle Ratings fuer die Anzeige vor der Auslosung (Disziplin, sonst gesamt)
    if (t.data) {
      const { data: stand } = await supabase
        .from('rating_stand')
        .select('stichtag, disziplin, person_id, wert, quelle')
        .eq('verein_id', verein.id)
        .in('disziplin', [t.data.disziplin, 'gesamt'])
        .order('stichtag', { ascending: false })
        .limit(2000);
      const neueste = new Map<string, string>();
      (stand ?? []).forEach((z) => {
        if (!neueste.has(z.disziplin)) neueste.set(z.disziplin, z.stichtag);
      });
      const karte = new Map<string, { wert: number; quelle: RatingQuelle }>();
      for (const art of ['gesamt', t.data.disziplin]) {
        (stand ?? [])
          .filter((z) => z.disziplin === art && z.stichtag === neueste.get(art))
          .forEach((z) => karte.set(z.person_id, { wert: z.wert, quelle: z.quelle }));
      }
      setRatings(karte);
    }
  }, [verein, turnierId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const person = useCallback((id: string) => personen.find((p) => p.id === id), [personen]);
  const anzeige = useCallback(
    (id: string) => {
      const p = person(id);
      return p ? p.anzeigename || `${p.vorname} ${p.nachname}`.trim() : '?';
    },
    [person]
  );

  const einstellungen = (turnier?.einstellungen ?? {}) as TurnierEinstellungen;
  const raceTo = einstellungen.raceTo ?? 5;
  const va = einstellungen.vorgabe ?? { aktiv: false, staerke: 75, obergrenze: 0 };

  // Startnummern-Reihenfolge (Position 0 = Startnummer 1)
  const aufstellung = useMemo(
    () => [...teilnehmer].filter((t) => t.startnummer !== null).sort((a, b) => (a.startnummer ?? 0) - (b.startnummer ?? 0)),
    [teilnehmer]
  );
  const posVon = useMemo(() => new Map(aufstellung.map((t, i) => [t.person_id, i])), [aufstellung]);

  const tabelle = useMemo(() => {
    const eingabe: RanglistenPartie[] = partien
      .filter((p) => posVon.has(p.spieler_a) && posVon.has(p.spieler_b))
      .map((p) => ({
        a: posVon.get(p.spieler_a) as number,
        b: posVon.get(p.spieler_b) as number,
        standA: p.ergebnis_a,
        standB: p.ergebnis_b,
        vorgabeA: p.vorgabe_a,
        vorgabeB: p.vorgabe_b
      }));
    return rangliste(aufstellung.length, eingabe, einstellungen.handReihenfolge ?? {});
  }, [partien, posVon, aufstellung.length, einstellungen.handReihenfolge]);

  const offeneSpiele = partien.filter((p) => !spielBeendet(p.ergebnis_a, p.ergebnis_b, p.race_to ?? raceTo)).length;
  const irgendeinErgebnis = partien.some((p) => angefangen(p.ergebnis_a, p.ergebnis_b, p.vorgabe_a, p.vorgabe_b));
  const runden = useMemo(() => {
    const karte = new Map<number, Partie[]>();
    partien.forEach((p) => {
      const r = p.runde ?? 0;
      karte.set(r, [...(karte.get(r) ?? []), p]);
    });
    return [...karte.entries()].sort((a, b) => a[0] - b[0]);
  }, [partien]);

  if (!verein) return null;
  if (!turnier) {
    return (
      <div className="einspaltig">
        <p className="hinweis">Lädt.</p>
      </div>
    );
  }

  const bearbeitbar = darfLeiten && turnier.status !== 'beendet' && turnier.quelle !== 'import';
  const ratingVon = (id: string) => {
    if (person(id)?.status === 'gast') return { wert: 500, quelle: 'gast' as RatingQuelle };
    return ratings.get(id) ?? { wert: 500, quelle: 'vereinsschnitt' as RatingQuelle };
  };

  // ---------- Teilnehmer ----------

  async function teilnehmerHinzu(personId: string) {
    if (!turnier) return;
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .insert({ turnier_id: turnier.id, person_id: personId, verein_id: turnier.verein_id });
    if (error) setFehler(error.message);
    setSuche('');
    await laden();
  }

  async function teilnehmerWeg(personId: string) {
    if (!turnier) return;
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .delete()
      .eq('turnier_id', turnier.id)
      .eq('person_id', personId);
    if (error) setFehler(error.message);
    await laden();
  }

  async function gastAnlegen() {
    if (!turnier) return;
    const text = gastName.trim().replace(/\s+/g, ' ');
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
          ? 'Gäste anlegen dürfen bisher nur Vereins-Admin und Sportwart.'
          : error?.message ?? 'Gast nicht angelegt.'
      );
    }
    setGastName('');
    await teilnehmerHinzu(data.id);
  }

  // ---------- Auslosung ----------

  async function auslosenUndStarten() {
    if (!turnier) return;
    if (teilnehmer.length < 3) return setFehler('Für ein Turnier braucht es mindestens drei Teilnehmer.');
    if (!(await fragen(`${teilnehmer.length} Teilnehmer auslosen und das Turnier starten?`, 'Auslosen'))) return;
    setArbeitet(true);
    setFehler(null);

    const reihenfolge = auslosen(teilnehmer.map((t) => t.person_id));
    const gerechnet = reihenfolge.map((id) => ({ id, ...ratingVon(id) }));

    // Teilnehmer: Startnummer und eingefrorenes Rating
    for (const [i, g] of gerechnet.entries()) {
      const { error } = await supabase
        .from('turnier_teilnehmer')
        .update({ startnummer: i + 1, rating_eingefroren: g.wert, rating_quelle: g.quelle })
        .eq('turnier_id', turnier.id)
        .eq('person_id', g.id);
      if (error) {
        setArbeitet(false);
        return setFehler(error.message);
      }
    }

    // Spielplan nach dem Berger-Kreis, Vorgabe im Startstand
    const zeilen = bergerRunden(gerechnet.length).flatMap((paare, r) =>
      paare
        .map(([a, b], g) => ({ a, b, g }))
        .filter(({ b }) => b !== -1)
        .map(({ a, b, g }) => {
          const [vA, vB] = vorgabePaar(gerechnet[a].wert, gerechnet[b].wert);
          return {
            verein_id: turnier.verein_id,
            turnier_id: turnier.id,
            disziplin: turnier.disziplin,
            datum: turnier.datum,
            phase: 'gruppe',
            runde: r + 1,
            paarung: g + 1,
            spieler_a: gerechnet[a].id,
            spieler_b: gerechnet[b].id,
            race_to: raceTo,
            vorgabe_a: vA,
            vorgabe_b: vB,
            status: 'geplant' as const
          };
        })
    );
    const { error: fehlerPartien } = await supabase.from('partien').insert(zeilen);
    if (fehlerPartien) {
      setArbeitet(false);
      return setFehler(fehlerPartien.message);
    }

    const { error } = await supabase
      .from('turniere')
      .update({ status: 'laeuft', eingefroren_am: new Date().toISOString(), teilnehmerzahl: gerechnet.length })
      .eq('id', turnier.id);
    if (error) setFehler(error.message);
    setArbeitet(false);
    setRunde(1);
    await laden();
  }

  function vorgabePaar(ratingA: number, ratingB: number): [number, number] {
    if (!va.aktiv || ratingA === ratingB) return [0, 0];
    const grenze = va.obergrenze > 0 ? va.obergrenze : Infinity;
    const v = vorgabe(Math.max(ratingA, ratingB), Math.min(ratingA, ratingB), raceTo, va.staerke, grenze);
    return ratingA > ratingB ? [0, v] : [v, 0];
  }

  // Rating eines Teilnehmers von Hand aendern (nur solange kein Ergebnis steht)
  async function ratingAendern(personId: string, text: string) {
    if (!turnier) return;
    const wert = Number(text);
    if (!Number.isInteger(wert) || wert < 100 || wert > 1000) return setFehler('Rating zwischen 100 und 1000.');
    await supabase
      .from('turnier_teilnehmer')
      .update({ rating_eingefroren: wert, rating_quelle: 'von-hand' })
      .eq('turnier_id', turnier.id)
      .eq('person_id', personId);
    const werte = new Map(teilnehmer.map((t) => [t.person_id, t.rating_eingefroren ?? 500]));
    werte.set(personId, wert);
    for (const p of partien.filter((x) => x.spieler_a === personId || x.spieler_b === personId)) {
      const [vA, vB] = vorgabePaar(werte.get(p.spieler_a) ?? 500, werte.get(p.spieler_b) ?? 500);
      await supabase.from('partien').update({ vorgabe_a: vA, vorgabe_b: vB }).eq('id', p.id);
    }
    await laden();
  }

  // ---------- Ergebnisse ----------

  async function ergebnisSetzen(p: Partie, a: number | null, b: number | null, merken = true) {
    const race = p.race_to ?? raceTo;
    // Eine Seite leer, die andere eingetragen: leere Seite steht auf der Vorgabe
    if (a !== null && b === null) b = p.vorgabe_b;
    if (b !== null && a === null) a = p.vorgabe_a;
    if (a !== null && b !== null) {
      if (a > hoechstwert(b, race) || b > hoechstwert(a, race)) {
        return setFehler(`Bei Race to ${race} ist dieser Stand nicht möglich.`);
      }
    }
    const leer = a === null || b === null || !angefangen(a, b, p.vorgabe_a, p.vorgabe_b);
    const fertig = spielBeendet(a, b, race);
    const neu = {
      ergebnis_a: leer ? null : a,
      ergebnis_b: leer ? null : b,
      status: (leer ? 'geplant' : fertig ? 'beendet' : 'laeuft') as Partie['status'],
      beendet: fertig ? p.beendet ?? new Date().toISOString() : null
    };
    setFehler(null);
    const { error } = await supabase.from('partien').update(neu).eq('id', p.id);
    if (error) return setFehler(error.message);
    if (merken) {
      setStapel((s) => [
        ...s.slice(-49),
        { partieId: p.id, vorher: { ergebnis_a: p.ergebnis_a, ergebnis_b: p.ergebnis_b, status: p.status, beendet: p.beendet } }
      ]);
    }
    setPartien((liste) => liste.map((x) => (x.id === p.id ? { ...x, ...neu } : x)));
  }

  async function rueckgaengig() {
    const letzter = stapel[stapel.length - 1];
    if (!letzter) return;
    const { error } = await supabase.from('partien').update(letzter.vorher).eq('id', letzter.partieId);
    if (error) return setFehler(error.message);
    setStapel((s) => s.slice(0, -1));
    setPartien((liste) => liste.map((x) => (x.id === letzter.partieId ? { ...x, ...letzter.vorher } : x)));
    setMeldung('Letzte Eingabe zurückgenommen.');
  }

  async function verlaufZeigen(p: Partie) {
    const { data, error } = await supabase
      .from('aenderungen')
      .select('zeitpunkt, nachher, aktion')
      .eq('tabelle', 'partien')
      .eq('datensatz_id', p.id)
      .order('zeitpunkt', { ascending: false })
      .limit(50);
    if (error) return setFehler(error.message);
    setVerlauf({ partie: p, zeilen: (data ?? []) as Aenderungszeile[] });
  }

  async function standWiederherstellen(p: Partie, z: Aenderungszeile) {
    const alt = z.nachher ?? {};
    await ergebnisSetzen(p, alt.ergebnis_a ?? null, alt.ergebnis_b ?? null);
    setVerlauf(null);
    setMeldung('Stand wiederhergestellt.');
  }

  // ---------- Stichkampf und Abschluss ----------

  async function handReihenfolgeSetzen(schluessel: string, reihenfolge: number[] | null) {
    if (!turnier) return;
    const hand = { ...(einstellungen.handReihenfolge ?? {}) };
    if (reihenfolge) hand[schluessel] = reihenfolge;
    else delete hand[schluessel];
    const neu = { ...einstellungen, handReihenfolge: hand };
    const { error } = await supabase.from('turniere').update({ einstellungen: neu }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setTurnier({ ...turnier, einstellungen: neu });
  }

  async function abschliessen() {
    if (!turnier) return;
    if (offeneSpiele > 0) return setFehler(`Es sind noch ${offeneSpiele} Spiele offen.`);
    const offen = tabelle.gleichstaende.filter((g) => !g.entschieden);
    if (offen.length > 0 && !(await fragen('Ein Stichkampf ist noch nicht entschieden. Trotzdem abschließen?'))) return;
    const frage = 'Turnier abschließen?\nEndplätze werden gespeichert, das Rating wird neu berechnet.';
    if (!(await fragen(frage, 'Abschließen'))) return;
    setArbeitet(true);
    for (const [i, z] of tabelle.zeilen.entries()) {
      await supabase
        .from('turnier_teilnehmer')
        .update({ endplatz: i + 1 })
        .eq('turnier_id', turnier.id)
        .eq('person_id', aufstellung[z.pos].person_id);
    }
    const { error } = await supabase
      .from('turniere')
      .update({ status: 'beendet', teilnehmerzahl: aufstellung.length })
      .eq('id', turnier.id);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    const rating = await supabase.functions.invoke('rating', { body: { verein_id: turnier.verein_id } });
    setArbeitet(false);
    setMeldung(
      rating.error ? 'Turnier abgeschlossen. Das Rating wird heute Nacht neu berechnet.' : 'Turnier abgeschlossen, Rating neu berechnet.'
    );
    await laden();
  }

  async function wiederOeffnen() {
    if (!turnier || !(await fragen('Turnier wieder öffnen? Ergebnisse lassen sich dann wieder ändern.', 'Wieder öffnen'))) return;
    const { error } = await supabase.from('turniere').update({ status: 'laeuft' }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function loeschen() {
    if (!turnier || !(await fragen(`„${turnier.name}“ mit allen Teilnehmern und Partien löschen?`, 'Löschen'))) return;
    const { error } = await supabase.from('turniere').delete().eq('id', turnier.id);
    if (error) return setFehler(error.message);
    zurueck();
  }

  // ---------- Anzeige ----------

  const teilnehmerIds = new Set(teilnehmer.map((t) => t.person_id));
  const vorschlaege =
    suche.trim().length > 0
      ? personen
          .filter((p) => p.status !== 'ausgetreten' && !teilnehmerIds.has(p.id))
          .filter((p) => `${p.vorname} ${p.nachname} ${p.anzeigename ?? ''}`.toLowerCase().includes(suche.toLowerCase()))
          .sort((a, b) => personName(a).localeCompare(personName(b), 'de'))
          .slice(0, 8)
      : [];

  const aktiveRunde = runde ?? runden.find(([, liste]) => liste.some((p) => p.status !== 'beendet'))?.[0] ?? runden[0]?.[0] ?? 1;
  const alleFertig = partien.length > 0 && offeneSpiele === 0;

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <div>
            <button type="button" className="zurueck" onClick={zurueck}>
              ← Turniere
            </button>
            <h2>{turnier.name}</h2>
            <p className="hinweis">
              {new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}{' '}
              · {DISZIPLIN_TEXT[turnier.disziplin]} · {MODUS_TEXT[turnier.modus]}
              {turnier.quelle !== 'import' && ` · Race to ${raceTo}`}
              {va.aktiv && ` · Vorgabe ${va.staerke} %${va.obergrenze > 0 ? `, höchstens ${va.obergrenze}` : ''}`}
              {!turnier.rating_werten && ' · zählt nicht fürs Rating'}
            </p>
          </div>
          <div className="knopfpaar">
            <span className={`marke ${turnier.status === 'laeuft' ? 'livelaeuft' : ''}`}>{STATUS_TEXT[turnier.status]}</span>
            {bearbeitbar && turnier.status === 'laeuft' && (
              <button type="button" onClick={() => void abschliessen()} disabled={arbeitet}>
                Abschließen
              </button>
            )}
            {istAdmin && turnier.status === 'beendet' && turnier.quelle !== 'import' && (
              <button type="button" onClick={() => void wiederOeffnen()}>
                Wieder öffnen
              </button>
            )}
          </div>
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      {turnier.quelle === 'import' ? (
        <Altturnier teilnehmer={teilnehmer} partien={partien} anzeige={anzeige} />
      ) : turnier.status === 'geplant' ? (
        <section className="block">
          <h2>Teilnehmer ({teilnehmer.length})</h2>
          <table className="tabelle">
            <tbody>
              {[...teilnehmer]
                .sort((a, b) => anzeige(a.person_id).localeCompare(anzeige(b.person_id), 'de'))
                .map((t) => {
                  const r = ratingVon(t.person_id);
                  return (
                    <tr key={t.person_id}>
                      <td>
                        {anzeige(t.person_id)}
                        {person(t.person_id)?.status === 'gast' && <span className="marke">Gast</span>}
                      </td>
                      <td className="rechts">
                        {r.wert}
                        {QUELLE_KURZ[r.quelle] && <span className="marke">{QUELLE_KURZ[r.quelle]}</span>}
                      </td>
                      <td className="rechts">
                        {bearbeitbar && (
                          <button type="button" onClick={() => void teilnehmerWeg(t.person_id)}>
                            Entfernen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {teilnehmer.length === 0 && (
                <tr>
                  <td className="hinweis">Noch niemand angemeldet.</td>
                </tr>
              )}
            </tbody>
          </table>

          {bearbeitbar && (
            <>
              <div className="zeile">
                <input placeholder="Mitglied suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
              </div>
              {vorschlaege.length > 0 && (
                <div className="filterzeile">
                  {vorschlaege.map((p) => (
                    <button key={p.id} type="button" className="chip" onClick={() => void teilnehmerHinzu(p.id)}>
                      + {personName(p)}
                      {p.status === 'gast' ? ' (Gast)' : ''}
                    </button>
                  ))}
                </div>
              )}
              <div className="zeile">
                <input placeholder="Neuer Gast: Vor- und Nachname" value={gastName} onChange={(e) => setGastName(e.target.value)} />
                <button type="button" onClick={() => void gastAnlegen()}>
                  Gast hinzufügen
                </button>
              </div>
              <div className="knopfpaar">
                <button type="button" onClick={() => void auslosenUndStarten()} disabled={arbeitet || teilnehmer.length < 3}>
                  Auslosen und starten
                </button>
                <button type="button" className="gefahrknopf" onClick={() => void loeschen()}>
                  Turnier löschen
                </button>
              </div>
              <p className="hinweis">
                Beim Auslosen werden die Startnummern zufällig vergeben, der Spielplan entsteht und die Ratings werden
                eingefroren. Gäste starten mit 500.
              </p>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="turnierzweier">
            <section className="block">
              <h2>Teilnehmer</h2>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Nr.</th>
                    <th>Name</th>
                    <th className="rechts">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {aufstellung.map((t) => (
                    <tr key={t.person_id}>
                      <td>{t.startnummer}</td>
                      <td>
                        {anzeige(t.person_id)}
                        {person(t.person_id)?.status === 'gast' && <span className="marke">Gast</span>}
                      </td>
                      <td className="rechts">
                        {bearbeitbar && !irgendeinErgebnis ? (
                          <input
                            className="zahlfeld"
                            defaultValue={t.rating_eingefroren ?? ''}
                            onBlur={(e) => {
                              if (e.target.value !== String(t.rating_eingefroren ?? '')) void ratingAendern(t.person_id, e.target.value);
                            }}
                          />
                        ) : (
                          t.rating_eingefroren
                        )}
                        {t.rating_quelle && QUELLE_KURZ[t.rating_quelle] && (
                          <span className="marke">{QUELLE_KURZ[t.rating_quelle]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hinweis">
                {irgendeinErgebnis
                  ? `Ratings eingefroren am ${turnier.eingefroren_am ? zeitText(turnier.eingefroren_am) : '–'}.`
                  : 'Bis zum ersten Ergebnis lassen sich die Ratings noch von Hand ändern; die Vorgaben rechnen sich neu.'}
              </p>
            </section>

            <section className="block">
              <div className="bearbeitenkopf">
                <h2>Spielplan</h2>
                {bearbeitbar && (
                  <button type="button" onClick={() => void rueckgaengig()} disabled={stapel.length === 0}>
                    Rückgängig{stapel.length > 0 ? ` (${stapel.length})` : ''}
                  </button>
                )}
              </div>
              <div className="filterzeile">
                {runden.map(([nr, liste]) => (
                  <button
                    key={nr}
                    type="button"
                    className={nr === aktiveRunde ? 'chip aktiv' : 'chip'}
                    onClick={() => setRunde(nr)}
                  >
                    Runde {nr}
                    {liste.every((p) => spielBeendet(p.ergebnis_a, p.ergebnis_b, p.race_to ?? raceTo)) ? ' ✓' : ''}
                  </button>
                ))}
              </div>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Spiel</th>
                    <th className="rechts">Vorgabe</th>
                    <th className="rechts">Stand</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(runden.find(([nr]) => nr === aktiveRunde)?.[1] ?? []).map((p) => (
                    <Spielzeile
                      key={p.id}
                      partie={p}
                      raceTo={p.race_to ?? raceTo}
                      nameA={anzeige(p.spieler_a)}
                      nameB={anzeige(p.spieler_b)}
                      tisch={p.tisch_id ? tische.get(p.tisch_id) ?? null : null}
                      bearbeitbar={bearbeitbar}
                      speichern={(a, b) => void ergebnisSetzen(p, a, b)}
                      verlauf={() => void verlaufZeigen(p)}
                    />
                  ))}
                </tbody>
              </table>
              {aufstellung.length % 2 === 1 && (
                <p className="hinweis">
                  Spielfrei in Runde {aktiveRunde}:{' '}
                  {(() => {
                    const spielen = new Set(
                      (runden.find(([nr]) => nr === aktiveRunde)?.[1] ?? []).flatMap((p) => [p.spieler_a, p.spieler_b])
                    );
                    return aufstellung.filter((t) => !spielen.has(t.person_id)).map((t) => anzeige(t.person_id)).join(', ');
                  })()}
                </p>
              )}
            </section>
          </div>

          <section className="block">
            <h2>Rangliste{turnier.status === 'laeuft' ? ' (live)' : ''}</h2>
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Pl.</th>
                  <th>Name</th>
                  <th className="rechts">Spiele</th>
                  <th className="rechts">Punkte</th>
                  <th className="rechts">Sätze</th>
                  <th className="rechts">Satz-Diff.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tabelle.zeilen.map((z, i) => {
                  const gruppe = alleFertig
                    ? tabelle.gleichstaende.find((g) => i >= g.start && i < g.start + g.mitglieder.length)
                    : undefined;
                  const inGruppe = gruppe ? i - gruppe.start : -1;
                  return (
                    <tr key={z.pos}>
                      <td>{i + 1}</td>
                      <td>{anzeige(aufstellung[z.pos]?.person_id ?? '')}</td>
                      <td className="rechts">{z.spiele}</td>
                      <td className="rechts">{z.punkte}</td>
                      <td className="rechts">
                        {z.gewonnen} : {z.verloren}
                      </td>
                      <td className="rechts">{z.diff > 0 ? `+${z.diff}` : z.diff}</td>
                      <td className="rechts">
                        {gruppe && (
                          <span className={`marke ${gruppe.entschieden ? '' : 'stichkampf'}`}>
                            {gruppe.entschieden ? 'Stichkampf entschieden' : 'Stichkampf offen'}
                          </span>
                        )}
                        {gruppe && bearbeitbar && (
                          <>
                            <button
                              type="button"
                              className="klein"
                              disabled={inGruppe === 0}
                              title="nach oben"
                              onClick={() => {
                                const r = [...gruppe.mitglieder];
                                [r[inGruppe - 1], r[inGruppe]] = [r[inGruppe], r[inGruppe - 1]];
                                void handReihenfolgeSetzen(gruppe.schluessel, r);
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="klein"
                              disabled={inGruppe === gruppe.mitglieder.length - 1}
                              title="nach unten"
                              onClick={() => {
                                const r = [...gruppe.mitglieder];
                                [r[inGruppe + 1], r[inGruppe]] = [r[inGruppe], r[inGruppe + 1]];
                                void handReihenfolgeSetzen(gruppe.schluessel, r);
                              }}
                            >
                              ↓
                            </button>
                            {gruppe.entschieden && inGruppe === 0 && (
                              <button type="button" className="klein" onClick={() => void handReihenfolgeSetzen(gruppe.schluessel, null)}>
                                zurücksetzen
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="hinweis">
              {offeneSpiele > 0
                ? `Noch ${offeneSpiele} Spiele offen. Ein Stichkampf wird erst angeboten, wenn alle Spiele beendet sind.`
                : 'Reihenfolge: Punkte, Satzdifferenz, direkter Vergleich, danach Stichkampf.'}
            </p>
          </section>
        </>
      )}

      {rueckfrage}
      {verlauf && (
        <div className="dialoghintergrund" onClick={() => setVerlauf(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>
              Verlauf: {anzeige(verlauf.partie.spieler_a)} – {anzeige(verlauf.partie.spieler_b)}
            </h2>
            <table className="tabelle">
              <tbody>
                {verlauf.zeilen.map((z, i) => (
                  <tr key={i}>
                    <td>{zeitText(z.zeitpunkt)}</td>
                    <td className="rechts">
                      {z.nachher?.ergebnis_a ?? '–'} : {z.nachher?.ergebnis_b ?? '–'}
                    </td>
                    <td className="rechts">
                      {i > 0 && bearbeitbar && (
                        <button type="button" onClick={() => void standWiederherstellen(verlauf.partie, z)}>
                          Wiederherstellen
                        </button>
                      )}
                      {i === 0 && <span className="hinweis">aktuell</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setVerlauf(null)}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Eine Spielzeile mit zwei Eingabefeldern. Gespeichert wird beim Verlassen
// des Feldes oder mit Enter.
function Spielzeile(props: {
  partie: Partie;
  raceTo: number;
  nameA: string;
  nameB: string;
  tisch: number | null;
  bearbeitbar: boolean;
  speichern: (a: number | null, b: number | null) => void;
  verlauf: () => void;
}) {
  const { partie: p } = props;
  const text = (w: number | null) => (w === null ? '' : String(w));
  const [a, setA] = useState(text(p.ergebnis_a));
  const [b, setB] = useState(text(p.ergebnis_b));
  const zeile = useRef<HTMLTableRowElement>(null);

  // Neuer Stand von aussen (Rueckgaengig, Verlauf, spaeter Tablet): uebernehmen,
  // solange hier niemand tippt.
  useEffect(() => {
    if (zeile.current?.contains(document.activeElement)) return;
    setA(text(p.ergebnis_a));
    setB(text(p.ergebnis_b));
  }, [p.ergebnis_a, p.ergebnis_b]);

  const zahl = (t: string) => (t.trim() === '' ? null : Number(t));
  // Gespeichert wird erst, wenn der Cursor die Zeile verlaesst, nicht beim
  // Wechsel zwischen den beiden Feldern desselben Spiels.
  const uebernehmen = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.relatedTarget && zeile.current?.contains(e.relatedTarget as Node)) return;
    const na = zahl(a);
    const nb = zahl(b);
    if (na === p.ergebnis_a && nb === p.ergebnis_b) return;
    props.speichern(na, nb);
  };
  const fertig = spielBeendet(p.ergebnis_a, p.ergebnis_b, props.raceTo);
  const vorgabeText = p.vorgabe_a || p.vorgabe_b ? `${p.vorgabe_a} : ${p.vorgabe_b}` : '–';
  const status = fertig
    ? 'fertig'
    : props.tisch !== null
      ? `● Tisch ${props.tisch}`
      : p.status === 'laeuft'
        ? 'läuft'
        : 'offen';

  const feld = (wert: string, setzen: (t: string) => void, platzhalter: number) =>
    props.bearbeitbar ? (
      <input
        className="zahlfeld"
        inputMode="numeric"
        value={wert}
        placeholder={String(platzhalter)}
        onChange={(e) => setzen(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={uebernehmen}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const felder = zeile.current?.querySelectorAll('input') ?? [];
          // Enter im ersten Feld springt ins zweite, im zweiten wird gespeichert
          if (e.target === felder[0] && felder[1]) (felder[1] as HTMLInputElement).focus();
          else (e.target as HTMLInputElement).blur();
        }}
      />
    ) : (
      <span>{wert === '' ? '–' : wert}</span>
    );

  return (
    <tr ref={zeile} className={fertig ? 'gespielt' : ''}>
      <td>
        {props.nameA} – {props.nameB}
      </td>
      <td className="rechts hinweis">{vorgabeText}</td>
      <td className="rechts">
        {feld(a, setA, p.vorgabe_a)} : {feld(b, setB, p.vorgabe_b)}
      </td>
      <td className={fertig ? 'livelaeuft' : 'hinweis'}>{status}</td>
      <td className="rechts">
        <button type="button" className="klein" title="Verlauf" onClick={props.verlauf}>
          Verlauf
        </button>
      </td>
    </tr>
  );
}

// Uebernommenes Altturnier: Endplaetze und Partien, nur lesen
function Altturnier({
  teilnehmer,
  partien,
  anzeige
}: {
  teilnehmer: TurnierTeilnehmer[];
  partien: Partie[];
  anzeige: (id: string) => string;
}) {
  const plaetze = [...teilnehmer].sort((a, b) => (a.endplatz ?? 999) - (b.endplatz ?? 999));
  return (
    <div className="turnierzweier">
      <section className="block">
        <h2>Endstand</h2>
        <table className="tabelle">
          <tbody>
            {plaetze.map((t) => (
              <tr key={t.person_id}>
                <td>{t.endplatz ?? '–'}</td>
                <td>{anzeige(t.person_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="block">
        <h2>Partien ({partien.length})</h2>
        <table className="tabelle">
          <tbody>
            {partien.map((p) => (
              <tr key={p.id}>
                <td className="hinweis">{p.phase ?? ''}</td>
                <td>
                  {anzeige(p.spieler_a)} – {anzeige(p.spieler_b)}
                </td>
                <td className="rechts">
                  {p.ergebnis_a ?? '–'} : {p.ergebnis_b ?? '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hinweis">Übernommen aus Turnier light, nur zum Nachsehen.</p>
      </section>
    </div>
  );
}
