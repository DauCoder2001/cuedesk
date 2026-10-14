import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { nameZerlegen, personName } from '../namen';
import type { Disziplin, Person, Serie } from '../datenbank.types';
import {
  abendLesen,
  datumAusDateiname,
  disziplinAusDateiname,
  freitageImMonat,
  namenDesAbends,
  namenVorschlagen
} from '../excel-serie';
import type { Abend, NamensWahl } from '../excel-serie';
import { abendBlatt } from '../excel-raster';
import { Modal } from '../modal';
import { useRueckfrage } from '../rueckfrage';

// System -> "Excel-Serie einlesen": Abend-Dateien der alten Excel-Serien
// (src/excel-serie.ts) als beendete Turniere einer angelegten Serie
// uebernehmen, mit Endplatzierung und allen Spielen. Geschrieben wird erst
// mit "Uebernehmen"; ein Abend, den die Serie am selben Tag schon hat, wird
// uebersprungen. SheetJS wird erst beim Auswaehlen der Dateien geladen.

type Eintrag = { datei: string; datum: string; monat: string | null; abend: Abend | null; fehler: string | null };

const DISZIPLINEN: [Disziplin, string][] = [
  ['8-ball', '8-Ball'],
  ['9-ball', '9-Ball'],
  ['10-ball', '10-Ball']
];
const datumText = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');
const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monatText = (monat: string | null) => (monat ? `${MONATSNAMEN[Number(monat.slice(5)) - 1]} ${monat.slice(0, 4)}` : 'Monat unbekannt');

