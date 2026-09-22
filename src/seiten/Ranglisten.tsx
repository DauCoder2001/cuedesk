import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { bestenliste141, serienUebersicht, siegquoten, titel } from '../ranglisten';
import { DISZIPLIN_TEXT } from './Turniere';
import type { SerienTurnier } from '../serien';
import type { StatAufnahme, StatPartie } from '../statistik-141';
import type { PoolPartie } from '../statistik-pool';
import type { Disziplin, Person, Serie } from '../datenbank.types';

// Ranglisten des Vereins, sichtbar für alle Mitglieder: Siegquote, Bestenliste
// 14.1, Titel aus Turniersiegen und die Platzierungen in den Vereinsserien.
// Gerechnet wird in src/ranglisten.ts. Gäste stehen in keiner Rangliste.

const ZEITRAEUME = [
  { wert: '12', name: '12 Monate' },
  { wert: '6', name: '6 Monate' },
  { wert: '24', name: '24 Monate' },
  { wert: 'alle', name: 'alle' }
];
const MINDEST = ['1', '3', '5', '10'];
const POOL_DISZIPLINEN: Disziplin[] = ['8-ball', '9-ball', '10-ball', 'multi-ball'];

const prozent = (w: number) => `${Math.round(w * 100)} %`;
const zahl = (w: number | null, stellen = 2) =>
  w === null ? '–' : w.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

type Teilnahme = { turnier_id: string; person_id: string; endplatz: number | null };
type TurnierZeile = { id: string; name: string; datum: string; serie_id: string | null; teilnehmerzahl: number | null; status: string };

