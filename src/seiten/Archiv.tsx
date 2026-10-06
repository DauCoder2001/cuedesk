import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { saisonAus } from '../mannschaften';
import { vereinsEinstellungen } from '../vereinseinstellungen';
import {
  archivFiltern,
  artOptionen,
  artText,
  direktvergleich,
  platzText,
  rundeText,
  saisonOptionen,
  saisonZeitraum,
  siegerVon,
  spieltageZusammenfassen,
  teileVon
} from '../archiv';
import type { ArchivPartie, ArchivTeilnahme, ArchivTurnier, Werte141 } from '../archiv';
import { DISZIPLIN_TEXT, STATUS_TEXT } from './Turniere';
import type { TurnierEinstellungen } from './Turniere';
import TurnierAnsicht from './TurnierAnsicht';
import LigaAnsicht from './LigaAnsicht';
import type { Disziplin, Person, Tisch } from '../datenbank.types';
import { dauerText, saisonUeberblick } from '../saison-ueberblick';
import Platz from './Platz';

// Spiele- und Turnierarchiv: beendete Turniere und Partien mit Filtern nach
// Saison, Disziplin, Turnierart und Spieler. Mit "gegen" entsteht der direkte
// Vergleich zweier Spieler. Sichtbar fuer alle Mitglieder, wie Ranglisten und
// Turnierliste. Gerechnet wird in src/archiv.ts.

const DISZIPLINEN: Disziplin[] = ['8-ball', '9-ball', '10-ball', 'multi-ball', '14-1'];
const SICHTBARE_ZEILEN = 15;

const datumKurz = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const zahl = (w: number | null) =>
  w === null ? '–' : w.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const paar = (a: string | number, b: string | number) => `${a} : ${b}`;

// Alle Zeilen einer Abfrage, auch ueber 1000 hinaus
async function alleZeilen<T>(abruf: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const zeilen: T[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await abruf(von, von + 999);
    if (error) throw new Error(error.message);
    zeilen.push(...(data ?? []));
    if (!data || data.length < 1000) return zeilen;
  }
}

