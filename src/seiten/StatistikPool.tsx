import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { punkteFuer } from '../serien';
import { ratingVerlauf, statistikPool } from '../statistik-pool';
import { DISZIPLIN_TEXT } from './Turniere';
import type { PoolBilanz, PoolPartie, PoolZeile, VerlaufPunkt } from '../statistik-pool';
import type { RatingPartie } from '../rating';
import type { Disziplin, Person, Serie } from '../datenbank.types';

// Pool-Statistik einer Person: Bilanz aus den Partieergebnissen, Rating-
// Verlauf, Form, Gegner und Turniere. Mitglieder sehen nur sich selbst,
// Turnierleitung, Sportwart und Vereins-Admin alle. Gerechnet wird in
// src/statistik-pool.ts.

const ZEITRAEUME = [
  { wert: 'letzte20', name: 'letzte 20 Partien' },
  { wert: '3', name: '3 Monate' },
  { wert: '6', name: '6 Monate' },
  { wert: '12', name: '12 Monate' },
  { wert: '24', name: '24 Monate' },
  { wert: 'alle', name: 'alle' }
];

const POOL_DISZIPLINEN: Disziplin[] = ['8-ball', '9-ball', '10-ball', 'multi-ball'];

const anzeigeName = (p: Person) => p.anzeigename || `${p.vorname} ${p.nachname}`.trim();
const prozent = (w: number | null) => (w === null ? '–' : `${Math.round(w * 100)} %`);
const zahl = (w: number | null, stellen = 1) =>
  w === null ? '–' : w.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const mitVorzeichen = (w: number | null) => (w === null ? '–' : `${w > 0 ? '+' : ''}${zahl(w)}`);
const datumKurz = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE');
const siege = (n: number) => `${n} ${n === 1 ? 'Sieg' : 'Siege'}`;

type Teilnahme = { turnier_id: string; endplatz: number | null };
type TurnierZeile = { id: string; name: string; datum: string; serie_id: string | null; teilnehmerzahl: number | null; status: string };