export default function Ranglisten() {
  const { verein } = useSitzung();

  const [personen, setPersonen] = useState<Person[]>([]);
  const [poolPartien, setPoolPartien] = useState<PoolPartie[]>([]);
  const [partien141, setPartien141] = useState<StatPartie[]>([]);
  const [aufnahmen, setAufnahmen] = useState<StatAufnahme[]>([]);
  const [turniere, setTurniere] = useState<TurnierZeile[]>([]);
  const [teilnahmen, setTeilnahmen] = useState<Teilnahme[]>([]);
  const [serien, setSerien] = useState<Serie[]>([]);
  const [zeitraum, setZeitraum] = useState('12');
  const [disziplin, setDisziplin] = useState<'alle' | Disziplin>('alle');
  const [mindestens, setMindestens] = useState('5');
  const [alleTitel, setAlleTitel] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;
    setLaedt(true);
    setFehler(null);
    void (async () => {
      const ab =
        zeitraum === 'alle'
          ? '1900-01-01'
          : (() => {
              const d = new Date();
              d.setMonth(d.getMonth() - Number(zeitraum));
              return d.toISOString().slice(0, 10);
            })();

      const [personenAntwort, poolAntwort, a141Antwort, turnierAntwort, teilnahmeAntwort, serienAntwort] = await Promise.all([
        supabase.from('personen').select('*').eq('verein_id', verein.id),
        supabase
          .from('partien')
          .select('id, datum, disziplin, status, turnier_id, spieler_a, spieler_b, ergebnis_a, ergebnis_b, vorgabe_a, vorgabe_b, beendet')
          .eq('verein_id', verein.id)
          .neq('disziplin', '14-1')
          .eq('status', 'beendet')
          .gte('datum', ab),
        supabase
          .from('partien')
          .select('id, datum, status, spieler_a, spieler_b, ergebnis_a, ergebnis_b, begonnen, beendet')
          .eq('verein_id', verein.id)
          .eq('disziplin', '14-1')
          .eq('status', 'beendet')
          .gte('datum', ab),
        supabase.from('turniere').select('id, name, datum, serie_id, teilnehmerzahl, status').eq('verein_id', verein.id),
        supabase.from('turnier_teilnehmer').select('turnier_id, person_id, endplatz').eq('verein_id', verein.id),
        supabase.from('serien').select('*').eq('verein_id', verein.id)
      ]);
      if (vorbei) return;
      if (poolAntwort.error) {
        setFehler(poolAntwort.error.message);
        setLaedt(false);
        return;
      }

      // Aufnahmen in Paketen, wie in der 14.1-Statistik
      const zeilen: StatAufnahme[] = [];
      const ids = (a141Antwort.data ?? []).map((p) => p.id);
      for (let i = 0; i < ids.length; i += 50) {
        const paket = ids.slice(i, i + 50);
        for (let von = 0; ; von += 1000) {
          const { data } = await supabase
            .from('aufnahmen_141')
            .select('partie_id, lfd_nr, spieler, baelle, punkte, art, markierung, rack_segmente, zeitpunkt')
            .in('partie_id', paket)
            .order('partie_id')
            .order('lfd_nr')
            .range(von, von + 999);
          zeilen.push(...((data ?? []) as StatAufnahme[]));
          if (!data || data.length < 1000) break;
        }
      }
      if (vorbei) return;

      setPersonen(personenAntwort.data ?? []);
      setPoolPartien((poolAntwort.data ?? []) as PoolPartie[]);
      setPartien141((a141Antwort.data ?? []) as StatPartie[]);
      setAufnahmen(zeilen);
      setTurniere((turnierAntwort.data ?? []) as TurnierZeile[]);
      setTeilnahmen((teilnahmeAntwort.data ?? []) as Teilnahme[]);
      setSerien(serienAntwort.data ?? []);
      setLaedt(false);
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, zeitraum]);

  const namen = useMemo(() => {
    const map = new Map<string, string>();
    personen.forEach((p) => map.set(p.id, p.anzeigename || personName(p)));
    return map;
  }, [personen]);
  const name = (id: string) => namen.get(id) ?? '?';

  // Gäste und ausgetretene Personen stehen in keiner Rangliste
  const mitglieder = useMemo(
    () => new Set(personen.filter((p) => p.status === 'mitglied').map((p) => p.id)),
    [personen]
  );

  const quoten = useMemo(
    () =>
      siegquoten(
        disziplin === 'alle' ? poolPartien : poolPartien.filter((p) => p.disziplin === disziplin),
        mitglieder,
        Number(mindestens)
      ),
    [poolPartien, mitglieder, disziplin, mindestens]
  );

  const beste141 = useMemo(
    () => bestenliste141([...mitglieder], partien141, aufnahmen, 20),
    [mitglieder, partien141, aufnahmen]
  );

  const titelliste = useMemo(() => {
    const ab =
      zeitraum === 'alle'
        ? '1900-01-01'
        : (() => {
            const d = new Date();
            d.setMonth(d.getMonth() - Number(zeitraum));
            return d.toISOString().slice(0, 10);
          })();
    const beendet = new Set(turniere.filter((t) => t.status === 'beendet' && t.datum >= ab).map((t) => t.id));
    return titel(teilnahmen, beendet, mitglieder);
  }, [turniere, teilnahmen, mitglieder, zeitraum]);

  // Serien laufen über eine Saison, der Zeitraum oben gilt hier nicht
  const serienbild = useMemo(() => {
    const anzahl = new Map<string, number>();
    teilnahmen.forEach((t) => anzahl.set(t.turnier_id, (anzahl.get(t.turnier_id) ?? 0) + 1));
    const jeSerie: Record<string, SerienTurnier[]> = {};
    turniere
      .filter((t) => t.status === 'beendet' && t.serie_id)
      .forEach((t) => {
        const liste = jeSerie[t.serie_id as string] ?? [];
        liste.push({
          id: t.id,
          name: t.name,
          datum: t.datum,
          teilnehmer: t.teilnehmerzahl ?? anzahl.get(t.id) ?? 0,
          platzierungen: teilnahmen
            .filter((x) => x.turnier_id === t.id && x.endplatz !== null)
            .map((x) => ({ spieler: x.person_id, platz: x.endplatz as number }))
        });
        jeSerie[t.serie_id as string] = liste;
      });
    return serienUebersicht(serien, jeSerie, mitglieder);
  }, [serien, turniere, teilnahmen, mitglieder]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="statkopf">
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value)} aria-label="Zeitraum">
            {ZEITRAEUME.map((z) => (
              <option key={z.wert} value={z.wert}>
                {z.name}
              </option>
            ))}
          </select>
          <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as 'alle' | Disziplin)} aria-label="Disziplin">
            <option value="alle">alle Disziplinen</option>
            {POOL_DISZIPLINEN.map((d) => (
              <option key={d} value={d}>
                {DISZIPLIN_TEXT[d]}
              </option>
            ))}
          </select>
          <label>
            mindestens{' '}
            <select value={mindestens} onChange={(e) => setMindestens(e.target.value)} aria-label="Mindestzahl Partien">
              {MINDEST.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>{' '}
            Partien
          </label>
          {laedt && <span className="hinweis">Lädt.</span>}
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        <p className="hinweis">
          Zeitraum und Disziplin gelten für die Siegquote und die Titel. Gäste und ausgetretene Personen stehen in keiner
          Rangliste.
        </p>
      </section>

      <section className="block">
        <h2>Siegquote {disziplin === 'alle' ? '' : `· ${DISZIPLIN_TEXT[disziplin]}`}</h2>
        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Platz</th>
              <th>Name</th>
              <th className="rechts">Partien</th>
              <th className="rechts">S : N</th>
              <th className="rechts">Siegquote</th>
              <th className="rechts">Racks</th>
              <th className="rechts">Rackquote</th>
            </tr>
          </thead>
          <tbody>
            {quoten.map((z, i) => (
              <tr key={z.person}>
                <td>{i + 1}</td>
                <td>{name(z.person)}</td>
                <td className="rechts">{z.partien}</td>
                <td className="rechts">
                  {z.siege} : {z.niederlagen}
                </td>
                <td className="rechts">{prozent(z.siegquote)}</td>
                <td className="rechts">
                  {z.eigene} : {z.fremde}
                </td>
                <td className="rechts">{prozent(z.rackquote)}</td>
              </tr>
            ))}
            {quoten.length === 0 && (
              <tr>
                <td colSpan={7} className="hinweis">
                  Im Zeitraum hat niemand genug Partien.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="hinweis">Gezählt werden entschiedene Partien zwischen zwei Mitgliedern, Turnier wie Einzelspiel.</p>
      </section>

      <section className="block">
        <h2>Bestenliste 14.1</h2>
        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Platz</th>
              <th>Name</th>
              <th className="rechts">Partien</th>
              <th className="rechts">Aufnahmen</th>
              <th className="rechts">GD</th>
              <th className="rechts">Höchste Serie</th>
            </tr>
          </thead>
          <tbody>
            {beste141.map((z, i) => (
              <tr key={z.person}>
                <td>{i + 1}</td>
                <td>{name(z.person)}</td>
                <td className="rechts">{z.partien}</td>
                <td className="rechts">{z.aufnahmen}</td>
                <td className="rechts">{zahl(z.gd)}</td>
                <td className="rechts">{z.hs}</td>
              </tr>
            ))}
            {beste141.length === 0 && (
              <tr>
                <td colSpan={6} className="hinweis">
                  Noch keine 14.1-Partien mit mindestens 20 Aufnahmen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="hinweis">GD ist Punkte je Aufnahme. Aufgeführt wird, wer im Zeitraum mindestens 20 Aufnahmen hat.</p>
      </section>

      <section className="block">
        <div className="bearbeitenkopf">
          <h2>Titel</h2>
          <label className="ankreuz">
            <input type="checkbox" checked={alleTitel} onChange={(e) => setAlleTitel(e.target.checked)} />
            auch ohne Podestplatz
          </label>
        </div>
        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Platz</th>
              <th>Name</th>
              <th className="rechts">Turniersiege</th>
              <th className="rechts">Podest</th>
              <th className="rechts">Teilnahmen</th>
            </tr>
          </thead>
          <tbody>
            {(alleTitel ? titelliste : titelliste.filter((z) => z.podest > 0)).map((z, i) => (
              <tr key={z.person}>
                <td>{i + 1}</td>
                <td>{name(z.person)}</td>
                <td className="rechts">{z.siege}</td>
                <td className="rechts">{z.podest}</td>
                <td className="rechts">{z.teilnahmen}</td>
              </tr>
            ))}
            {titelliste.length === 0 && (
              <tr>
                <td colSpan={5} className="hinweis">
                  Im Zeitraum wurde noch kein Turnier abgeschlossen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="hinweis">
          Podest sind die Plätze 1 bis 3 in beendeten Turnieren. Ohne Haken stehen hier nur Spieler mit mindestens einem
          Podestplatz ({titelliste.length} mit Teilnahme insgesamt).
        </p>
      </section>

      <section className="block">
        <h2>Vereinsserien</h2>
        <table className="tabelle">
          <thead>
            <tr>
              <th>Name</th>
              {serienbild.serien.map((s) => (
                <th key={s.id} className="rechts">
                  {s.name}
                  {s.saison ? <small> {s.saison}</small> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {serienbild.zeilen.map((z) => (
              <tr key={z.person}>
                <td>{name(z.person)}</td>
                {serienbild.serien.map((s) => {
                  const p = z.plaetze[s.id];
                  return (
                    <td key={s.id} className="rechts">
                      {p ? (
                        <>
                          {p.platz}.<small> ({p.punkte} Pkt.)</small>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {serienbild.zeilen.length === 0 && (
              <tr>
                <td colSpan={serienbild.serien.length + 1} className="hinweis">
                  Noch keine gewerteten Serienturniere.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="hinweis">
          Platz und Punkte je Serie, gerechnet wie auf der Seite „Serien“. Sortiert nach der besten Platzierung.
        </p>
      </section>
    </div>
  );
}