export default function Archiv() {
  const { verein } = useSitzung();
  const beginn = vereinsEinstellungen(verein?.einstellungen).saisonbeginn;
  const heute = new Date().toISOString().slice(0, 10);

  const [personen, setPersonen] = useState<Person[]>([]);
  const [turniere, setTurniere] = useState<ArchivTurnier[]>([]);
  const [teilnahmen, setTeilnahmen] = useState<ArchivTeilnahme[]>([]);
  const [fruehestes, setFruehestes] = useState<string | null>(null);
  const [mitEinzelspielen, setMitEinzelspielen] = useState(false);
  const [partien, setPartien] = useState<ArchivPartie[]>([]);
  const [tische, setTische] = useState<Pick<Tisch, 'id' | 'nummer' | 'bezeichnung'>[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map()); // "person|disziplin"
  const [werte141, setWerte141] = useState<Werte141[]>([]);
  const [offen, setOffen] = useState<ArchivTurnier | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const [saison, setSaison] = useState(() => saisonAus(heute, beginn));
  const [disziplin, setDisziplin] = useState<'alle' | Disziplin>('alle');
  const [art, setArt] = useState('');
  const [spieler, setSpieler] = useState('');
  const [gegen, setGegen] = useState('');

  // Stammdaten: Personen, Turniere, Platzierungen, aktuelles Rating
  useEffect(() => {
    if (!verein) return;
    let vorbei = false;
    void (async () => {
      try {
        const [personenAntwort, turnierZeilen, teilnahmeZeilen, erstesAntwort, einzelAntwort, standAntwort, tischAntwort] = await Promise.all([
          supabase.from('personen').select('*').eq('verein_id', verein.id),
          alleZeilen((von, bis) =>
            supabase
              .from('turniere')
              .select('id, name, datum, disziplin, modus, status, teilnehmerzahl, einstellungen')
              .eq('verein_id', verein.id)
              .order('datum', { ascending: false })
              .range(von, bis)
          ),
          alleZeilen((von, bis) =>
            supabase
              .from('turnier_teilnehmer')
              .select('turnier_id, person_id, endplatz')
              .eq('verein_id', verein.id)
              .order('turnier_id')
              .order('person_id')
              .range(von, bis)
          ),
          supabase.from('partien').select('datum').eq('verein_id', verein.id).order('datum').limit(1),
          supabase
            .from('partien')
            .select('id', { count: 'exact', head: true })
            .eq('verein_id', verein.id)
            .is('turnier_id', null)
            .eq('status', 'beendet'),
          supabase
            .from('rating_stand')
            .select('stichtag, disziplin, person_id, wert')
            .eq('verein_id', verein.id)
            .order('stichtag', { ascending: false })
            .limit(3000),
          supabase.from('tische').select('id, nummer, bezeichnung').eq('verein_id', verein.id).order('nummer')
        ]);
        if (vorbei) return;
        setPersonen(personenAntwort.data ?? []);
        setTische(tischAntwort.data ?? []);
        const liste = turnierZeilen.map((t) => {
          const e = (t.einstellungen ?? {}) as TurnierEinstellungen;
          return {
            id: t.id,
            name: t.name,
            datum: t.datum,
            disziplin: t.disziplin,
            modus: t.modus,
            status: t.status,
            teilnehmerzahl: t.teilnehmerzahl,
            art: e.art ?? null,
            begegnung: e.liga?.begegnung ?? null,
            partner: e.liga?.partner ?? null,
            doppelArt: e.liga?.art === 'doppel',
            haupt: e.liga?.haupt ?? null,
            doppel: e.liga?.doppel ?? null
          };
        });
        // Liga-Spieltag: eine Zeile fuer beide Begegnungen
        setTurniere(spieltageZusammenfassen(liste));
        setTeilnahmen(teilnahmeZeilen);
        const daten = [erstesAntwort.data?.[0]?.datum, ...liste.map((t) => t.datum)].filter((d): d is string => !!d).sort();
        setFruehestes(daten[0] ?? null);
        setMitEinzelspielen((einzelAntwort.count ?? 0) > 0);

        // Nur der neueste Stand je Disziplin
        const neueste = new Map<string, string>();
        (standAntwort.data ?? []).forEach((z) => {
          if (!neueste.has(z.disziplin)) neueste.set(z.disziplin, z.stichtag);
        });
        const karte = new Map<string, number>();
        (standAntwort.data ?? []).forEach((z) => {
          if (z.stichtag === neueste.get(z.disziplin)) karte.set(`${z.person_id}|${z.disziplin}`, z.wert);
        });
        setRatings(karte);
      } catch (e) {
        if (!vorbei) setFehler((e as Error).message);
      }
    })();
    return () => {
      vorbei = true;
    };
  }, [verein]);

  // Beendete Partien der Saison (oder aller Saisons)
  useEffect(() => {
    if (!verein) return;
    let vorbei = false;
    setLaedt(true);
    setFehler(null);
    void (async () => {
      try {
        const zeitraum = saison === 'alle' ? null : saisonZeitraum(saison, beginn);
        const zeilen = await alleZeilen((von, bis) => {
          let abfrage = supabase
            .from('partien')
            .select('id, turnier_id, disziplin, datum, phase, gruppe, spieler_a, spieler_b, partner_a, partner_b, ergebnis_a, ergebnis_b, vorgabe_a, vorgabe_b, beendet, begonnen, tisch_id')
            .eq('verein_id', verein.id)
            .eq('status', 'beendet');
          if (zeitraum) abfrage = abfrage.gte('datum', zeitraum.von).lte('datum', zeitraum.bis);
          return abfrage.order('datum', { ascending: false }).order('id').range(von, bis);
        });
        if (vorbei) return;
        setPartien(zeilen as ArchivPartie[]);
      } catch (e) {
        if (!vorbei) setFehler((e as Error).message);
      }
      if (!vorbei) setLaedt(false);
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, saison, beginn]);

  const filter = { saison, disziplin, art, spieler, gegen: spieler ? gegen : '' };
  const gefiltert = useMemo(
    () => archivFiltern(turniere, partien, teilnahmen, filter, beginn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turniere, partien, teilnahmen, saison, disziplin, art, spieler, gegen, beginn]
  );

  // Saison-Ueberblick: nur nach Saison, die anderen Filter gelten ihm nicht
  const saisonArchiv = useMemo(
    () => archivFiltern(turniere, partien, teilnahmen, { saison, disziplin: 'alle', art: '', spieler: '', gegen: '' }, beginn),
    [turniere, partien, teilnahmen, saison, beginn]
  );
  const ueberblick = useMemo(() => {
    const mitglieder = new Set(personen.filter((p) => p.status === 'mitglied').map((p) => p.id));
    return saisonUeberblick(saisonArchiv.partien, (id) => mitglieder.has(id));
  }, [saisonArchiv, personen]);

  const vergleich = useMemo(
    () => (spieler && gegen ? direktvergleich(spieler, gegen, gefiltert.partien, werte141) : null),
    [spieler, gegen, gefiltert.partien, werte141]
  );

  // 14.1-Kennzahlen der Begegnungen; ein Mitglied liest sie nur fuer eigene Partien
  const ids141 = useMemo(
    () => (spieler && gegen ? gefiltert.partien.filter((p) => p.disziplin === '14-1').map((p) => p.id) : []),
    [spieler, gegen, gefiltert.partien]
  );
  useEffect(() => {
    if (ids141.length === 0) {
      setWerte141([]);
      return;
    }
    let vorbei = false;
    void (async () => {
      const gefunden: Werte141[] = [];
      for (let i = 0; i < ids141.length; i += 100) {
        const { data } = await supabase
          .from('partien_141')
          .select('partie_id, aufnahmen_a, aufnahmen_b, hoechstserie_a, hoechstserie_b')
          .in('partie_id', ids141.slice(i, i + 100));
        gefunden.push(...((data ?? []) as Werte141[]));
      }
      if (!vorbei) setWerte141(gefunden);
    })();
    return () => {
      vorbei = true;
    };
  }, [ids141]);

  const namen = useMemo(() => {
    const karte = new Map<string, string>();
    personen.forEach((p) => karte.set(p.id, p.anzeigename || personName(p)));
    return karte;
  }, [personen]);
  const name = (id: string) => namen.get(id) ?? '?';
  // Kurzform fuer Spaltenkoepfe: "Max M."
  const kurz = (id: string) => {
    const p = personen.find((x) => x.id === id);
    if (!p) return '?';
    if (p.anzeigename) return p.anzeigename;
    return p.nachname ? `${p.vorname} ${p.nachname.slice(0, 1)}.` : p.vorname;
  };

  // Spielerauswahl: wer im Archiv vorkommt, Gaeste gekennzeichnet
  const auswahl = useMemo(() => {
    const beteiligt = new Set<string>();
    teilnahmen.forEach((t) => beteiligt.add(t.person_id));
    partien.forEach((p) => {
      beteiligt.add(p.spieler_a);
      beteiligt.add(p.spieler_b);
      if (p.partner_a) beteiligt.add(p.partner_a);
      if (p.partner_b) beteiligt.add(p.partner_b);
    });
    [spieler, gegen].forEach((id) => id && beteiligt.add(id));
    return personen
      .filter((p) => beteiligt.has(p.id))
      .sort((a, b) => personName(a).localeCompare(personName(b), 'de', { numeric: true }));
  }, [personen, teilnahmen, partien, spieler, gegen]);

  const saisons = saisonOptionen(fruehestes, heute, beginn);
  const arten = artOptionen(turniere, mitEinzelspielen);
  const turnierNamen = new Map(turniere.flatMap((t) => teileVon(t).map((id) => [id, t.name] as const)));
  const teilnehmerzahl = (t: ArchivTurnier) =>
    t.teilnehmerzahl ??
    (t.modus === 'liga'
      ? new Set(
          partien.filter((p) => p.turnier_id !== null && teileVon(t).includes(p.turnier_id)).flatMap((p) => [p.spieler_a, p.spieler_b, p.partner_a, p.partner_b].filter((x): x is string => Boolean(x)))
        ).size
      : teilnahmen.filter((x) => x.turnier_id === t.id).length);
  const siegerName = (t: ArchivTurnier) => {
    if (t.modus === 'liga') return '–';
    const erster = teilnahmen.find((x) => x.turnier_id === t.id && x.endplatz === 1);
    return erster ? name(erster.person_id) : '–';
  };
  const personenSpalten = [spieler, spieler ? gegen : ''].filter(Boolean);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  if (offen) {
    const zurueck = () => setOffen(null);
    // Umschalter zur anderen Begegnung: sie hat im Archiv keine eigene Zeile
    const begegnungOeffnen = (id: string) => setOffen({ ...offen, id });
    return offen.modus === 'liga' ? (
      <LigaAnsicht turnierId={offen.id} zurueck={zurueck} zurueckText="Auswertung und Archiv" oeffnen={begegnungOeffnen} />
    ) : (
      <TurnierAnsicht turnierId={offen.id} zurueck={zurueck} zurueckText="Auswertung und Archiv" />
    );
  }

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="statkopf archivfilter">
          <label>
            <span>Saison</span>
            <select value={saison} onChange={(e) => setSaison(e.target.value)}>
              {saisons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="alle">alle Saisons</option>
            </select>
          </label>
          <label>
            <span>Disziplin</span>
            <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as 'alle' | Disziplin)}>
              <option value="alle">alle</option>
              {DISZIPLINEN.map((d) => (
                <option key={d} value={d}>
                  {DISZIPLIN_TEXT[d]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Turnierart</span>
            <select value={art} onChange={(e) => setArt(e.target.value)}>
              {arten.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Spieler</span>
            <select
              value={spieler}
              onChange={(e) => {
                setSpieler(e.target.value);
                if (e.target.value === gegen) setGegen('');
              }}
            >
              <option value="">alle</option>
              {auswahl.map((p) => (
                <option key={p.id} value={p.id}>
                  {personName(p)}
                  {p.status === 'gast' ? ' (Gast)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label title={spieler ? 'Zweiten Spieler wählen für den direkten Vergleich' : 'Zuerst einen Spieler wählen'}>
            <span>gegen</span>
            <select value={spieler ? gegen : ''} disabled={!spieler} onChange={(e) => setGegen(e.target.value)}>
              <option value="">–</option>
              {auswahl
                .filter((p) => p.id !== spieler)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {personName(p)}
                    {p.status === 'gast' ? ' (Gast)' : ''}
                  </option>
                ))}
            </select>
          </label>
          {laedt && <span className="hinweis">Lädt.</span>}
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        <p className="hinweis">
          Im Archiv stehen beendete und abgebrochene Turniere mit ihren beendeten Partien, dazu die Einzelspiele. Die Saison
          beginnt im {new Date(2000, beginn - 1, 1).toLocaleDateString('de-DE', { month: 'long' })}.
          Mit „gegen“ entsteht der direkte Vergleich zweier Spieler.
        </p>
      </section>

      <section className="block">
        <h2>{saison === 'alle' ? 'Gesamtbilanz aller Saisons' : `Saison-Überblick ${saison}`}</h2>
        <div className="kennzahlen">
          <div>
            <span>Spiele</span>
            <strong>{ueberblick.spiele}</strong>
            <small>mit Einzelspielen, Liga und 14.1</small>
          </div>
          <div>
            <span>Spielzeit an den Tischen</span>
            <strong>{ueberblick.mitDauer > 0 ? dauerText(ueberblick.minuten) : '–'}</strong>
            <small>
              aus {ueberblick.mitDauer} von {ueberblick.spiele} Spielen
            </small>
          </div>
          <div>
            <span>Ø Spieldauer</span>
            <strong>{ueberblick.schnitt !== null ? dauerText(ueberblick.schnitt) : '–'}</strong>
            <small>pro Spiel am Tablet</small>
          </div>
          <div>
            <span>Turniere</span>
            <strong>{saisonArchiv.turniere.length}</strong>
            <small>und Liga-Spieltage im Archiv</small>
          </div>
          <div>
            <span>Aktivster Spieler</span>
            <strong>{ueberblick.aktivster ? name(ueberblick.aktivster.id) : '–'}</strong>
            <small>{ueberblick.aktivster ? `${ueberblick.aktivster.spiele} Spiele` : 'noch keine Spiele'}</small>
          </div>
        </div>
        <div className="ueberblickzweier">
          <div>
            <h3>Beste drei Spieler</h3>
            <p className="hinweis">Nach Siegen, nur Mitglieder.</p>
            {ueberblick.beste.length === 0 ? (
              <p className="hinweis">Noch keine Siege in dieser Auswahl.</p>
            ) : (
              <table className="tabelle kompakt">
                <tbody>
                  {ueberblick.beste.map((z, i) => (
                    <tr key={z.id}>
                      <td className="platzspalte">
                        <Platz platz={i + 1} medaille />
                      </td>
                      <td className="namenspalte">{name(z.id)}</td>
                      <td className="rechts">{z.siege} Siege</td>
                      <td className="rechts">{z.spiele} Spiele</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3>Spielzeit je Tisch</h3>
            <p className="hinweis">Summe der erfassten Spieldauer, nur Spiele am Tablet.</p>
            {ueberblick.jeTisch.length === 0 ? (
              <p className="hinweis">Keine Spieldauer erfasst.</p>
            ) : (
              <div className="tischbalken">
                {ueberblick.jeTisch.map((t) => {
                  const tisch = tische.find((x) => x.id === t.tischId);
                  return (
                    <Fragment key={t.tischId}>
                      <span>
                        {tisch ? `Tisch ${tisch.nummer}${tisch.bezeichnung ? ` · ${tisch.bezeichnung}` : ''}` : 'Tisch (gelöscht)'}
                      </span>
                      <span className="balken">
                        <i style={{ width: `${Math.max(2, (t.minuten / ueberblick.jeTisch[0].minuten) * 100)}%` }} />
                      </span>
                      <span className="rechts">{dauerText(t.minuten)}</span>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {vergleich && (
        <section className="block">
          <h2>
            Direkter Vergleich: {name(spieler)} – {name(gegen)}
          </h2>
          {vergleich.gesamt.partien === 0 ? (
            <p className="hinweis">Mit diesen Filtern haben die beiden nicht gegeneinander gespielt.</p>
          ) : (
            <>
              <div className="kennzahlen">
                <div>
                  <span>Begegnungen</span>
                  <strong>{vergleich.gesamt.partien}</strong>
                  {vergleich.gesamt.unentschieden > 0 && <small>{vergleich.gesamt.unentschieden} unentschieden</small>}
                </div>
                <div>
                  <span>Siege</span>
                  <strong>{paar(vergleich.gesamt.siegeA, vergleich.gesamt.siegeB)}</strong>
                </div>
                {vergleich.jeDisziplin.some((d) => d.disziplin !== '14-1') && (
                  <div>
                    <span>Racks</span>
                    <strong>{paar(vergleich.gesamt.racksA, vergleich.gesamt.racksB)}</strong>
                    <small>Pool, ohne Vorgabe</small>
                  </div>
                )}
              </div>

              <table className="tabelle kompakt">
                <thead>
                  <tr>
                    <th>Disziplin</th>
                    <th className="rechts">Partien</th>
                    <th className="rechts">Siege</th>
                    <th className="rechts">Racks</th>
                    <th className="rechts">Rating heute</th>
                    <th className="rechts">14.1 GD</th>
                    <th className="rechts">14.1 HS</th>
                  </tr>
                </thead>
                <tbody>
                  {vergleich.jeDisziplin.map((d) => {
                    const ist141 = d.disziplin === '14-1';
                    const ratingA = ratings.get(`${spieler}|${d.disziplin}`);
                    const ratingB = ratings.get(`${gegen}|${d.disziplin}`);
                    return (
                      <tr key={d.disziplin}>
                        <td>{DISZIPLIN_TEXT[d.disziplin]}</td>
                        <td className="rechts">{d.partien}</td>
                        <td className="rechts">{paar(d.siegeA, d.siegeB)}</td>
                        <td className="rechts">{ist141 ? '–' : paar(d.racksA, d.racksB)}</td>
                        <td className="rechts">
                          {ist141 || (ratingA === undefined && ratingB === undefined)
                            ? '–'
                            : paar(ratingA ?? '–', ratingB ?? '–')}
                        </td>
                        <td className="rechts">{ist141 ? paar(zahl(d.gdA), zahl(d.gdB)) : '–'}</td>
                        <td className="rechts">{ist141 ? paar(d.hsA ?? '–', d.hsB ?? '–') : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {vergleich.jeDisziplin.some((d) => d.ohneWerte > 0) && (
                <p className="hinweis">
                  GD und Höchstserie stammen aus dem 14.1-Protokoll. Das sieht ein Mitglied nur für eigene Partien, deshalb
                  fehlen hier {vergleich.jeDisziplin.find((d) => d.disziplin === '14-1')?.ohneWerte} Partien.
                </p>
              )}

              <h3>{vergleich.letzte.length === 1 ? 'Die letzte Begegnung' : `Die letzten ${vergleich.letzte.length} Begegnungen`}</h3>
              <div className="formzeile verlaufzeile">
                {vergleich.letzte.map((b) => {
                  const p = b.partie;
                  const aVorne = p.spieler_a === spieler;
                  const ergebnis = aVorne ? paar(p.ergebnis_a ?? 0, p.ergebnis_b ?? 0) : paar(p.ergebnis_b ?? 0, p.ergebnis_a ?? 0);
                  return (
                    <span
                      key={p.id}
                      className={`formmarke breit ${b.sieger === 'a' ? 'sieg' : b.sieger === 'b' ? 'niederlage' : ''}`}
                      title={`${datumKurz(p.datum)} · ${p.turnier_id ? turnierNamen.get(p.turnier_id) ?? 'Turnier' : 'Einzelspiel'} · ${DISZIPLIN_TEXT[p.disziplin]} · ${ergebnis}`}
                    >
                      {b.sieger === 'a' ? kurz(spieler) : b.sieger === 'b' ? kurz(gegen) : '='}
                    </span>
                  );
                })}
              </div>
              <p className="hinweis">
                Links die älteste, rechts die neueste Begegnung; grün: Sieg für {name(spieler)}, rot: Sieg für {name(gegen)}
                <br />
                Mit der Maus auf einem Feld stehen Datum, Turnier und Ergebnis.
              </p>
            </>
          )}
        </section>
      )}

      <section className="block">
        <h2>
          Turniere <small className="hinweis">{gefiltert.turniere.length}</small>
        </h2>
        <Rollbereich stand={gefiltert.turniere}>
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Datum</th>
                <th>Name</th>
                <th>Art</th>
                <th>Disziplin</th>
                <th className="mittig">Teiln.</th>
                <th>Sieger</th>
                {personenSpalten.map((id) => (
                  <th key={id} className="rechts">
                    {kurz(id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gefiltert.turniere.map((t) => (
                <tr key={t.id} className="klickbar" onClick={() => setOffen(t)} title="Turnier öffnen">
                  <td>{datumKurz(t.datum)}</td>
                  <td>
                    {t.name}
                    {t.status === 'abgebrochen' && <span className="marke">{STATUS_TEXT[t.status]}</span>}
                  </td>
                  <td>{artText(t) ?? '–'}</td>
                  <td>{DISZIPLIN_TEXT[t.disziplin]}</td>
                  <td className="mittig">{teilnehmerzahl(t) || '–'}</td>
                  <td>{siegerName(t)}</td>
                  {personenSpalten.map((id) => (
                    <td key={id} className="rechts">
                      {platzText(t, id, teilnahmen, partien) || '–'}
                    </td>
                  ))}
                </tr>
              ))}
              {gefiltert.turniere.length === 0 && (
                <tr>
                  <td colSpan={6 + personenSpalten.length} className="hinweis">
                    Keine Turniere mit diesen Filtern.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Rollbereich>
        <p className="hinweis">
          Ein Klick öffnet das Turnier mit Tabellen und Bericht als PDF.
          {personenSpalten.length > 0 && ' Die Spalten rechts zeigen den Endplatz, im Liga-Spieltag Siege : Niederlagen.'}
        </p>
      </section>

      <section className="block">
        <h2>
          Partien <small className="hinweis">{gefiltert.partien.length}</small>
        </h2>
        <Rollbereich stand={gefiltert.partien}>
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Datum</th>
                <th>Turnier</th>
                <th>Runde</th>
                <th>Disziplin</th>
                <th>Spieler A</th>
                <th className="mittig">Ergebnis</th>
                <th>Spieler B</th>
                <th className="rechts">Vorgabe</th>
                <th className="rechts"></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.partien.map((p) => {
                const sieger = siegerVon(p);
                return (
                  <tr key={p.id}>
                    <td>{datumKurz(p.datum)}</td>
                    <td>{p.turnier_id ? turnierNamen.get(p.turnier_id) ?? '–' : 'Einzelspiel'}</td>
                    <td>{p.turnier_id ? rundeText(p) : '–'}</td>
                    <td>
                      {DISZIPLIN_TEXT[p.disziplin]}
                      {p.partner_a && <span className="marke">Doppel</span>}
                    </td>
                    <td className={sieger === 'a' ? 'sieger' : ''}>
                      {p.partner_a ? `${name(p.spieler_a)} / ${name(p.partner_a)}` : name(p.spieler_a)}
                    </td>
                    <td className="mittig">{paar(p.ergebnis_a ?? 0, p.ergebnis_b ?? 0)}</td>
                    <td className={sieger === 'b' ? 'sieger' : ''}>
                      {p.partner_b ? `${name(p.spieler_b)} / ${name(p.partner_b)}` : name(p.spieler_b)}
                    </td>
                    <td className="rechts">{p.vorgabe_a || p.vorgabe_b ? paar(p.vorgabe_a, p.vorgabe_b) : '–'}</td>
                    <td className="rechts">
                      {p.disziplin === '14-1' && (
                        <a
                          href={`${import.meta.env.BASE_URL}scoreboards/14.1_Log.html?partie=${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Protokoll
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {gefiltert.partien.length === 0 && (
                <tr>
                  <td colSpan={9} className="hinweis">
                    Keine Partien mit diesen Filtern.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Rollbereich>
        <p className="hinweis">Sieger fett, neueste Partie oben. Das Ergebnis enthält die Vorgabe.</p>
      </section>
    </div>
  );
}

// Zeigt 15 Zeilen, der Rest scrollt; der Tabellenkopf bleibt stehen (wie in
// der Serienwertung). Gemessen wird, weil Zeilen umbrechen koennen.
function Rollbereich({ stand, children }: { stand: unknown; children: ReactNode }) {
  const bereich = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bereich.current;
    if (!el) return;
    const zeilen = el.querySelectorAll('tbody tr');
    const letzte = zeilen[SICHTBARE_ZEILEN - 1] as HTMLElement | undefined;
    el.style.maxHeight = zeilen.length > SICHTBARE_ZEILEN && letzte ? `${letzte.offsetTop + letzte.offsetHeight + 1}px` : '';
  }, [stand]);
  return (
    <div className="rollbereich" ref={bereich}>
      {children}
    </div>
  );
}
