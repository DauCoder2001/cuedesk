import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { nameZerlegen, personName } from '../namen';
import type { Person } from '../datenbank.types';
import { auswerten } from '../altdaten-lesen';
import type { Analyse } from '../altdaten-lesen';

// Uebernahme des Datenbestands aus der Serienwertung (Turnier light, v15).
// Die Datei wird nur im Browser gelesen; geschrieben wird erst auf Knopfdruck.

export default function Altdaten() {
  const { verein, darf } = useSitzung();
  const darfUebernehmen = darf('vereinsadmin', 'sportwart');

  const [dateiname, setDateiname] = useState<string | null>(null);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  const [mitSerien, setMitSerien] = useState(true);
  const [mitRating, setMitRating] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [protokoll, setProtokoll] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  function melde(zeile: string) {
    setProtokoll((bisher) => [...bisher, zeile]);
  }

  async function dateiLesen(datei: File) {
    setFehler(null);
    setProtokoll([]);
    setDateiname(datei.name);
    try {
      const inhalt = JSON.parse(await datei.text()) as Parameters<typeof auswerten>[0];
      const ergebnis = auswerten(inhalt);
      setAnalyse(ergebnis);

      const { data } = await supabase.from('personen').select('*').eq('verein_id', verein!.id);
      const vorhanden = data ?? [];
      setPersonen(vorhanden);

      // Namen, die es schon gibt, gleich vorschlagen.
      const vorschlag: Record<string, string> = {};
      ergebnis.namen.forEach(({ name }) => {
        const treffer = vorhanden.find(
          (person) => personName(person).toLowerCase() === name.toLowerCase() ||
            (person.anzeigename ?? '').toLowerCase() === name.toLowerCase()
        );
        vorschlag[name] = treffer ? treffer.id : 'neu';
      });
      setZuordnung(vorschlag);
    } catch (e) {
      setAnalyse(null);
      setFehler('Die Datei liess sich nicht lesen: ' + deutscherFehler((e as Error).message));
    }
  }

  // Teilnehmer eines Turniers schreiben. Doppelte werden ueberschrieben,
  // damit ein wiederholter Lauf nicht scheitert.
  async function teilnehmerSchreiben(
    turnier: Analyse['turniere'][number],
    turnierId: string,
    personNachName: Map<string, string>,
    vereinId: string
  ) {
    const namen = new Set<string>([
      ...turnier.teilnehmer,
      ...turnier.ranking.map((r) => r.name),
      ...turnier.partien.flatMap((p) => [p.a, p.b])
    ]);

    const zeilen = [...namen]
      .map((name) => {
        const personId = personNachName.get(name);
        if (!personId) return null;
        return {
          turnier_id: turnierId,
          person_id: personId,
          verein_id: vereinId,
          endplatz: turnier.ranking.find((r) => r.name === name)?.platz ?? null,
          gesetzt: false
        };
      })
      .filter((zeile) => zeile !== null);

    if (zeilen.length === 0) return;
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .upsert(zeilen, { onConflict: 'turnier_id,person_id' });
    if (error) throw new Error(`Teilnehmer ${turnier.name}: ${error.message}`);
  }

  // Partien eines Turniers schreiben, Rueckgabe: wie viele es wurden.
  async function partienSchreiben(
    turnier: Analyse['turniere'][number],
    turnierId: string,
    personNachName: Map<string, string>,
    vereinId: string
  ) {
    // Durch die Namenszusammenfuehrung koennen Partien entstehen, in denen
    // beide Seiten dieselbe Person sind. Die lassen wir aus und melden es.
    turnier.partien
      .filter((partie) => personNachName.get(partie.a) === personNachName.get(partie.b))
      .forEach((partie) =>
        melde(
          `Übersprungen in "${turnier.name}": ${partie.a} gegen ${partie.b} — nach dem Zusammenführen derselbe Spieler.`
        )
      );

    const zeilen = turnier.partien
      .filter((partie) => personNachName.get(partie.a) !== personNachName.get(partie.b))
      .map((partie) => ({
        verein_id: vereinId,
        turnier_id: turnierId,
        disziplin: turnier.disziplin,
        datum: turnier.datum,
        phase: partie.phase ?? null,
        gruppe: partie.phase?.startsWith('Gruppe')
          ? partie.phase.replace('Gruppe', '').trim() || null
          : null,
        spieler_a: personNachName.get(partie.a)!,
        spieler_b: personNachName.get(partie.b)!,
        race_to: partie.raceTo ?? null,
        vorgabe_a: partie.vorgabeA ?? 0,
        vorgabe_b: partie.vorgabeB ?? 0,
        ergebnis_a: partie.satzA,
        ergebnis_b: partie.satzB,
        status: 'beendet' as const,
        rating_werten: partie.werten !== false,
        rating_grund: partie.grund || null,
        beendet: new Date(turnier.datum).toISOString()
      }));

    if (zeilen.length === 0) return 0;
    const { error } = await supabase.from('partien').insert(zeilen);
    if (error) throw new Error(`Partien ${turnier.name}: ${error.message}`);
    return zeilen.length;
  }

  async function uebernehmen() {
    if (!analyse || !verein) return;
    setLaeuft(true);
    setFehler(null);
    setProtokoll([]);

    try {
      // 1. Personen
      const personNachName = new Map<string, string>();
      for (const eintrag of analyse.namen) {
        const wahl = zuordnung[eintrag.name];
        if (wahl && wahl !== 'neu') {
          personNachName.set(eintrag.name, wahl);
          continue;
        }
        const { vorname, nachname } = nameZerlegen(eintrag.name);
        const { data, error } = await supabase
          .from('personen')
          .insert({
            verein_id: verein.id,
            vorname,
            nachname,
            anzeigename: eintrag.name,
            status: 'mitglied'
          })
          .select('id')
          .single();
        if (error || !data) throw new Error(`Person ${eintrag.name}: ${error?.message}`);
        personNachName.set(eintrag.name, data.id);
      }
      melde(`${personNachName.size} Namen zugeordnet.`);

      // 2. Serien
      const serieNachAltId = new Map<string, string>();
      if (mitSerien) {
        for (const serie of analyse.serien) {
          const { data: vorhanden } = await supabase
            .from('serien')
            .select('id')
            .eq('verein_id', verein.id)
            .eq('alt_id', serie.altId)
            .maybeSingle();
          if (vorhanden) {
            serieNachAltId.set(serie.altId, vorhanden.id);
            continue;
          }
          const { data, error } = await supabase
            .from('serien')
            .insert({
              verein_id: verein.id,
              name: serie.name,
              saison: serie.saison,
              disziplin: serie.disziplin,
              streicher: serie.streicher,
              bonus: serie.bonus,
              aktiv: true,
              alt_id: serie.altId
            })
            .select('id')
            .single();
          if (error || !data) throw new Error(`Serie ${serie.name}: ${error?.message}`);
          serieNachAltId.set(serie.altId, data.id);
        }
        melde(`${serieNachAltId.size} Serien übernommen.`);
      }

      // 3. Turniere mit Teilnehmern und Partien
      let neueTurniere = 0;
      let uebersprungen = 0;
      let neuePartien = 0;

      for (const turnier of analyse.turniere) {
        const { data: schonDa } = await supabase
          .from('turniere')
          .select('id')
          .eq('verein_id', verein.id)
          .eq('name', turnier.name)
          .eq('datum', turnier.datum)
          .maybeSingle();

        // Gibt es das Turnier schon, wird nur ergaenzt, was fehlt. So laesst
        // sich ein abgebrochener Lauf einfach wiederholen.
        if (schonDa) {
          // Teilnehmerzahl nachtragen, falls sie beim ersten Lauf fehlte
          await supabase
            .from('turniere')
            .update({ teilnehmerzahl: turnier.teilnehmerzahl })
            .eq('id', schonDa.id)
            .is('teilnehmerzahl', null);

          const { count } = await supabase
            .from('partien')
            .select('id', { count: 'exact', head: true })
            .eq('turnier_id', schonDa.id);
          if ((count ?? 0) > 0 || turnier.partien.length === 0) {
            uebersprungen += 1;
            continue;
          }
          const nachgetragen = await partienSchreiben(turnier, schonDa.id, personNachName, verein.id);
          neuePartien += nachgetragen;
          melde(`"${turnier.name}" war schon da, ${nachgetragen} fehlende Partien nachgetragen.`);
          continue;
        }

        const { data: neu, error } = await supabase
          .from('turniere')
          .insert({
            verein_id: verein.id,
            name: turnier.name,
            datum: turnier.datum,
            disziplin: turnier.disziplin,
            modus: turnier.modus,
            teilnehmerzahl: turnier.teilnehmerzahl,
            serie_id: turnier.serieAltId ? serieNachAltId.get(turnier.serieAltId) ?? null : null,
            status: 'beendet',
            rating_werten: turnier.werten,
            quelle: 'import',
            alt_id: turnier.altId,
            importiert_am: new Date().toISOString()
          })
          .select('id')
          .single();
        if (error || !neu) throw new Error(`Turnier ${turnier.name}: ${error?.message}`);
        neueTurniere += 1;

        await teilnehmerSchreiben(turnier, neu.id, personNachName, verein.id);
        neuePartien += await partienSchreiben(turnier, neu.id, personNachName, verein.id);
      }
      melde(`${neueTurniere} Turniere und ${neuePartien} Partien übernommen.`);
      if (uebersprungen > 0) melde(`${uebersprungen} Turniere waren schon vorhanden und blieben unverändert.`);

      // 4. Rating: Einstellungen, Startwerte, ausgeblendete Spieler
      if (mitRating) {
        const { error: fehlerEinstellungen } = await supabase.from('rating_einstellungen').upsert({
          verein_id: verein.id,
          zeitraum_monate: analyse.einstellungen.zeitraum,
          mindest_racks: analyse.einstellungen.mindestRacks,
          rueckgriff_monate: analyse.einstellungen.rueckgriff,
          gewicht: analyse.einstellungen.gewicht,
          staerke_prozent: 75,
          vereinsschnitt: 500
        });
        if (fehlerEinstellungen) throw new Error(`Rating-Einstellungen: ${fehlerEinstellungen.message}`);

        for (const startwert of analyse.startwerte) {
          const personId = personNachName.get(startwert.name);
          if (!personId) continue;
          await supabase
            .from('personen_intern')
            .upsert({ person_id: personId, verein_id: verein.id, rating_startwert: startwert.wert });
        }

        const ausgeblendeteIds = analyse.ausgeblendet
          .map((name) => personNachName.get(name))
          .filter(Boolean) as string[];
        if (ausgeblendeteIds.length > 0) {
          await supabase.from('personen').update({ rating_ausgeblendet: true }).in('id', ausgeblendeteIds);
        }
        melde(
          `Rating-Einstellungen, ${analyse.startwerte.length} Startwerte und ${ausgeblendeteIds.length} ausgeblendete Spieler übernommen.`
        );
      }

      melde('Fertig.');
    } catch (e) {
      setFehler(deutscherFehler((e as Error).message));
    } finally {
      setLaeuft(false);
    }
  }

  const ratingPartien = useMemo(() => {
    if (!analyse) return 0;
    return analyse.turniere.reduce(
      (summe, turnier) =>
        summe + (turnier.werten ? turnier.partien.filter((p) => p.werten !== false).length : 0),
      0
    );
  }, [analyse]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;
  if (!darfUebernehmen) return <p className="hinweis">Für diesen Bereich fehlen dir die Rechte.</p>;

  const partienGesamt = analyse?.turniere.reduce((n, t) => n + t.partien.length, 0) ?? 0;

  return (
    <div className="einspaltig">
      <section className="block">
        <h2>Altdaten übernehmen</h2>
        <p className="hinweis">
          Datenbestand der Serienwertung (Turnier light). Die Datei wird zuerst nur gelesen.
          Geschrieben wird erst mit "Übernehmen".
        </p>
        <div className="zeile">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const datei = e.target.files?.[0];
              if (datei) void dateiLesen(datei);
            }}
          />
          {dateiname && <span className="hinweis">{dateiname}</span>}
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
      </section>

      {analyse && (
        <>
          <section className="block">
            <h2>Was in der Datei steht</h2>
            <div className="kennzahlen">
              <div>
                <span>Serien</span>
                <strong>{analyse.serien.length}</strong>
                <small>ohne "Test"</small>
              </div>
              <div>
                <span>Turniere</span>
                <strong>{analyse.turniere.length}</strong>
                <small>{analyse.turniere.filter((t) => t.partien.length > 0).length} mit Partien</small>
              </div>
              <div>
                <span>Partien</span>
                <strong>{partienGesamt}</strong>
                <small>davon {ratingPartien} für das Rating</small>
              </div>
              <div>
                <span>Namen</span>
                <strong>{analyse.namen.length}</strong>
                <small>{analyse.aliase.length} Alias zusammengeführt</small>
              </div>
            </div>
          </section>

          <section className="block">
            <h2>Namen zu Spielern</h2>
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Name in der Datei</th>
                  <th style={{ width: '80px' }}>Partien</th>
                  <th style={{ width: '90px' }}>Plätze</th>
                  <th style={{ width: '240px' }}>wird zu</th>
                </tr>
              </thead>
              <tbody>
                {analyse.namen.map((eintrag) => (
                  <tr key={eintrag.name}>
                    <td>{eintrag.name}</td>
                    <td>{eintrag.partien}</td>
                    <td>{eintrag.platzierungen}</td>
                    <td>
                      <select
                        value={zuordnung[eintrag.name] ?? 'neu'}
                        onChange={(e) =>
                          setZuordnung((bisher) => ({ ...bisher, [eintrag.name]: e.target.value }))
                        }
                      >
                        <option value="neu">neu anlegen</option>
                        {personen.map((person) => (
                          <option key={person.id} value={person.id}>
                            {personName(person)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analyse.aliase.length > 0 && (
              <p className="hinweis">
                Zusammengeführt: {analyse.aliase.map(([a, b]) => `${a} → ${b}`).join(', ')}
              </p>
            )}
          </section>

          <section className="block">
            <h2>Was übernommen wird</h2>
            <label className="ankreuz">
              <input type="checkbox" checked={mitSerien} onChange={(e) => setMitSerien(e.target.checked)} />
              <span>
                Serien mit Platzierungen
                <small>{analyse.serien.map((s) => s.name).join(', ')}</small>
              </span>
            </label>
            <label className="ankreuz">
              <input type="checkbox" checked={mitRating} onChange={(e) => setMitRating(e.target.checked)} />
              <span>
                Rating-Einstellungen, Startwerte und ausgeblendete Spieler
                <small>
                  {analyse.startwerte.length} Startwerte, {analyse.ausgeblendet.length} ausgeblendet
                </small>
              </span>
            </label>

            <div className="zeile">
              <button type="button" onClick={() => void uebernehmen()} disabled={laeuft}>
                {laeuft ? 'Wird übernommen' : 'Übernehmen'}
              </button>
              <span className="hinweis">
                Vorhandene Turniere werden an Name und Datum erkannt und nicht doppelt angelegt.
              </span>
            </div>

            {protokoll.length > 0 && (
              <ul className="protokoll">
                {protokoll.map((zeile, nummer) => (
                  <li key={nummer}>{zeile}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// Meldungen der Datenbank sind englisch. Die haeufigen uebersetzen wir,
// damit im Programm nichts Unverstaendliches steht.
function deutscherFehler(text: string): string {
  const regeln: [RegExp, string][] = [
    [/violates check constraint "partien_check"/, "Eine Partie hat auf beiden Seiten denselben Spieler."],
    [/duplicate key value violates unique constraint "turniere_name_datum"/, "Dieses Turnier gibt es schon (gleicher Name und gleiches Datum)."],
    [/duplicate key value violates unique constraint "turniere_alt_id"/, "Dieses Turnier wurde schon einmal uebernommen."],
    [/duplicate key value violates unique constraint/, "Dieser Eintrag ist schon vorhanden."],
    [/violates foreign key constraint/, "Ein Verweis zeigt ins Leere — vermutlich fehlt ein Spieler."],
    [/violates row-level security policy/, "Dafuer fehlen dir die Rechte."],
    [/null value in column "(w+)"/, "Ein Pflichtfeld ist leer geblieben."],
    [/Failed to fetch/, "Keine Verbindung zur Datenbank."]
  ];
  for (const [muster, deutsch] of regeln) {
    if (muster.test(text)) return deutsch + " (" + text + ")";
  }
  return text;
}
