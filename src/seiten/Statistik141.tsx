import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { gleitend, SERIEN_KLASSEN, statistik141 } from '../statistik-141';
import type { PartieWerte, StatAufnahme, StatPartie, Statistik141 as Werte } from '../statistik-141';
import type { Person } from '../datenbank.types';

// 14.1-Statistik aus dem Aufnahme-Protokoll. Die Turnierleitung waehlt jede
// Person, ein Mitglied sieht nur sich selbst (das regelt auch die Datenbank).

const ZEITRAEUME = [
  { wert: 'letzte20', name: 'Letzte 20 Partien' },
  { wert: '3', name: 'Letzte 3 Monate' },
  { wert: '6', name: 'Letzte 6 Monate' },
  { wert: '12', name: 'Letzte 12 Monate' },
  { wert: '24', name: 'Letzte 24 Monate' },
  { wert: 'alle', name: 'Alle' }
];

type Verlaufsart = 'gd' | 'hs' | 'foulquote';
const VERLAUF: { wert: Verlaufsart; name: string }[] = [
  { wert: 'gd', name: 'GD' },
  { wert: 'hs', name: 'HS' },
  { wert: 'foulquote', name: 'Foulquote' }
];
const GLEITEND_UEBER = 5;

const anzeigeName = (p: Person) => p.anzeigename || `${p.vorname} ${p.nachname}`.trim();

const zahl = (w: number | null, stellen = 2) =>
  w === null ? '–' : w.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const prozent = (w: number | null) => (w === null ? '–' : `${Math.round(w * 100)} %`);
const datumKurz = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE');

