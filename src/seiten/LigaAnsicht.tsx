import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import { LIGEN, aufstellungPruefen, spielplan, wertung } from '../liga';
import { kaderHinweise } from '../mannschaften';
import { schutzwortStimmt } from '../schutzwort';
import { STATUS_TEXT } from './Turniere';
import SpielberichtImport from './SpielberichtImport';
import type { LigaSpiel } from '../liga';
import type { TurnierEinstellungen } from './Turniere';
import type { Mannschaft, MannschaftSpieler, Partie, Person, Turnier, TurnierTeilnehmer } from '../datenbank.types';

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

export default function LigaAnsicht({
  turnierId,
  zurueck,
  oeffnen
}: {
  turnierId: string;
  zurueck: () => void;
  oeffnen: (id: string) => void;
}) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const istAdmin = darf('vereinsadmin');

  const [turnier, setTurnier] = useState<Turnier | null>(null);
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [mannschaften, setMannschaften] = useState<Mannschaft[]>([]);
  const [kader, setKader] = useState<MannschaftSpieler[]>([]);
  // Status der anderen Begegnung desselben Spieltags (null: gibt es noch nicht)
  const [partnerStatus, setPartnerStatus] = useState<Turnier['status'] | null>(null);
  const [gastName, setGastName] = useState('');
  const [passwortFrage, setPasswortFrage] = useState<{ runde: 'hin' | 'rueck'; seite: 'heim' | 'gast' } | null>(null);
  const [passwort, setPasswort] = useState('');
  const [importOffen, setImportOffen] = useState(false);
  // Halbe Aufstellung: solange nur eine Seite gewaehlt ist, gibt es noch keine
  // Partie in der Datenbank. Die Wahl haelt deshalb die Ansicht fest.
  const [wahl, setWahl] = useState<Record<number, { heim?: string | null; gast?: string | null }>>({});
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  const laden = useCallback(async () => {
    if (!verein) return;
    const [t, tn, p, pe, ma, ka] = await Promise.all([
      supabase.from('turniere').select('*').eq('id', turnierId).maybeSingle(),
      supabase.from('turnier_teilnehmer').select('*').eq('turnier_id', turnierId),
      supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung'),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('mannschaften').select('*').eq('verein_id', verein.id),
      supabase.from('mannschaft_spieler').select('*').eq('verein_id', verein.id)
    ]);
    if (t.error) setFehler(t.error.message);
    setTurnier(t.data ?? null);
    setTeilnehmer(tn.data ?? []);
    setPartien(p.data ?? []);
    setPersonen(pe.data ?? []);
    setMannschaften(ma.data ?? []);
    setKader(ka.data ?? []);
    const partnerId = (t.data?.einstellungen as TurnierEinstellungen | null)?.liga?.partner;
    if (partnerId) {
      const { data: partner } = await supabase.from('turniere').select('status').eq('id', partnerId).maybeSingle();
      setPartnerStatus(partner?.status ?? null);
    } else {
      setPartnerStatus(null);
    }
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
  // Aeltere Spieltage kennen die Begegnungsnummer noch nicht
  const liga = einstellungen.liga ? { ...einstellungen.liga, begegnung: einstellungen.liga.begegnung ?? 1 } : undefined;
  const spiele = useMemo(() => (liga ? spielplan(liga.ziele) : []), [liga]);

  // Partie zu einem Spiel des Plans (Runde 1 = Hinrunde, 2 = Rueckrunde)
  const partieVon = useCallback(
    (s: LigaSpiel) => partien.find((p) => p.runde === (s.runde === 'hin' ? 1 : 2) && p.paarung === s.paarung) ?? null,
    [partien]
  );

  // Heim steht immer auf Seite A, so wie im Spielbericht des Verbands.
  // Unsere Mannschaft ist je nach Heimrecht die Heim- oder die Gastseite.
  const wirSindHeim = liga?.heim ?? true;
  const heimSpieler = (s: LigaSpiel) => {
    const gemerkt = wahl[s.nr]?.heim;
    return gemerkt !== undefined ? gemerkt : partieVon(s)?.spieler_a ?? null;
  };
  const gastSpieler = (s: LigaSpiel) => {
    const gemerkt = wahl[s.nr]?.gast;
    return gemerkt !== undefined ? gemerkt : partieVon(s)?.spieler_b ?? null;
  };
  const unsererSpieler = (s: LigaSpiel) => (wirSindHeim ? heimSpieler(s) : gastSpieler(s));
  const istVerdeckt = (runde: 'hin' | 'rueck', seite: 'heim' | 'gast') =>
    Boolean(liga?.verdeckt?.[runde]?.[seite]);

  const ergebnisse = useMemo(
    () =>
      spiele.map((s) => {
        const p = partieVon(s);
        // Der Rating-Haken einer Partie ändert die Partiepunkte nicht
        return { nr: s.nr, heim: p?.ergebnis_a ?? null, gast: p?.ergebnis_b ?? null };
      }),
    [spiele, partieVon]
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
    spiele.forEach((s) => (plan[s.nr] = unsererSpieler(s)));
    return aufstellungPruefen(spiele, plan, (id) => anzeige(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiele, partien, wahl, anzeige, wirSindHeim]);

  const hinweiseKader = useMemo(() => {
    const eigene = mannschaften.find((m) => m.id === liga?.mannschaft_id);
    if (!eigene || spiele.length === 0) return [];
    const derSaison = mannschaften.filter((m) => m.saison === eigene.saison);
    return kaderHinweise({
      mannschaft: { id: eigene.id, name: eigene.name, rang: eigene.rang },
      aufgestellt: spiele.map((s) => unsererSpieler(s)).filter((id): id is string => Boolean(id)),
      kader: kader.filter((k) => derSaison.some((m) => m.id === k.mannschaft_id)),
      mannschaften: derSaison.map((m) => ({ id: m.id, name: m.name, rang: m.rang })),
      name: (id) => anzeige(id)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mannschaften, kader, spiele, partien, wahl, anzeige, liga?.mannschaft_id, wirSindHeim]);

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
  async function spielerSetzen(s: LigaSpiel, seite: 'heim' | 'gast', personId: string | null) {
    if (!turnier || !liga) return;
    const vorhanden = partieVon(s);
    if (vorhanden && (vorhanden.tisch_id || vorhanden.status === 'beendet')) {
      return setFehler(
        vorhanden.status === 'beendet'
          ? 'Die Partie ist beendet. Zum Ändern zuerst das Ergebnis löschen.'
          : 'Die Partie läuft gerade an einem Tisch. Sie lässt sich erst ändern, wenn sie dort abgeschlossen oder abgebrochen ist.'
      );
    }
    const heim = seite === 'heim' ? personId : heimSpieler(s);
    const gast = seite === 'gast' ? personId : gastSpieler(s);
    setFehler(null);
    setWahl((bisher) => ({ ...bisher, [s.nr]: { heim, gast } }));

    if (!heim || !gast) {
      // Ohne beide Spieler gibt es noch keine Partie; eine bestehende entfaellt
      if (vorhanden) {
        await supabase.from('partien').delete().eq('id', vorhanden.id);
        await laden();
      }
      return;
    }
    const spieler_a = heim;
    const spieler_b = gast;
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
    await teilnehmerPflegen([heim, gast]);
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

  async function ergebnisSetzen(s: LigaSpiel, heimWert: number | null, gastWert: number | null) {
    const p = partieVon(s);
    if (!p) return setFehler('Erst beide Spieler eintragen.');
    const ergebnis_a = heimWert;
    const ergebnis_b = gastWert;
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

  // Die zweite Begegnung eines Spieltags: gleicher Tag, gleicher Gegner,
  // getauschtes Heimrecht. Sie entsteht beim ersten Aufruf.
  async function begegnungOeffnen(nummer: 1 | 2) {
    if (!turnier || !liga || nummer === liga.begegnung) return;
    if (liga.partner) return oeffnen(liga.partner);
    if (!darfLeiten) return setFehler('Die zweite Begegnung legt die Turnierleitung an.');
    setArbeitet(true);
    const andere = {
      ...liga,
      heim: !liga.heim,
      begegnung: nummer,
      partner: turnier.id
    };
    const { data, error } = await supabase
      .from('turniere')
      .insert({
        verein_id: turnier.verein_id,
        name: `${turnier.name.replace(/ · [12]\. Begegnung$/, '')} · ${nummer}. Begegnung`,
        datum: turnier.datum,
        disziplin: 'multi-ball',
        modus: 'liga',
        status: 'geplant',
        rating_werten: turnier.rating_werten,
        einstellungen: { ...einstellungen, liga: andere }
      })
      .select('id')
      .single();
    if (error || !data) {
      setArbeitet(false);
      return setFehler(error?.message ?? 'Zweite Begegnung nicht angelegt.');
    }
    // Rueckverweis in der ersten Begegnung merken
    await supabase
      .from('turniere')
      .update({ einstellungen: { ...einstellungen, liga: { ...liga, partner: data.id } } })
      .eq('id', turnier.id);
    setArbeitet(false);
    oeffnen(data.id);
  }

  // Aufstellung einer Mannschaft verbergen oder wieder zeigen. Verbergen geht
  // ohne Nachfrage, zeigen nur mit dem Passwort.
  async function verdeckenSetzen(runde: 'hin' | 'rueck', seite: 'heim' | 'gast', verbergen: boolean) {
    if (!turnier || !liga) return;
    const verdeckt = {
      ...(liga.verdeckt ?? {}),
      [runde]: { ...(liga.verdeckt?.[runde] ?? {}), [seite]: verbergen }
    };
    const neu = { ...einstellungen, liga: { ...liga, verdeckt } };
    const { error } = await supabase.from('turniere').update({ einstellungen: neu }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setTurnier({ ...turnier, einstellungen: neu });
  }

  async function passwortPruefen() {
    if (!passwortFrage) return;
    if (!schutzwortStimmt(passwort)) {
      setFehler('Das Passwort stimmt nicht.');
      return;
    }
    setFehler(null);
    const { runde, seite } = passwortFrage;
    setPasswortFrage(null);
    setPasswort('');
    await verdeckenSetzen(runde, seite, false);
  }

  async function ratingUmschalten() {
    if (!turnier) return;
    const { error } = await supabase.from('turniere').update({ rating_werten: !turnier.rating_werten }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  // Jede Begegnung wird fuer sich abgeschlossen; danach sind ihre Ergebnisse
  // gesperrt. Gerechnet wird das Rating erst, wenn der ganze Spieltag - also
  // auch die andere Begegnung - abgeschlossen ist.
  async function abschliessen() {
    if (!turnier || !liga) return;
    const name = `${liga.begegnung}. Begegnung`;
    if (punkte.offen > 0 && !(await fragen(`Noch ${punkte.offen} Partien ohne Ergebnis. ${name} trotzdem abschließen?`))) return;
    // Zweite Begegnung noch nicht angelegt oder schon fertig: dann ist das hier der Schluss
    const letzte = partnerStatus === null || partnerStatus === 'beendet';
    const zusatz = letzte
      ? turnier.rating_werten
        ? '\nDamit ist der Spieltag komplett, das Rating wird neu berechnet.'
        : '\nDamit ist der Spieltag komplett.'
      : turnier.rating_werten
        ? '\nDie Ergebnisse sind danach gesperrt. Ins Rating gehen sie beim nächtlichen Lauf ein, sofort erst mit dem Abschluss der anderen Begegnung.'
        : '\nDie Ergebnisse sind danach gesperrt.';
    if (!(await fragen(`${name} abschließen?${zusatz}`, 'Abschließen'))) return;
    setArbeitet(true);
    const { error } = await supabase.from('turniere').update({ status: 'beendet' }).eq('id', turnier.id);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    if (!letzte) {
      setArbeitet(false);
      setMeldung(
        turnier.rating_werten
          ? `${name} abgeschlossen. Ins Rating gehen die Ergebnisse heute Nacht ein, sofort erst mit dem Abschluss der anderen Begegnung.`
          : `${name} abgeschlossen.`
      );
      await laden();
      return;
    }
    if (!turnier.rating_werten) {
      setArbeitet(false);
      setMeldung('Spieltag abgeschlossen. Er zählt nicht fürs Rating.');
      await laden();
      return;
    }
    const rating = await supabase.functions.invoke('rating', { body: { verein_id: turnier.verein_id } });
    setArbeitet(false);
    setMeldung(
      rating.error
        ? 'Spieltag abgeschlossen. Das Rating wird heute Nacht neu berechnet.'
        : 'Spieltag abgeschlossen, Rating neu berechnet.'
    );
    await laden();
  }

  // Erst ein laufender Spieltag erscheint an den Tablets. Gestartet wird er
  // von Hand, damit die Aufstellung vorher in Ruhe eingetragen werden kann.
  async function starten() {
    if (!turnier) return;
    const { error } = await supabase.from('turniere').update({ status: 'laeuft' }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setMeldung('Spieltag gestartet. Die Partien stehen jetzt an den Tablets zur Auswahl.');
    await laden();
  }

  async function wiederOeffnen() {
    if (!turnier || !(await fragen('Spieltag wieder öffnen?', 'Wieder öffnen'))) return;
    const { error } = await supabase.from('turniere').update({ status: 'laeuft' }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function loeschen() {
    if (!turnier) return;
    const zusatz =
      partien.length > 0
        ? `\n\n${partien.length} Partien gehen mit verloren.${turnier.rating_werten ? ' Danach das Rating neu berechnen.' : ''}`
        : '';
    if (!(await fragen(`Spieltag „${turnier.name}“ mit allen Partien löschen?${zusatz}`, 'Löschen'))) return;
    const { error } = await supabase.from('turniere').delete().eq('id', turnier.id);
    if (error) return setFehler(error.message);
    zurueck();
  }

  // ---------- Anzeige ----------

  const eigenerName = liga.eigene || verein.name;
  // Spaltenfolge wie im Spielbericht: erst Heim, dann Gast
  const heimMannschaft = wirSindHeim ? eigenerName : liga.gegner;
  const gastMannschaft = wirSindHeim ? liga.gegner : eigenerName;
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
            <div className="zeile">
              <span className="hinweis">Begegnung:</span>
              <span className="umschalter">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={liga.begegnung === n ? 'aktiv' : ''}
                    disabled={arbeitet}
                    onClick={() => void begegnungOeffnen(n)}
                  >
                    {n}. Begegnung
                    {(n === liga.begegnung ? turnier.status : partnerStatus) === 'beendet' ? ' ✓' : ''}
                  </button>
                ))}
              </span>
              <span className="hinweis">
                {liga.begegnung === 1
                  ? 'zuerst gespielt'
                  : 'danach gespielt, mit getauschtem Heimrecht'}
              </span>
            </div>
            <p className="hinweis">
              {datumLang(turnier.datum)} · {eigenerName} gegen {liga.gegner} · {liga.heim ? 'Heimspiel' : 'Auswärtsspiel'} ·
              14.1 {liga.ziele.punkte141} Punkte / {liga.ziele.aufnahmen141} Aufnahmen · 8-Ball {liga.ziele['8-ball']} ·
              9-Ball {liga.ziele['9-ball']} · 10-Ball {liga.ziele['10-ball']} Gewinnsätze
            </p>
            {!turnier.rating_werten && (
              <p className="hinweis">Keine Partie dieses Spieltags zählt fürs Rating.</p>
            )}
          </div>
          <div className="knopfpaar">
            <span className={`marke ${turnier.status === 'laeuft' ? 'livelaeuft' : ''}`}>{STATUS_TEXT[turnier.status]}</span>
            {bearbeitbar && turnier.status === 'geplant' && (
              <button type="button" onClick={() => void starten()}>
                Spieltag starten
              </button>
            )}
            {bearbeitbar && (
              <button type="button" onClick={() => setImportOffen(true)}>
                Spielbericht einlesen
              </button>
            )}
            {bearbeitbar && (
              <button type="button" onClick={() => void ratingUmschalten()}>
                {turnier.rating_werten ? 'Nicht fürs Rating werten' : 'Fürs Rating werten'}
              </button>
            )}
            {bearbeitbar && (
              <button type="button" onClick={() => void abschliessen()} disabled={arbeitet}>
                Begegnung abschließen
              </button>
            )}
            {istAdmin && turnier.status === 'beendet' && (
              <button type="button" onClick={() => void wiederOeffnen()}>
                Wieder öffnen
              </button>
            )}
            {istAdmin && (
              <button type="button" className="gefahrknopf" onClick={() => void loeschen()}>
                Löschen
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
              {heimMannschaft} gegen {gastMannschaft}
            </small>
          </div>
          <div>
            <span>Matchpunkte</span>
            <strong>{punkte.entschieden ? `${punkte.matchpunkte[0]} : ${punkte.matchpunkte[1]}` : '–'}</strong>
            <small>
              {punkte.entschieden
                ? 'endgültig'
                : punkte.partiepunkte[0] + punkte.partiepunkte[1] === 0
                  ? `noch keine Partie entschieden, ${punkte.offen} offen`
                  : `Zwischenstand ${punkte.matchpunkte[0]} : ${punkte.matchpunkte[1]}, noch ${punkte.offen} Partien offen`}
            </small>
          </div>
        </div>
        {fehlerAufstellung.length > 0 && (
          <div className="pausehinweis">
            <strong>Aufstellung prüfen:</strong> {fehlerAufstellung.join(' ')}
          </div>
        )}
        {hinweiseKader.length > 0 && (
          <div className="pausehinweis">
            <strong>Kader:</strong> {hinweiseKader.join(' ')}
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
                <th>
                  {heimMannschaft}
                  <small> {wirSindHeim ? 'wir, Heim' : 'Heim'}</small>
                </th>
                <th>
                  {gastMannschaft}
                  <small> {wirSindHeim ? 'Gast' : 'wir, Gast'}</small>
                </th>
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
                      heim={heimSpieler(s)}
                      gast={gastSpieler(s)}
                      heimWahl={wirSindHeim ? eigeneMitglieder : gaeste}
                      gastWahl={wirSindHeim ? gaeste : eigeneMitglieder}
                      heimVerdeckt={istVerdeckt(r.runde, 'heim')}
                      gastVerdeckt={istVerdeckt(r.runde, 'gast')}
                      anzeige={anzeige}
                      bearbeitbar={bearbeitbar}
                      spielerSetzen={(seite, id) => void spielerSetzen(s, seite, id)}
                      ergebnisSetzen={(a, b) => void ergebnisSetzen(s, a, b)}
                      wertungSetzen={(werten) => void partieWertung(s, werten)}
                    />
                  );
                })}
            </tbody>
            {bearbeitbar && (
              <tfoot>
                <tr>
                  <td colSpan={2}></td>
                  {(['heim', 'gast'] as const).map((seite) => (
                    <td key={seite} className="mittig">
                      <button
                        type="button"
                        title="Verborgene Aufstellungen sieht der Gegner nicht. Zum Zeigen wird das Passwort gebraucht."
                        onClick={() =>
                          istVerdeckt(r.runde, seite)
                            ? setPasswortFrage({ runde: r.runde, seite })
                            : void verdeckenSetzen(r.runde, seite, true)
                        }
                      >
                        Aufstellung {istVerdeckt(r.runde, seite) ? 'zeigen' : 'verbergen'}
                      </button>
                    </td>
                  ))}
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
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
        </section>
      )}
      {rueckfrage}
      {importOffen && (
        <SpielberichtImport
          turnier={turnier}
          liga={liga}
          personen={personen}
          partien={partien}
          schliessen={() => setImportOffen(false)}
          fertig={() => {
            setImportOffen(false);
            void laden();
          }}
        />
      )}
      {passwortFrage && (
        <div className="dialoghintergrund" onClick={() => setPasswortFrage(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Aufstellung zeigen</h2>
            <p>
              Aufstellung von {passwortFrage.seite === 'heim' ? heimMannschaft : gastMannschaft} in der{' '}
              {passwortFrage.runde === 'hin' ? 'Hinrunde' : 'Rückrunde'} sichtbar machen.
            </p>
            <div className="zeile">
              <input
                type="password"
                placeholder="Passwort"
                value={passwort}
                autoFocus
                onChange={(e) => setPasswort(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void passwortPruefen()}
              />
              <button type="button" onClick={() => void passwortPruefen()}>
                Zeigen
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setPasswortFrage(null);
                setPasswort('');
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Eine Zeile des Spielberichts: zwei Spieler und das Ergebnis. Gespeichert
// wird beim Verlassen der Zeile, wie im Turnier-Spielplan.
function Spielzeile(props: {
  spiel: LigaSpiel;
  partie: Partie | null;
  heim: string | null;
  gast: string | null;
  heimWahl: Person[];
  gastWahl: Person[];
  heimVerdeckt: boolean;
  gastVerdeckt: boolean;
  anzeige: (id: string | null) => string;
  bearbeitbar: boolean;
  spielerSetzen: (seite: 'heim' | 'gast', id: string | null) => void;
  ergebnisSetzen: (heim: number | null, gast: number | null) => void;
  wertungSetzen: (werten: boolean) => void;
}) {
  const { spiel, partie } = props;
  const wert = (w: number | null | undefined) => (w === null || w === undefined ? '' : String(w));
  const eigenErgebnis = partie?.ergebnis_a ?? null;
  const gegenErgebnis = partie?.ergebnis_b ?? null;
  const [a, setA] = useState(wert(eigenErgebnis));
  const [b, setB] = useState(wert(gegenErgebnis));
  const zeile = useRef<HTMLTableRowElement>(null);

  // Aenderungen von aussen uebernehmen, solange hier niemand tippt
  useEffect(() => {
    if (zeile.current?.contains(document.activeElement)) return;
    setA(wert(eigenErgebnis));
    setB(wert(gegenErgebnis));
  }, [eigenErgebnis, gegenErgebnis]);

  const zahl = (t: string) => (t.trim() === '' ? null : Number(t));
  // Gespeichert wird erst beim Verlassen der Zeile, nicht beim Wechsel
  // zwischen den beiden Feldern desselben Spiels.
  const uebernehmen = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.relatedTarget && zeile.current?.contains(e.relatedTarget as Node)) return;
    if (zahl(a) === eigenErgebnis && zahl(b) === gegenErgebnis) return;
    props.ergebnisSetzen(zahl(a), zahl(b));
  };

  // Solange die Partie an einem Tisch laeuft, bleibt die Aufstellung stehen
  const festgezurrt = Boolean(partie && (partie.tisch_id || partie.status === 'beendet'));

  const auswahl = (seite: 'heim' | 'gast', gewaehlt: string | null, liste: Person[], verborgen: boolean) =>
    verborgen ? (
      // Der Name steht bewusst nicht im Seitenquelltext
      <span className="verdeckt" title="Aufstellung verborgen">{gewaehlt ? 'verdeckt' : 'noch offen'}</span>
    ) : props.bearbeitbar && !festgezurrt ? (
      <select value={gewaehlt ?? ''} onChange={(e) => props.spielerSetzen(seite, e.target.value || null)}>
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
  // Enter springt ins zweite Feld und speichert dort, wie im Turnier-Spielplan
  const beiTaste = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const felder = zeile.current?.querySelectorAll('input.zahlfeld') ?? [];
    if (e.target === felder[0] && felder[1]) (felder[1] as HTMLInputElement).focus();
    else (e.target as HTMLInputElement).blur();
  };
  return (
    <tr ref={zeile} className={fertig ? 'gespielt' : ''}>
      <td>{spiel.nr}</td>
      <td>
        {DISZIPLIN_KURZ[spiel.disziplin]}
        <small>
          {' '}
          {spiel.disziplin === '14-1' ? `${spiel.ziel} Pkt. / ${spiel.aufnahmen} Aufn.` : `${spiel.ziel} Gewinnsätze`}
        </small>
      </td>
      <td>{auswahl('heim', props.heim, props.heimWahl, props.heimVerdeckt)}</td>
      <td>{auswahl('gast', props.gast, props.gastWahl, props.gastVerdeckt)}</td>
      <td className="rechts">
        {props.bearbeitbar && partie ? (
          <>
            <input
              className="zahlfeld"
              inputMode="numeric"
              value={a}
              onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={uebernehmen}
              onKeyDown={beiTaste}
            />
            {' : '}
            <input
              className="zahlfeld"
              inputMode="numeric"
              value={b}
              onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={uebernehmen}
              onKeyDown={beiTaste}
            />
          </>
        ) : (
          <span>{fertig ? `${eigenErgebnis} : ${gegenErgebnis}` : '–'}</span>
        )}
      </td>
      <td className="rechts">
        {spiel.disziplin === '14-1' ? (
          <span className="hinweis" title="14.1 wird auf Punkte gespielt und geht nie ins Rating ein">
            14.1: kein Rating
          </span>
        ) : (
          partie &&
          props.bearbeitbar && (
          <label className="ankreuz" title="Diese Partie fürs Rating werten">
            <input type="checkbox" checked={partie.rating_werten} onChange={(e) => props.wertungSetzen(e.target.checked)} />
            Rating
          </label>
          )
        )}
      </td>
    </tr>
  );
}