export default function ExcelSerie({ vereinId, schliessen }: { vereinId: string; schliessen: () => void }) {
  const [serien, setSerien] = useState<Serie[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [serieId, setSerieId] = useState('');
  const [disziplin, setDisziplin] = useState<Disziplin | ''>('');
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, NamensWahl>>({});
  const [vorhanden, setVorhanden] = useState<Set<string>>(new Set());
  const [mitRating, setMitRating] = useState(true);
  // Vorhandene importierte Spieltage desselben Tages ersetzen (Korrektur)
  const [ersetzen, setErsetzen] = useState(false);
  const [rueckfrage, fragen] = useRueckfrage();
  const [liest, setLiest] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [protokoll, setProtokoll] = useState<string[]>([]);
  const melde = (zeile: string) => setProtokoll((bisher) => [...bisher, zeile]);

  useEffect(() => {
    void Promise.all([
      supabase.from('serien').select('*').eq('verein_id', vereinId).order('aktiv', { ascending: false }).order('name'),
      supabase.from('personen').select('*').eq('verein_id', vereinId)
    ]).then(([s, p]) => {
      setSerien(s.data ?? []);
      setPersonen(p.data ?? []);
    });
  }, [vereinId]);

  const serie = serien.find((s) => s.id === serieId) ?? null;

  // Abende, die die Serie an diesem Tag schon hat
  useEffect(() => {
    if (!serieId) return setVorhanden(new Set());
    void supabase
      .from('turniere')
      .select('datum')
      .eq('verein_id', vereinId)
      .eq('serie_id', serieId)
      .then(({ data }) => setVorhanden(new Set((data ?? []).map((t) => t.datum))));
  }, [serieId, vereinId]);

  async function dateienLesen(liste: FileList) {
    setFehler(null);
    setProtokoll([]);
    setLiest(true);
    try {
      const XLSX = await import('xlsx');
      const neu: Eintrag[] = [];
      for (const datei of [...liste]) {
        const { datum, monat } = datumAusDateiname(datei.name);
        try {
          const mappe = XLSX.read(await datei.arrayBuffer());
          const raster = abendBlatt(mappe, XLSX.utils);
          neu.push(
            raster
              ? { datei: datei.name, datum: datum ?? '', monat, abend: abendLesen(raster), fehler: null }
              : { datei: datei.name, datum: datum ?? '', monat, abend: null, fehler: 'Kein Blatt mit "Teilnehmer Gruppe" gefunden.' }
          );
        } catch (e) {
          neu.push({ datei: datei.name, datum: '', monat, abend: null, fehler: `Nicht lesbar: ${(e as Error).message}` });
        }
      }
      neu.sort((a, b) => (a.datum || a.monat || a.datei).localeCompare(b.datum || b.monat || b.datei));
      setEintraege(neu);
      setVersucht(false);
      setFertig(false);
      const namen = [...new Set(neu.flatMap((e) => (e.abend ? namenDesAbends(e.abend) : [])))].sort((a, b) => a.localeCompare(b, 'de'));
      setZuordnung(namenVorschlagen(namen, personen));
      if (!disziplin) {
        const ausName = neu.map((e) => disziplinAusDateiname(e.datei)).find(Boolean);
        if (ausName) setDisziplin(ausName);
      }
    } catch (e) {
      setFehler(`Excel-Leser nicht geladen: ${(e as Error).message}`);
    } finally {
      setLiest(false);
    }
  }

  const namen = useMemo(() => Object.keys(zuordnung).sort((a, b) => a.localeCompare(b, 'de')), [zuordnung]);
  const auswahl = useMemo(() => [...personen].sort((x, y) => personName(x).localeCompare(personName(y), 'de')), [personen]);
  const lesbar = eintraege.filter((e) => e.abend);
  const diszi: Disziplin | '' = serie?.disziplin ?? disziplin;
  // Zeilen, die das Uebernehmen verhindern: Datum fehlt oder doppelt
  const tage = lesbar.map((e) => e.datum).filter(Boolean);
  const zeilenFehler = (e: Eintrag): string | null =>
    !e.abend ? null : !e.datum ? 'Datum fehlt' : tage.filter((t) => t === e.datum).length > 1 ? 'Datum doppelt' : null;
  const [versucht, setVersucht] = useState(false);
  const [fertig, setFertig] = useState(false);

  // Fenster fuer fehlende Daten: Entwurf je Datei
  const [datumsEntwurf, setDatumsEntwurf] = useState<Record<string, string> | null>(null);
  const datumsFehler = useMemo(() => {
    if (!datumsEntwurf) return null;
    const leer = Object.entries(datumsEntwurf).filter(([, d]) => !d);
    if (leer.length > 0) return `Noch ohne Datum: ${leer.map(([n]) => n).join(', ')}.`;
    const alle = lesbar.map((e) => datumsEntwurf[e.datei] ?? e.datum);
    const doppelt = alle.filter((t, i) => alle.indexOf(t) !== i);
    if (doppelt.length > 0) return `Zwei Spieltage am selben Tag: ${[...new Set(doppelt)].map(datumText).join(', ')}.`;
    return null;
  }, [datumsEntwurf, lesbar]);

  // Abbrechen: schon gewaehlte Daten in die Tabelle uebernehmen, nichts einlesen
  function datumsFensterSchliessen() {
    if (datumsEntwurf) {
      setEintraege((alt) => alt.map((e) => (datumsEntwurf[e.datei] ? { ...e, datum: datumsEntwurf[e.datei] } : e)));
    }
    setDatumsEntwurf(null);
  }

  function datenUebernehmen() {
    if (!datumsEntwurf || datumsFehler) return;
    const neu = eintraege.map((e) => (datumsEntwurf[e.datei] !== undefined ? { ...e, datum: datumsEntwurf[e.datei] } : e));
    setEintraege(neu);
    setDatumsEntwurf(null);
    void uebernehmen(neu);
  }

  function pruefen(lesbar: Eintrag[]): string | null {
    if (!serie) return 'Bitte eine Serie wählen.';
    if (!diszi) return 'Bitte die Disziplin wählen.';
    if (lesbar.length === 0) return 'Keine lesbare Spieltag-Datei ausgewählt.';
    const ohneDatum = lesbar.filter((e) => !e.datum);
    if (ohneDatum.length > 0) return `Datum fehlt: ${ohneDatum.map((e) => e.datei).join(', ')}.`;
    const tage = lesbar.map((e) => e.datum);
    const doppelt = tage.filter((t, i) => tage.indexOf(t) !== i);
    if (doppelt.length > 0) return `Zwei Spieltage am selben Tag: ${[...new Set(doppelt)].map(datumText).join(', ')}.`;
    return null;
  }

  async function uebernehmen(liste: Eintrag[] = eintraege) {
    const lesbar = liste.filter((e) => e.abend);
    setVersucht(true);
    // Fehlt nur das Datum, fragt ein Fenster danach
    if (serie && diszi && lesbar.some((e) => !e.datum)) {
      setFehler(null);
      setDatumsEntwurf(Object.fromEntries(lesbar.filter((e) => !e.datum).map((e) => [e.datei, ''])));
      return;
    }
    const problem = pruefen(lesbar);
    if (problem) {
      setFehler(problem);
      document.getElementById('excel-abende')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const zuErsetzen = ersetzen ? lesbar.filter((e) => vorhanden.has(e.datum)) : [];
    if (
      zuErsetzen.length > 0 &&
      !(await fragen(
        `${zuErsetzen.length === 1 ? 'Einen vorhandenen Spieltag' : `${zuErsetzen.length} vorhandene Spieltage`} der Serie (${zuErsetzen
          .map((e) => datumText(e.datum))
          .join(', ')}) löschen und neu einlesen? Teilnehmer, Endplätze und Partien dieser Tage werden ersetzt. In CueDesk gespielte Turniere bleiben unberührt.`,
        'Ersetzen',
        { schutzwort: vereinId }
      ))
    ) {
      return;
    }
    setFehler(null);
    setProtokoll([]);
    setLaeuft(true);
    try {
      // 1. Neue Spieler
      const personNachName = new Map<string, string>();
      let angelegt = 0;
      for (const name of namen) {
        const wahl = zuordnung[name];
        if (wahl === 'weglassen') continue;
        if (wahl !== 'neu-gast' && wahl !== 'neu-mitglied') {
          personNachName.set(name, wahl);
          continue;
        }
        const { vorname, nachname } = nameZerlegen(name);
        const { data, error } = await supabase
          .from('personen')
          .insert({ verein_id: vereinId, vorname, nachname, anzeigename: name, status: wahl === 'neu-gast' ? 'gast' : 'mitglied' })
          .select('id')
          .single();
        if (error || !data) throw new Error(`Spieler ${name}: ${error?.message}`);
        personNachName.set(name, data.id);
        angelegt += 1;
      }
      if (angelegt > 0) melde(`${angelegt} Spieler neu angelegt.`);

      // 2. Je Abend ein beendetes Turnier der Serie
      let turniere = 0;
      let partien = 0;
      for (const e of lesbar) {
        const a = e.abend!;
        if (vorhanden.has(e.datum)) {
          if (!ersetzen) {
            melde(`${datumText(e.datum)}: in der Serie schon vorhanden, übersprungen.`);
            continue;
          }
          // Nur importierte Spieltage ersetzen; Teilnehmer und Partien gehen mit (Fremdschluessel mit Kaskade)
          const { error: fehlerWeg } = await supabase
            .from('turniere')
            .delete()
            .eq('verein_id', vereinId)
            .eq('serie_id', serie!.id)
            .eq('datum', e.datum)
            .eq('quelle', 'import');
          if (fehlerWeg) throw new Error(`Spieltag ${datumText(e.datum)} nicht ersetzt: ${fehlerWeg.message}`);
          const { count } = await supabase
            .from('turniere')
            .select('id', { count: 'exact', head: true })
            .eq('verein_id', vereinId)
            .eq('serie_id', serie!.id)
            .eq('datum', e.datum);
          if ((count ?? 0) > 0) {
            melde(`${datumText(e.datum)}: in CueDesk gespieltes Turnier vorhanden, nicht ersetzt.`);
            continue;
          }
          melde(`${datumText(e.datum)}: alter Spieltag gelöscht.`);
        }
        const teilnehmer = [...new Set([...a.gruppen.flatMap((g) => g.spieler), ...a.platzierung.map((p) => p.name)])].filter((n) =>
          personNachName.has(n)
        );
        const { data: turnier, error } = await supabase
          .from('turniere')
          .insert({
            verein_id: vereinId,
            name: `${serie!.name} ${datumText(e.datum)}`,
            datum: e.datum,
            disziplin: diszi as Disziplin,
            modus: a.gruppen.length >= 2 ? 'zwei-gruppen' : 'einzelgruppe',
            serie_id: serie!.id,
            status: 'beendet',
            rating_werten: mitRating,
            quelle: 'import',
            alt_id: `excel:${serie!.id}:${e.datum}`,
            teilnehmerzahl: teilnehmer.length,
            importiert_am: new Date().toISOString(),
            beendet_am: new Date(`${e.datum}T23:00:00`).toISOString()
          })
          .select('id')
          .single();
        if (error || !turnier) throw new Error(`Spieltag ${datumText(e.datum)}: ${error?.message}`);
        turniere += 1;

        const { error: fehlerTn } = await supabase.from('turnier_teilnehmer').upsert(
          teilnehmer.map((n) => ({
            turnier_id: turnier.id,
            person_id: personNachName.get(n)!,
            verein_id: vereinId,
            endplatz: a.platzierung.find((p) => p.name === n)?.platz ?? null,
            gruppe: a.gruppen.find((g) => g.spieler.includes(n))?.name ?? null,
            gesetzt: false
          })),
          { onConflict: 'turnier_id,person_id' }
        );
        if (fehlerTn) throw new Error(`Teilnehmer ${datumText(e.datum)}: ${fehlerTn.message}`);

        const zeilen = a.spiele
          .filter((s) => personNachName.has(s.a) && personNachName.has(s.b) && personNachName.get(s.a) !== personNachName.get(s.b))
          .map((s) => ({
            verein_id: vereinId,
            turnier_id: turnier.id,
            disziplin: diszi as Disziplin,
            datum: e.datum,
            phase: s.phase,
            gruppe: s.gruppe,
            paarung: s.paarung,
            spieler_a: personNachName.get(s.a)!,
            spieler_b: personNachName.get(s.b)!,
            race_to: a.raceTo && a.raceTo > 0 ? a.raceTo : null,
            ergebnis_a: s.ergA,
            ergebnis_b: s.ergB,
            status: 'beendet' as const,
            rating_werten: mitRating,
            beendet: new Date(`${e.datum}T23:00:00`).toISOString()
          }));
        if (zeilen.length > 0) {
          const { error: fehlerP } = await supabase.from('partien').insert(zeilen);
          if (fehlerP) throw new Error(`Partien ${datumText(e.datum)}: ${fehlerP.message}`);
        }
        partien += zeilen.length;
        melde(`${datumText(e.datum)}: ${teilnehmer.length} Teilnehmer, ${zeilen.length} Partien.`);
      }
      melde(`Fertig: ${turniere} Spieltage mit ${partien} Partien übernommen.${mitRating && partien > 0 ? ' Das Rating unter Rating mit „Jetzt neu berechnen“ aktualisieren.' : ''}`);
      setVorhanden((alt) => new Set([...alt, ...lesbar.map((e) => e.datum)]));
      setFertig(true);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <section className="block">
        <h2>Excel-Serie einlesen</h2>
        <p className="hinweis">
          Spieltag-Dateien der alten Excel-Serien („2 Gruppen Turnier – Jeder gegen Jeden“, .xls oder .xlsx), mehrere auf
          einmal. Jede Datei wird ein beendetes Turnier der gewählten Serie, mit Endplatzierung und allen Partien. Die
          Dateien werden nur im Browser gelesen; geschrieben wird erst mit „Übernehmen“.
        </p>
        <div className="zeile">
          <select value={serieId} onChange={(e) => setSerieId(e.target.value)} required title="Die Serie, zu der die Spieltage gehören">
            <option value="">Serie wählen …</option>
            {serien.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.saison ? ` (${s.saison})` : ''}
                {s.aktiv ? '' : ' – inaktiv'}
              </option>
            ))}
          </select>
          {serie && !serie.disziplin && (
            <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as Disziplin)} required title="Disziplin der Spieltage">
              <option value="">Disziplin wählen …</option>
              {DISZIPLINEN.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <input
            type="file"
            multiple
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => e.target.files && e.target.files.length > 0 && void dateienLesen(e.target.files)}
            disabled={liest || laeuft}
          />
          <button type="button" title="Schließen, ohne etwas zu übernehmen" onClick={schliessen} disabled={laeuft}>
            Schließen
          </button>
        </div>
        {serien.length === 0 && <p className="hinweis">Noch keine Serie angelegt – zuerst unter Serien eine anlegen.</p>}
        {liest && <p className="hinweis">Dateien werden gelesen …</p>}
      </section>

      {eintraege.length > 0 && (
        <section className="block" id="excel-abende">
          <h2>Serien-Spieltage</h2>
          {!fertig && lesbar.length > 0 && (
            <p className="einlesehinweis">
              Noch nichts übernommen. Prüfen, Namen zuordnen und dann ganz unten auf <strong>„Spieltage übernehmen“</strong>{' '}
              klicken. „Speichern“ oben gilt nur für die Einstellungen des Vereins.
            </p>
          )}
          {versucht && fehler && <p className="fehler">{fehler}</p>}
          <table className="tabelle kompakt">
            <thead>
              <tr>
                <th>Datei</th>
                <th style={{ width: '150px' }}>Datum</th>
                <th style={{ width: '80px' }}>Spieler</th>
                <th style={{ width: '70px' }}>Partien</th>
                <th style={{ width: '140px' }}>Sieger</th>
                <th>Hinweise</th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e, i) => (
                <tr key={e.datei} className={versucht && zeilenFehler(e) ? 'fehlerzeile' : undefined}>
                  <td>{e.datei}</td>
                  <td>
                    {e.abend && (
                      <input
                        type="date"
                        required
                        value={e.datum}
                        min={e.monat ? `${e.monat}-01` : undefined}
                        max={e.monat ? `${e.monat}-31` : undefined}
                        onChange={(x) =>
                          setEintraege((alt) => alt.map((y, j) => (j === i ? { ...y, datum: x.target.value } : y)))
                        }
                      />
                    )}
                  </td>
                  <td>{e.abend ? new Set(namenDesAbends(e.abend)).size : '–'}</td>
                  <td>{e.abend?.spiele.length ?? '–'}</td>
                  <td>{e.abend?.platzierung[0]?.name ?? '–'}</td>
                  <td className="hinweis">
                    {e.fehler ??
                      [
                        e.datum && vorhanden.has(e.datum)
                          ? ersetzen
                            ? 'In der Serie schon vorhanden, wird ersetzt.'
                            : 'In der Serie schon vorhanden, wird übersprungen.'
                          : '',
                        !e.datum ? `Datum eintragen${e.monat ? ` (${e.monat.slice(5)}/${e.monat.slice(0, 4)})` : ''}.` : '',
                        zeilenFehler(e) === 'Datum doppelt' ? 'Datum doppelt – zwei Spieltage am selben Tag.' : '',
                        ...(e.abend?.warnungen ?? [])
                      ]
                        .filter(Boolean)
                        .join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {namen.length > 0 && (
        <section className="block">
          <h2>Namen zu Spielern</h2>
          <table className="tabelle kompakt">
            <thead>
              <tr>
                <th>Name in Excel</th>
                <th style={{ width: '260px' }}>wird zu</th>
              </tr>
            </thead>
            <tbody>
              {namen.map((n) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td>
                    <select value={zuordnung[n]} onChange={(e) => setZuordnung((alt) => ({ ...alt, [n]: e.target.value }))}>
                      <option value="neu-gast">neu anlegen als Gast</option>
                      <option value="neu-mitglied">neu anlegen als Mitglied</option>
                      <option value="weglassen">nicht übernehmen</option>
                      {auswahl.map((p) => (
                        <option key={p.id} value={p.id}>
                          {personName(p)}
                          {p.status === 'mitglied' ? '' : p.status === 'gast' ? ' (Gast)' : ' (ausgetreten)'}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hinweis">
            Vorgeschlagen wird ein Spieler mit gleichem Namen, Anzeigenamen, „Vorname N.“ oder eindeutigem Vornamen. Wer
            „nicht übernommen“ wird, fehlt in Platzierung und Partien.
          </p>
        </section>
      )}

      {lesbar.length > 0 && (
        <section className="block">
          <h2>Übernehmen</h2>
          <label className="ankreuz">
            <input type="checkbox" checked={mitRating} onChange={(e) => setMitRating(e.target.checked)} />
            <span>
              Partien fürs Rating werten
              <small>danach unter Rating „Jetzt neu berechnen“</small>
            </span>
          </label>
          <label className="ankreuz">
            <input type="checkbox" checked={ersetzen} onChange={(e) => setErsetzen(e.target.checked)} />
            <span>
              Vorhandene Spieltage ersetzen
              <small>
                zum Korrigieren: Spieltage derselben Serie am selben Tag werden gelöscht und neu eingelesen (nur eingelesene, mit
                Schutzwort)
              </small>
            </span>
          </label>
          <div className="zeile">
            <button
              type="button"
              className="hauptaktion"
              title="Die Spieltage als Turniere der Serie anlegen"
              onClick={() => void uebernehmen()}
              disabled={laeuft}
            >
              {laeuft ? 'Wird übernommen …' : 'Spieltage übernehmen'}
            </button>
            <span className="hinweis">
              {ersetzen
                ? 'Spieltage, die die Serie am selben Tag schon hat, werden ersetzt.'
                : 'Spieltage, die die Serie am selben Tag schon hat, werden übersprungen.'}
            </span>
          </div>
          {fehler && <p className="fehler">{fehler}</p>}
          {protokoll.length > 0 && (
            <ul className="protokoll">
              {protokoll.map((zeile, nummer) => (
                <li key={nummer}>{zeile}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {datumsEntwurf && (
        <Modal breit abbrechen={datumsFensterSchliessen}>
          <div className="feldkopf">
            {Object.keys(datumsEntwurf).length === 1
              ? 'Datum für einen Spieltag fehlt'
              : `Datum für ${Object.keys(datumsEntwurf).length} Spieltage fehlt`}
          </div>
          <p className="hinweis" style={{ marginTop: 0 }}>
            Im Dateinamen steht kein Tag. Bitte den Spieltag wählen – die Freitage des Monats stehen zum Anklicken bereit.
          </p>
          <div className="datumsliste">
            {lesbar
              .filter((e) => datumsEntwurf[e.datei] !== undefined)
              .map((e) => {
                const wert = datumsEntwurf[e.datei];
                const setze = (d: string) => setDatumsEntwurf((alt) => (alt ? { ...alt, [e.datei]: d } : alt));
                return (
                  <div key={e.datei} className="datumszeile">
                    <div>
                      <strong>{e.datei}</strong> <span className="hinweis">· {monatText(e.monat)}</span>
                    </div>
                    <div className="zeile">
                      {e.monat &&
                        freitageImMonat(e.monat).map((f) => (
                          <button
                            key={f}
                            type="button"
                            className={wert === f ? 'chip aktiv' : 'chip'}
                            title={`Freitag, ${datumText(f)}`}
                            onClick={() => setze(f)}
                          >
                            Fr. {datumText(f).slice(0, 6)}
                          </button>
                        ))}
                      <input
                        type="date"
                        value={wert}
                        min={e.monat ? `${e.monat}-01` : undefined}
                        max={e.monat ? `${e.monat}-31` : undefined}
                        onChange={(x) => setze(x.target.value)}
                        title="Anderes Datum"
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          {datumsFehler && <p className="hinweis">{datumsFehler}</p>}
          <div className="knopfpaar">
            <button type="button" onClick={datumsFensterSchliessen} title="Fenster schließen, ohne einzulesen; gewählte Daten bleiben in der Tabelle">
              Abbrechen
            </button>
            <button
              type="button"
              className="hauptaktion"
              onClick={datenUebernehmen}
              disabled={!!datumsFehler}
              title="Die Daten eintragen und die Spieltage einlesen"
            >
              Daten übernehmen und einlesen
            </button>
          </div>
        </Modal>
      )}
      {lesbar.length === 0 && fehler && (
        <section className="block">
          <p className="fehler">{fehler}</p>
        </section>
      )}
      {rueckfrage}
    </>
  );
}