function tempoText(sek: number | null) {
  if (sek === null) return '–';
  const s = Math.round(sek);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min je Aufn.`;
}

export default function Statistik141() {
  const { sitzung, verein, darf } = useSitzung();
  const alleSehen = darf('vereinsadmin', 'sportwart', 'turnierleiter');

  const [personen, setPersonen] = useState<Person[]>([]);
  const [auswahl, setAuswahl] = useState<string[]>([]); // Personen mit 14.1-Partien
  const [person, setPerson] = useState<string>('');
  const [zeitraum, setZeitraum] = useState('letzte20');
  const [mitAbgebrochenen, setMitAbgebrochenen] = useState(false);
  const [verlauf, setVerlauf] = useState<Verlaufsart>('gd');
  const [partien, setPartien] = useState<StatPartie[]>([]);
  const [aufnahmen, setAufnahmen] = useState<StatAufnahme[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Personen und Vorauswahl
  useEffect(() => {
    if (!verein || !sitzung) return;
    let vorbei = false;
    (async () => {
      const [personenAntwort, eigeneAntwort, beteiligteAntwort] = await Promise.all([
        supabase.from('personen').select('*').eq('verein_id', verein.id),
        supabase
          .from('benutzer_personen')
          .select('person_id')
          .eq('benutzer_id', sitzung.user.id)
          .eq('verein_id', verein.id),
        supabase.from('partien').select('spieler_a, spieler_b').eq('verein_id', verein.id).eq('disziplin', '14-1')
      ]);
      if (vorbei) return;
      const alle = personenAntwort.data ?? [];
      const ich = eigeneAntwort.data?.[0]?.person_id ?? '';
      const beteiligt = new Set((beteiligteAntwort.data ?? []).flatMap((p) => [p.spieler_a, p.spieler_b]));
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

  // Partien und Aufnahmen der gewaehlten Person
  useEffect(() => {
    if (!verein || !person) return;
    let vorbei = false;
    setLaedt(true);
    setFehler(null);
    (async () => {
      let abfrage = supabase
        .from('partien')
        .select('id, datum, status, spieler_a, spieler_b, ergebnis_a, ergebnis_b, begonnen, beendet')
        .eq('verein_id', verein.id)
        .eq('disziplin', '14-1')
        .or(`spieler_a.eq.${person},spieler_b.eq.${person}`)
        .in('status', mitAbgebrochenen ? ['beendet', 'abgebrochen'] : ['beendet'])
        .order('datum', { ascending: false })
        .order('beendet', { ascending: false, nullsFirst: false });
      if (zeitraum === 'letzte20') abfrage = abfrage.limit(20);
      else if (zeitraum !== 'alle') {
        const ab = new Date();
        ab.setMonth(ab.getMonth() - Number(zeitraum));
        abfrage = abfrage.gte('datum', ab.toISOString().slice(0, 10));
      }
      const { data: gefunden, error } = await abfrage;
      if (vorbei) return;
      if (error) {
        setFehler(error.message);
        setLaedt(false);
        return;
      }
      const liste = (gefunden ?? []) as StatPartie[];

      // Aufnahmen in Paketen holen: lange ID-Listen sprengen sonst die Adresse,
      // und die Datenbank liefert hoechstens 1000 Zeilen je Abruf.
      const zeilen: StatAufnahme[] = [];
      const ids = liste.map((p) => p.id);
      for (let i = 0; i < ids.length; i += 50) {
        const paket = ids.slice(i, i + 50);
        for (let von = 0; ; von += 1000) {
          const { data, error: fehlerAufnahmen } = await supabase
            .from('aufnahmen_141')
            .select('partie_id, lfd_nr, spieler, baelle, punkte, art, markierung, rack_segmente, zeitpunkt')
            .in('partie_id', paket)
            .order('partie_id')
            .order('lfd_nr')
            .range(von, von + 999);
          if (fehlerAufnahmen) {
            if (!vorbei) setFehler(fehlerAufnahmen.message);
            break;
          }
          zeilen.push(...((data ?? []) as StatAufnahme[]));
          if (!data || data.length < 1000) break;
        }
      }
      if (vorbei) return;
      setPartien(liste);
      setAufnahmen(zeilen);
      setLaedt(false);
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, person, zeitraum, mitAbgebrochenen]);

  const werte = useMemo<Werte | null>(() => {
    if (!person) return null;
    const namen = (id: string) => {
      const p = personen.find((x) => x.id === id);
      return p ? anzeigeName(p) : '?';
    };
    return statistik141(person, partien, aufnahmen, namen);
  }, [person, partien, aufnahmen, personen]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  const personNachId = (id: string) => personen.find((p) => p.id === id);
  const gewaehlt = personNachId(person);

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="statkopf">
          {alleSehen ? (
            <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Spieler">
              {auswahl.length === 0 && <option value="">keine 14.1-Partien</option>}
              {auswahl.map((id) => {
                const p = personNachId(id);
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
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value)} aria-label="Zeitraum">
            {ZEITRAEUME.map((z) => (
              <option key={z.wert} value={z.wert}>
                {z.name}
              </option>
            ))}
          </select>
          <label className="ankreuz">
            <input
              type="checkbox"
              checked={mitAbgebrochenen}
              onChange={(e) => setMitAbgebrochenen(e.target.checked)}
            />
            abgebrochene einbeziehen
          </label>
          {laedt && <span className="hinweis">Lädt.</span>}
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {!person && (
          <p className="hinweis">
            Deinem Konto ist keine Person zugeordnet. Der Vereins-Administrator kann das unter „Benutzer und Rollen“
            nachholen.
          </p>
        )}
      </section>

      {werte && person && partien.length === 0 && !laedt && (
        <section className="block">
          <p className="hinweis">Im gewählten Zeitraum gibt es keine 14.1-Partien.</p>
        </section>
      )}

      {werte && partien.length > 0 && (
        <>
          <section className="block">
            <div className="kennzahlen">
              <div>
                <span>GD</span>
                <strong>{zahl(werte.gd)}</strong>
                <small>
                  {werte.punkte} Punkte / {werte.aufnahmen} Aufn.
                </small>
              </div>
              <div>
                <span>Höchstserie</span>
                <strong>{werte.hs.wert}</strong>
                <small>
                  {werte.hs.partie ? `am ${datumKurz(werte.hs.partie.datum)} gegen ${werte.hs.gegner}` : '–'}
                </small>
              </div>
              <div>
                <span>Ø Serie</span>
                <strong>{zahl(werte.durchschnittSerie, 1)}</strong>
                <small>nur Aufnahmen mit Kugeln</small>
              </div>
              <div>
                <span>Bilanz</span>
                <strong>
                  {werte.bilanz.siege} – {werte.bilanz.niederlagen} – {werte.bilanz.unentschieden}
                </strong>
                <small>S – N – U, {werte.partien} Partien</small>
              </div>
            </div>
          </section>

          <div className="statzweier">
            <section className="block">
              <h2>Serienverteilung</h2>
              <Verteilung werte={werte.verteilung} />
            </section>
            <section className="block">
              <h2>Quoten</h2>
              <table className="tabelle">
                <tbody>
                  <tr>
                    <td>Nullaufnahmen</td>
                    <td className="rechts">{prozent(werte.nullQuote)}</td>
                  </tr>
                  <tr>
                    <td>Sicherheiten</td>
                    <td className="rechts">{prozent(werte.sicherheitQuote)}</td>
                  </tr>
                  <tr>
                    <td>Verschossen</td>
                    <td className="rechts">{prozent(werte.verschossenQuote)}</td>
                  </tr>
                  <tr>
                    <td>Fouls je 10 Aufnahmen</td>
                    <td className="rechts">{zahl(werte.foulsJe10, 1)}</td>
                  </tr>
                  <tr>
                    <td>2. Fouls / Drei-Foul / Eröffnung</td>
                    <td className="rechts">
                      {werte.zweiteFouls} / {werte.dreiFouls} / {werte.eroeffnungsfouls}
                    </td>
                  </tr>
                  <tr>
                    <td>Serien über ein Rack hinaus</td>
                    <td className="rechts">{werte.rackUebergaenge}</td>
                  </tr>
                  <tr>
                    <td>Tempo</td>
                    <td className="rechts">{tempoText(werte.sekundenJeAufnahme)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <section className="block">
            <div className="bearbeitenkopf">
              <h2>Entwicklung</h2>
              <div className="filterzeile">
                {VERLAUF.map((v) => (
                  <button
                    key={v.wert}
                    type="button"
                    className={verlauf === v.wert ? 'chip aktiv' : 'chip'}
                    title={`Entwicklung von ${v.name} anzeigen`}
                    onClick={() => setVerlauf(v.wert)}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            <Verlauf jePartie={werte.jePartie} art={verlauf} />
            <p className="hinweis">
              Punkte: je Partie. Linie: gleitender Durchschnitt über {GLEITEND_UEBER} Partien.
            </p>
          </section>

          <section className="block">
            <h2>Partien</h2>
            <Partienliste jePartie={werte.jePartie} />
          </section>
        </>
      )}
    </div>
  );
}

function Verteilung({ werte }: { werte: number[] }) {
  const hoechster = Math.max(1, ...werte);
  return (
    <div className="verteilung">
      {SERIEN_KLASSEN.map((klasse, i) => (
        <div key={klasse} className="verteilungszeile">
          <span>{klasse}</span>
          <div className="balkenbahn">
            <div className="balken" style={{ width: `${(werte[i] / hoechster) * 100}%` }} />
          </div>
          <span className="rechts">{werte[i]}</span>
        </div>
      ))}
    </div>
  );
}

function Verlauf({ jePartie, art }: { jePartie: PartieWerte[]; art: Verlaufsart }) {
  const breite = 640;
  const hoehe = 170;
  const links = 34;
  const unten = 18;
  const oben = 8;
  const punkte = jePartie.map((p) => p[art]);
  const linie = gleitend(punkte, GLEITEND_UEBER);
  const vorhanden = punkte.filter((w): w is number => w !== null);
  if (vorhanden.length === 0) return <p className="hinweis">Keine Aufnahmen im Zeitraum.</p>;

  const min = Math.min(0, ...vorhanden);
  const max = Math.max(1, ...vorhanden);
  const spanne = max - min || 1;
  const x = (i: number) =>
    punkte.length === 1 ? (links + breite) / 2 : links + 8 + (i * (breite - links - 16)) / (punkte.length - 1);
  const y = (w: number) => oben + (hoehe - oben - unten) * (1 - (w - min) / spanne);
  const pfad = linie
    .map((w, i) => (w === null ? null : `${x(i).toFixed(1)} ${y(w).toFixed(1)}`))
    .filter(Boolean)
    .map((p, i) => (i === 0 ? `M${p}` : `L${p}`))
    .join(' ');
  const achse = [min, (min + max) / 2, max];
  const stellen = art === 'hs' ? 0 : 1;

  return (
    <svg viewBox={`0 0 ${breite} ${hoehe}`} className="verlauf" role="img" aria-label="Entwicklung je Partie">
      {achse.map((w) => (
        <g key={w}>
          <line x1={links} x2={breite} y1={y(w)} y2={y(w)} className="gitter" />
          <text x={links - 6} y={y(w) + 4} textAnchor="end" className="achse">
            {w.toLocaleString('de-DE', { maximumFractionDigits: stellen })}
          </text>
        </g>
      ))}
      {punkte.map((w, i) =>
        w === null ? null : (
          <circle key={jePartie[i].partie.id} cx={x(i)} cy={y(w)} r={3.5} className="punkt">
            <title>
              {datumKurz(jePartie[i].partie.datum)} gegen {jePartie[i].gegner}:{' '}
              {w.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
            </title>
          </circle>
        )
      )}
      {pfad && <path d={pfad} className="linie" />}
    </svg>
  );
}

const AUSGANG: Record<PartieWerte['ausgang'], string> = {
  sieg: 'S',
  niederlage: 'N',
  unentschieden: 'U',
  abgebrochen: 'abgebrochen'
};

function Partienliste({ jePartie }: { jePartie: PartieWerte[] }) {
  const neueste = [...jePartie].reverse();
  const basis = import.meta.env.BASE_URL;
  return (
    <table className="tabelle">
      <thead>
        <tr>
          <th>Datum</th>
          <th>Gegner</th>
          <th className="rechts">Ergebnis</th>
          <th className="rechts">Aufn.</th>
          <th className="rechts">GD</th>
          <th className="rechts">HS</th>
          <th className="rechts">Fouls</th>
          <th className="rechts"></th>
        </tr>
      </thead>
      <tbody>
        {neueste.map((p) => (
          <tr key={p.partie.id}>
            <td>{datumKurz(p.partie.datum)}</td>
            <td>{p.gegner}</td>
            <td className="rechts">
              {p.eigene} : {p.fremde}{' '}
              <span className={`marke ausgang-${p.ausgang}`}>{AUSGANG[p.ausgang]}</span>
            </td>
            <td className="rechts">{p.aufnahmen}</td>
            <td className="rechts">{zahl(p.gd)}</td>
            <td className="rechts">{p.hs}</td>
            <td className="rechts">{p.fouls}</td>
            <td className="rechts">
              <a href={`${basis}scoreboards/14.1_Log.html?partie=${p.partie.id}`} target="_blank" rel="noreferrer">
                Protokoll
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