export default function StatistikPool() {
  const { sitzung, verein, darf } = useSitzung();
  const alleSehen = darf('vereinsadmin', 'sportwart', 'turnierleiter');

  const [personen, setPersonen] = useState<Person[]>([]);
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [person, setPerson] = useState('');
  const [zeitraum, setZeitraum] = useState('letzte20');
  const [disziplin, setDisziplin] = useState<'alle' | Disziplin>('alle');
  const [mitAbgebrochenen, setMitAbgebrochenen] = useState(false);
  const [partien, setPartien] = useState<PoolPartie[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map()); // "person|disziplin"
  const [ratingStichtag, setRatingStichtag] = useState<string | null>(null);
  const [verlauf, setVerlauf] = useState<VerlaufPunkt[]>([]);
  const [turniere, setTurniere] = useState<TurnierZeile[]>([]);
  const [teilnahmen, setTeilnahmen] = useState<Teilnahme[]>([]);
  const [serien, setSerien] = useState<Serie[]>([]);
  const [teilnehmerzahlen, setTeilnehmerzahlen] = useState<Map<string, number>>(new Map());
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Personen und Vorauswahl: wer Pool-Partien hat, dazu man selbst
  useEffect(() => {
    if (!verein || !sitzung) return;
    let vorbei = false;
    void (async () => {
      const [personenAntwort, eigeneAntwort, beteiligtAntwort] = await Promise.all([
        supabase.from('personen').select('*').eq('verein_id', verein.id),
        supabase.from('benutzer_personen').select('person_id').eq('benutzer_id', sitzung.user.id).eq('verein_id', verein.id),
        supabase.from('partien').select('spieler_a, spieler_b').eq('verein_id', verein.id).neq('disziplin', '14-1')
      ]);
      if (vorbei) return;
      const alle = personenAntwort.data ?? [];
      const ich = eigeneAntwort.data?.[0]?.person_id ?? '';
      const beteiligt = new Set((beteiligtAntwort.data ?? []).flatMap((p) => [p.spieler_a, p.spieler_b]));
      const liste = alle
        .filter((p) => beteiligt.has(p.id) || p.id === ich)
        .sort((a, b) => personName(a).localeCompare(personName(b), 'de'))
        .map((p) => p.id);
      setPersonen(alle);
      setAuswahl(liste);
      setPerson(ich || (alleSehen ? liste[0] ?? '' : ''));
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, sitzung, alleSehen]);

  // Partien der gewaehlten Person, dazu Ratings, Turniere und Serien
  useEffect(() => {
    if (!verein || !person) return;
    let vorbei = false;
    setLaedt(true);
    setFehler(null);
    void (async () => {
      let abfrage = supabase
        .from('partien')
        .select('id, datum, disziplin, status, turnier_id, spieler_a, spieler_b, ergebnis_a, ergebnis_b, vorgabe_a, vorgabe_b, beendet')
        .eq('verein_id', verein.id)
        .neq('disziplin', '14-1')
        .or(`spieler_a.eq.${person},spieler_b.eq.${person}`)
        .in('status', mitAbgebrochenen ? ['beendet', 'abgebrochen'] : ['beendet'])
        .order('datum', { ascending: false })
        .order('beendet', { ascending: false, nullsFirst: false });
      if (disziplin !== 'alle') abfrage = abfrage.eq('disziplin', disziplin);
      if (zeitraum === 'letzte20') abfrage = abfrage.limit(20);
      else if (zeitraum !== 'alle') {
        const ab = new Date();
        ab.setMonth(ab.getMonth() - Number(zeitraum));
        abfrage = abfrage.gte('datum', ab.toISOString().slice(0, 10));
      }

      const [partienAntwort, standAntwort, turnierAntwort, teilnahmeAntwort, serienAntwort] = await Promise.all([
        abfrage,
        supabase
          .from('rating_stand')
          .select('stichtag, disziplin, person_id, wert')
          .eq('verein_id', verein.id)
          .order('stichtag', { ascending: false })
          .limit(3000),
        supabase.from('turniere').select('id, name, datum, serie_id, teilnehmerzahl, status').eq('verein_id', verein.id),
        supabase.from('turnier_teilnehmer').select('turnier_id, endplatz').eq('person_id', person),
        supabase.from('serien').select('*').eq('verein_id', verein.id)
      ]);
      if (vorbei) return;
      if (partienAntwort.error) {
        setFehler(partienAntwort.error.message);
        setLaedt(false);
        return;
      }

      // Nur der neueste Stand je Disziplin
      const neueste = new Map<string, string>();
      (standAntwort.data ?? []).forEach((z) => {
        if (!neueste.has(z.disziplin)) neueste.set(z.disziplin, z.stichtag);
      });
      const karte = new Map<string, number>();
      (standAntwort.data ?? []).forEach((z) => {
        if (z.stichtag === neueste.get(z.disziplin)) karte.set(`${z.person_id}|${z.disziplin}`, z.wert);
      });

      setPartien((partienAntwort.data ?? []) as PoolPartie[]);
      setRatings(karte);
      setRatingStichtag(standAntwort.data?.[0]?.stichtag ?? null);
      setTurniere((turnierAntwort.data ?? []) as TurnierZeile[]);
      setTeilnahmen((teilnahmeAntwort.data ?? []) as Teilnahme[]);
      setSerien(serienAntwort.data ?? []);
      setLaedt(false);

      // Uebernommene Turniere haben keine gespeicherte Teilnehmerzahl; fuer die
      // Serienpunkte wird sie dann aus den Teilnehmern gezaehlt.
      const eigeneTurniere = (teilnahmeAntwort.data ?? []).map((t) => t.turnier_id);
      if (eigeneTurniere.length > 0) {
        const { data: alleTeilnahmen } = await supabase
          .from('turnier_teilnehmer')
          .select('turnier_id')
          .in('turnier_id', eigeneTurniere);
        if (vorbei) return;
        const zahlen = new Map<string, number>();
        (alleTeilnahmen ?? []).forEach((z) => zahlen.set(z.turnier_id, (zahlen.get(z.turnier_id) ?? 0) + 1));
        setTeilnehmerzahlen(zahlen);
      }
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, person, zeitraum, disziplin, mitAbgebrochenen]);

  // Rating-Verlauf: aus allen gewerteten Partien des Vereins nachgerechnet,
  // ein Punkt je Turniertag, an dem die Person gespielt hat.
  useEffect(() => {
    if (!verein || !person) return;
    let vorbei = false;
    void (async () => {
      const [partienAntwort, internAntwort, einstellungAntwort] = await Promise.all([
        supabase
          .from('rating_partien')
          .select('datum, disziplin, spieler_a, spieler_b, racks_a, racks_b')
          .eq('verein_id', verein.id),
        supabase.from('personen_intern').select('person_id, rating_startwert').eq('verein_id', verein.id).not('rating_startwert', 'is', null),
        supabase.from('rating_einstellungen').select('*').eq('verein_id', verein.id).maybeSingle()
      ]);
      if (vorbei) return;
      const alle: RatingPartie[] = (partienAntwort.data ?? [])
        .map((p) => ({ datum: p.datum, disziplin: p.disziplin, a: p.spieler_a, b: p.spieler_b, wa: p.racks_a, wb: p.racks_b }))
        .filter((p) => p.wa + p.wb > 0 && p.a !== p.b);
      const startwerte: Record<string, number> = {};
      (internAntwort.data ?? []).forEach((z) => {
        if (z.rating_startwert !== null) startwerte[z.person_id] = z.rating_startwert;
      });
      const e = einstellungAntwort.data;
      // Stichtage: die Tage, an denen die Person gewertete Partien hatte
      const tage = [...new Set(alle.filter((p) => p.a === person || p.b === person).map((p) => p.datum))].sort();
      const punkte = ratingVerlauf(
        person,
        alle,
        tage.slice(-30), // hoechstens 30 Punkte, sonst wird die Rechnung lang
        disziplin === 'alle' ? 'gesamt' : disziplin,
        startwerte,
        e
          ? {
              zeitraum: e.zeitraum_monate,
              mindestRacks: e.mindest_racks,
              rueckgriff: e.rueckgriff_monate,
              gewicht: e.gewicht,
              vereinsschnitt: e.vereinsschnitt
            }
          : undefined
      );
      if (!vorbei) setVerlauf(punkte);
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, person, disziplin]);

  const namenVon = useMemo(() => {
    const map = new Map<string, string>();
    personen.forEach((p) => map.set(p.id, anzeigeName(p)));
    return map;
  }, [personen]);

  const werte = useMemo(() => {
    if (!person) return null;
    return statistikPool(
      person,
      partien,
      (id) => namenVon.get(id) ?? '?',
      (id, d) => ratings.get(`${id}|${d}`) ?? ratings.get(`${id}|gesamt`) ?? null
    );
  }, [person, partien, namenVon, ratings]);

  // Turniere der Person: Teilnahmen, Titel und Serienpunkte (eigene Ergebnisse
  // genuegen, Streicher und Bonus gelten je Spieler)
  const turnierwerte = useMemo(() => {
    const beendet = new Map(turniere.filter((t) => t.status === 'beendet').map((t) => [t.id, t]));
    const eigene = teilnahmen
      .filter((t) => beendet.has(t.turnier_id) && t.endplatz !== null)
      .map((t) => ({ turnier: beendet.get(t.turnier_id) as TurnierZeile, platz: t.endplatz as number }));
    const titel = eigene.filter((e) => e.platz === 1).length;
    const schnitt = eigene.length ? eigene.reduce((s, e) => s + e.platz, 0) / eigene.length : null;
    const jeSerie = serien
      .map((s) => {
        const dazu = eigene.filter((e) => e.turnier.serie_id === s.id);
        if (dazu.length === 0) return null;
        const punkte = dazu
          .map((e) => punkteFuer(e.platz, e.turnier.teilnehmerzahl ?? teilnehmerzahlen.get(e.turnier.id) ?? 0, s.bonus))
          .sort((a, b) => b - a);
        const gewertet = s.streicher > 0 ? punkte.slice(0, s.streicher) : punkte;
        return { serie: s, turniere: dazu.length, punkte: gewertet.reduce((a, b) => a + b, 0) };
      })
      .filter((x): x is { serie: Serie; turniere: number; punkte: number } => x !== null);
    return { teilnahmen: eigene.length, titel, schnitt, jeSerie, liste: eigene.sort((a, b) => (a.turnier.datum < b.turnier.datum ? 1 : -1)) };
  }, [turniere, teilnahmen, serien, teilnehmerzahlen]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  const gewaehlt = personen.find((p) => p.id === person);
  const ratingJetzt = ratings.get(`${person}|${disziplin === 'alle' ? 'gesamt' : disziplin}`) ?? null;

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="statkopf">
          {alleSehen ? (
            <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
              {auswahl.length === 0 && <option value="">keine Pool-Partien</option>}
              {auswahl.map((id) => {
                const p = personen.find((x) => x.id === id);
                return (
                  <option key={id} value={id}>
                    {p ? personName(p) : id}
                    {p?.status === 'gast' ? ' (Gast)' : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <strong>{gewaehlt ? anzeigeName(gewaehlt) : ''}</strong>
          )}
          <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as 'alle' | Disziplin)} aria-label="Disziplin">
            <option value="alle">alle Disziplinen</option>
            {POOL_DISZIPLINEN.map((d) => (
              <option key={d} value={d}>
                {DISZIPLIN_TEXT[d]}
              </option>
            ))}
          </select>
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value)} aria-label="Zeitraum">
            {ZEITRAEUME.map((z) => (
              <option key={z.wert} value={z.wert}>
                {z.name}
              </option>
            ))}
          </select>
          <label className="ankreuz">
            <input type="checkbox" checked={mitAbgebrochenen} onChange={(e) => setMitAbgebrochenen(e.target.checked)} />
            abgebrochene einbeziehen
          </label>
          {laedt && <span className="hinweis">Lädt.</span>}
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {!person && <p className="hinweis">Für dich sind noch keine Pool-Partien gespeichert.</p>}
      </section>

      {werte && werte.gesamt.partien === 0 && (
        <section className="block">
          <p className="hinweis">Im gewählten Zeitraum gibt es keine Pool-Partien.</p>
        </section>
      )}

      {werte && werte.gesamt.partien > 0 && (
        <>
          <section className="block">
            <div className="kennzahlen">
              <div>
                <span>Rating {disziplin === 'alle' ? 'gesamt' : DISZIPLIN_TEXT[disziplin]}</span>
                <strong>{ratingJetzt ?? '–'}</strong>
                <small>{ratingStichtag ? `Stand vom ${datumKurz(ratingStichtag)}` : 'noch nicht berechnet'}</small>
              </div>
              <div>
                <span>Partien</span>
                <strong>
                  {werte.gesamt.siege} : {werte.gesamt.niederlagen}
                </strong>
                <small>{prozent(werte.gesamt.siegquote)} gewonnen</small>
              </div>
              <div>
                <span>Racks</span>
                <strong>
                  {werte.gesamt.eigene} : {werte.gesamt.fremde}
                </strong>
                <small>{prozent(werte.gesamt.rackquote)}</small>
              </div>
              <div>
                <span>Gegen Erwartung</span>
                <strong>{mitVorzeichen(werte.gesamt.gegenErwartung)}</strong>
                <small>Racks gegenüber dem Rating</small>
              </div>
            </div>
            <p className="hinweis">
              Gezählt werden Turnierpartien und Einzelspiele, auch gegen Gäste. Vorgabesätze zählen nicht als eigene
              Leistung. Erwartet werden die Racks, die das Rating beider Spieler vorhersagt.
            </p>
          </section>

          <div className="turnierzweier">
            <section className="block">
              <h2>Rating-Verlauf</h2>
              <Verlaufsbild punkte={verlauf} />
              <p className="hinweis">
                Ein Punkt je Spieltag, nachgerechnet wie das Vereins-Rating. Gäste und Einzelspiele zählen dabei nicht.
              </p>
            </section>

            <section className="block">
              <h2>Form</h2>
              <p className="formzeile">
                {werte.form.map((z) => (
                  <span key={z.partie.id} className={`formmarke ${z.ausgang}`} title={`${datumKurz(z.partie.datum)} gegen ${namenVon.get(z.gegner) ?? '?'}: ${z.eigene}:${z.fremde}`}>
                    {z.ausgang === 'sieg' ? 'S' : z.ausgang === 'niederlage' ? 'N' : z.ausgang === 'abgebrochen' ? 'A' : 'U'}
                  </span>
                ))}
              </p>
              <p className="hinweis">
                Neueste zuerst · {siege(werte.form.filter((z) => z.ausgang === 'sieg').length)} in den letzten{' '}
                {werte.form.length} Partien
              </p>
              <h2>Turniere</h2>
              <p>
                {turnierwerte.teilnahmen} {turnierwerte.teilnahmen === 1 ? 'Teilnahme' : 'Teilnahmen'} ·{' '}
                {siege(turnierwerte.titel)} · Ø Platz {zahl(turnierwerte.schnitt)}
              </p>
              {turnierwerte.jeSerie.map((s) => (
                <p key={s.serie.id} className="hinweis">
                  {s.serie.name}
                  {s.serie.saison ? ` ${s.serie.saison}` : ''}: {s.punkte} Punkte aus {s.turniere} Turnieren
                </p>
              ))}
              <p className="hinweis">Turniere und Serienpunkte zählen unabhängig vom gewählten Zeitraum.</p>
            </section>
          </div>

          <section className="block">
            <h2>Bilanz je Disziplin</h2>
            <Bilanztabelle
              zeilen={werte.jeDisziplin.map((d) => ({ name: DISZIPLIN_TEXT[d.disziplin as Disziplin] ?? d.disziplin, bilanz: d }))}
              erste="Disziplin"
            />
          </section>

          <section className="block">
            <h2>Bilanz gegen Gegner</h2>
            <Bilanztabelle zeilen={werte.gegner.map((g) => ({ name: g.name, bilanz: g }))} erste="Gegner" />
          </section>

          <section className="block">
            <h2>Partien</h2>
            <Partienliste zeilen={werte.zeilen} name={(id) => namenVon.get(id) ?? '?'} turniere={turniere} />
          </section>
        </>
      )}
    </div>
  );
}

function Bilanztabelle({ zeilen, erste }: { zeilen: { name: string; bilanz: PoolBilanz }[]; erste: string }) {
  return (
    <table className="tabelle">
      <thead>
        <tr>
          <th>{erste}</th>
          <th className="rechts">Partien</th>
          <th className="rechts">S : N</th>
          <th className="rechts">Siegquote</th>
          <th className="rechts">Racks</th>
          <th className="rechts">Gegen Erwartung</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.name}>
            <td>{z.name}</td>
            <td className="rechts">{z.bilanz.partien}</td>
            <td className="rechts">
              {z.bilanz.siege} : {z.bilanz.niederlagen}
            </td>
            <td className="rechts">{prozent(z.bilanz.siegquote)}</td>
            <td className="rechts">
              {z.bilanz.eigene} : {z.bilanz.fremde}
            </td>
            <td className="rechts">{mitVorzeichen(z.bilanz.gegenErwartung)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Partienliste({
  zeilen,
  name,
  turniere
}: {
  zeilen: PoolZeile[];
  name: (id: string) => string;
  turniere: TurnierZeile[];
}) {
  return (
    <table className="tabelle">
      <thead>
        <tr>
          <th>Datum</th>
          <th>Gegner</th>
          <th>Disziplin</th>
          <th className="rechts">Ergebnis</th>
          <th>Anlass</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.partie.id} className={z.ausgang === 'sieg' ? 'gespielt' : ''}>
            <td>{datumKurz(z.partie.datum)}</td>
            <td>{name(z.gegner)}</td>
            <td>{DISZIPLIN_TEXT[z.partie.disziplin as Disziplin] ?? z.partie.disziplin}</td>
            <td className="rechts">
              {z.eigene} : {z.fremde}
              {z.ausgang === 'abgebrochen' && <span className="marke">abgebrochen</span>}
            </td>
            <td className="hinweis">
              {z.partie.turnier_id ? turniere.find((t) => t.id === z.partie.turnier_id)?.name ?? 'Turnier' : 'Einzelspiel'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Verlaufsbild({ punkte }: { punkte: VerlaufPunkt[] }) {
  const werte = punkte.filter((p) => p.wert !== null);
  if (werte.length === 0) return <p className="hinweis">Noch keine gewerteten Partien.</p>;
  if (werte.length === 1) {
    const einziger = werte[0];
    return (
      <p>
        Am {datumKurz(einziger.datum)}: <strong>{einziger.wert}</strong> ({einziger.racks} Racks). Für eine Kurve braucht
        es Partien an mehreren Spieltagen.
      </p>
    );
  }
  const breite = 640;
  const hoehe = 170;
  const links = 34;
  const unten = 18;
  const oben = 8;
  const zahlen = werte.map((p) => p.wert as number);
  const min = Math.min(...zahlen) - 10;
  const max = Math.max(...zahlen) + 10;
  const spanne = max - min || 1;
  const x = (i: number) => links + 8 + (i * (breite - links - 16)) / (werte.length - 1);
  const y = (w: number) => oben + (hoehe - oben - unten) * (1 - (w - min) / spanne);
  const pfad = zahlen.map((w, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(w).toFixed(1)}`).join(' ');
  const achse = [min, (min + max) / 2, max];
  return (
    <svg viewBox={`0 0 ${breite} ${hoehe}`} className="verlauf" role="img" aria-label="Rating-Verlauf">
      {achse.map((w) => (
        <g key={w}>
          <line x1={links} x2={breite} y1={y(w)} y2={y(w)} className="gitter" />
          <text x={links - 6} y={y(w) + 4} textAnchor="end" className="achse">
            {Math.round(w)}
          </text>
        </g>
      ))}
      <path d={pfad} className="linie" />
      {zahlen.map((w, i) => (
        <circle key={werte[i].datum} cx={x(i)} cy={y(w)} r={3.5} className="punkt">
          <title>
            {datumKurz(werte[i].datum)}: {w} ({werte[i].racks} Racks)
          </title>
        </circle>
      ))}
    </svg>
  );
}
