import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import { LIGEN, wertung } from '../liga';
import { einsaetze, saisonAus, saisonBilanz, saisonListe, stammspielerHinweis } from '../mannschaften';
import type { LigaKennung } from '../liga';
import type { Mannschaft, MannschaftSpieler, Partie, Person, Turnier } from '../datenbank.types';
import type { TurnierEinstellungen } from './Turniere';

// Mannschaften einer Saison mit ihrem Kader. Dazu die Saisonuebersicht der
// eigenen Spieltage und die Einsaetze je Spieler, damit die Festspielregel im
// Blick bleibt. Gerechnet wird beim Anzeigen (src/mannschaften.ts).

type Formular = {
  id: string | null; // null: neue Mannschaft
  name: string;
  saison: string;
  liga: string;
  staffel: string;
  rang: string;
  aktiv: boolean;
  notiz: string;
};

const DATUM = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const heute = () => new Date().toISOString().slice(0, 10);

export default function Mannschaften() {
  const { verein, darf } = useSitzung();
  const darfVerwalten = darf('vereinsadmin', 'sportwart');

  const [saison, setSaison] = useState(saisonAus(heute()));
  const [mannschaften, setMannschaften] = useState<Mannschaft[]>([]);
  const [kader, setKader] = useState<MannschaftSpieler[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [spieltage, setSpieltage] = useState<Turnier[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [formular, setFormular] = useState<Formular | null>(null);
  const [zugang, setZugang] = useState<Record<string, string>>({}); // je Mannschaft der gewaehlte Spieler
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  const laden = useCallback(async () => {
    if (!verein) return;
    const [m, k, p, t] = await Promise.all([
      supabase
        .from('mannschaften')
        .select('*')
        .eq('verein_id', verein.id)
        .order('saison', { ascending: false })
        .order('rang'),
      supabase.from('mannschaft_spieler').select('*').eq('verein_id', verein.id),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('turniere').select('*').eq('verein_id', verein.id).eq('modus', 'liga').order('datum')
    ]);
    if (m.error) setFehler(m.error.message);
    setMannschaften(m.data ?? []);
    setKader(k.data ?? []);
    setPersonen(p.data ?? []);
    setSpieltage(t.data ?? []);

    const ids = (t.data ?? []).map((x) => x.id);
    const pa = ids.length ? await supabase.from('partien').select('*').in('turnier_id', ids) : { data: [] as Partie[] };
    setPartien(pa.data ?? []);
  }, [verein]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const namen = useMemo(() => {
    const karte = new Map<string, string>();
    personen.forEach((p) => karte.set(p.id, personName(p)));
    return karte;
  }, [personen]);
  const anzeige = (id: string) => namen.get(id) ?? '?';

  // Gaeste sind die Gegner; sie zaehlen nicht als Einsatz der eigenen Leute.
  const eigeneIds = useMemo(() => new Set(personen.filter((p) => p.status !== 'gast').map((p) => p.id)), [personen]);
  const mitglieder = useMemo(
    () => personen.filter((p) => p.status === 'mitglied').sort((a, b) => personName(a).localeCompare(personName(b), 'de')),
    [personen]
  );

  const saisons = useMemo(() => {
    const menge = new Set<string>([...saisonListe(), ...mannschaften.map((m) => m.saison), saison]);
    return [...menge].sort().reverse();
  }, [mannschaften, saison]);

  const derSaison = mannschaften.filter((m) => m.saison === saison);
  const ligaAls = (kennung: string | null) => (kennung && kennung in LIGEN ? LIGEN[kennung as LigaKennung].name : null);

  // ---------- Rechnung ----------

  const partienVon = useCallback((t: Turnier) => partien.filter((p) => p.turnier_id === t.id), [partien]);

  const spieltageDerSaison = useMemo(() => spieltage.filter((t) => saisonAus(t.datum) === saison), [spieltage, saison]);

  // Ergebnis einer Begegnung aus Sicht der eigenen Mannschaft
  const ergebnisVon = useCallback(
    (t: Turnier) => {
      const liga = (t.einstellungen as TurnierEinstellungen)?.liga;
      const roh = wertung(
        partienVon(t).map((p) => ({
          nr: ((p.runde ?? 1) - 1) * 4 + (p.paarung ?? 1),
          heim: p.ergebnis_a,
          gast: p.ergebnis_b
        }))
      );
      // Heim steht auf Seite A; spielen wir auswaerts, drehen sich die Zahlen.
      const drehen = !(liga?.heim ?? true);
      const paar = (w: [number, number]): [number, number] => (drehen ? [w[1], w[0]] : w);
      return {
        partiepunkte: paar(roh.partiepunkte),
        matchpunkte: paar(roh.matchpunkte),
        offen: roh.offen,
        entschieden: t.status === 'beendet'
      };
    },
    [partienVon]
  );

  const spieltageVon = useCallback(
    (mannschaft: Mannschaft) =>
      spieltageDerSaison.filter(
        (t) => (t.einstellungen as TurnierEinstellungen)?.liga?.mannschaft_id === mannschaft.id
      ),
    [spieltageDerSaison]
  );

  // Einsaetze je Spieler, ueber alle Mannschaften der Saison
  const einsatzliste = useMemo(
    () =>
      einsaetze(
        spieltageDerSaison.map((t) => ({
          id: t.id,
          mannschaft_id: (t.einstellungen as TurnierEinstellungen)?.liga?.mannschaft_id ?? null,
          spieler: partienVon(t)
            .flatMap((p) => [p.spieler_a, p.spieler_b])
            .filter((id): id is string => Boolean(id) && eigeneIds.has(id))
        }))
      ),
    [spieltageDerSaison, partienVon, eigeneIds]
  );
  const einsatzVon = (person: string, mannschaft: string) =>
    einsatzliste.find((e) => e.person_id === person && e.mannschaft_id === mannschaft) ?? null;

  if (!verein) return null;

  // ---------- Pflege ----------

  async function speichern() {
    if (!formular || !verein) return;
    setFehler(null);
    setMeldung(null);
    if (!formular.name.trim()) return setFehler('Bitte einen Namen eingeben.');
    const satz = {
      verein_id: verein.id,
      name: formular.name.trim(),
      saison: formular.saison,
      liga: formular.liga || null,
      staffel: formular.staffel.trim() || null,
      rang: Math.max(1, Number(formular.rang) || 1),
      aktiv: formular.aktiv,
      notiz: formular.notiz.trim() || null
    };
    const { error } = formular.id
      ? await supabase.from('mannschaften').update(satz).eq('id', formular.id)
      : await supabase.from('mannschaften').insert(satz);
    if (error) {
      return setFehler(
        error.message.includes('duplicate') ? 'Diesen Namen gibt es in der Saison schon.' : error.message
      );
    }
    setSaison(formular.saison);
    setFormular(null);
    await laden();
  }

  async function mannschaftLoeschen(m: Mannschaft) {
    const tage = spieltageVon(m).length;
    const zusatz = tage > 0 ? `\n\n${tage} Spieltage bleiben erhalten, verlieren aber ihre Zuordnung.` : '';
    if (!(await fragen(`Mannschaft „${m.name}“ mit ihrem Kader löschen?${zusatz}`, 'Löschen'))) return;
    const { error } = await supabase.from('mannschaften').delete().eq('id', m.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function spielerAufnehmen(m: Mannschaft) {
    const person = zugang[m.id];
    if (!person) return setFehler('Bitte einen Spieler auswählen.');
    setFehler(null);
    const { error } = await supabase
      .from('mannschaft_spieler')
      .insert({ verein_id: m.verein_id, mannschaft_id: m.id, person_id: person });
    if (error) {
      return setFehler(error.message.includes('duplicate') ? 'Der Spieler steht schon im Kader.' : error.message);
    }
    setZugang((bisher) => ({ ...bisher, [m.id]: '' }));
    await laden();
  }

  async function spielerEntfernen(eintrag: MannschaftSpieler) {
    if (!(await fragen(`${anzeige(eintrag.person_id)} aus dem Kader nehmen?`, 'Entfernen'))) return;
    const { error } = await supabase.from('mannschaft_spieler').delete().eq('id', eintrag.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  // Stammspieler ist jeder nur in einer Mannschaft, Kapitaen gibt es je
  // Mannschaft nur einen. Beide Haken raeumen deshalb hinter sich auf.
  async function hakenSetzen(eintrag: MannschaftSpieler, feld: 'stammspieler' | 'kapitaen', wert: boolean) {
    setFehler(null);
    setMeldung(null);
    const andere = wert
      ? kader.filter((k) =>
          feld === 'stammspieler'
            ? k.person_id === eintrag.person_id &&
              k.id !== eintrag.id &&
              k.stammspieler &&
              derSaison.some((m) => m.id === k.mannschaft_id)
            : k.mannschaft_id === eintrag.mannschaft_id && k.id !== eintrag.id && k.kapitaen
        )
      : [];
    if (andere.length > 0) {
      await supabase
        .from('mannschaft_spieler')
        .update(feld === 'stammspieler' ? { stammspieler: false } : { kapitaen: false })
        .in(
          'id',
          andere.map((k) => k.id)
        );
    }
    const { error } = await supabase
      .from('mannschaft_spieler')
      .update(feld === 'stammspieler' ? { stammspieler: wert } : { kapitaen: wert })
      .eq('id', eintrag.id);
    if (error) return setFehler(error.message);
    if (andere.length > 0 && feld === 'stammspieler') {
      setMeldung(`${anzeige(eintrag.person_id)} ist jetzt hier Stammspieler und nicht mehr in der anderen Mannschaft.`);
    }
    await laden();
  }

  async function berechtigtSetzen(eintrag: MannschaftSpieler, wert: string) {
    const { error } = await supabase
      .from('mannschaft_spieler')
      .update({ berechtigt_ab: wert || null })
      .eq('id', eintrag.id);
    if (error) return setFehler(error.message);
    setKader((liste) => liste.map((k) => (k.id === eintrag.id ? { ...k, berechtigt_ab: wert || null } : k)));
  }

  // ---------- Anzeige ----------

  const leeresFormular = (): Formular => ({
    id: null,
    name: `${verein.kurzname || verein.name} ${derSaison.length + 1}`,
    saison,
    liga: 'kreisklasse',
    staffel: '',
    rang: String(derSaison.length + 1),
    aktiv: true,
    notiz: ''
  });

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <div>
            <h2>Mannschaften</h2>
            <p className="hinweis">
              Kader je Saison mit Stammspielern und Kapitän, dazu die Einsätze jedes Spielers. Wer unten gemeldet ist,
              darf oben aushelfen; Stammspieler bleiben bei ihrer Mannschaft.
            </p>
          </div>
          <div className="knopfpaar">
            <label className="feld">
              <span>Saison</span>
              <select value={saison} onChange={(e) => setSaison(e.target.value)}>
                {saisons.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {darfVerwalten && !formular && (
              <button type="button" title="Eine Mannschaft für diese Saison anlegen" onClick={() => setFormular(leeresFormular())}>
                Mannschaft melden
              </button>
            )}
          </div>
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}

        {formular && (
          <div className="formular">
            <div className="formzeile">
              <label className="feld">
                <span>Name</span>
                <input value={formular.name} onChange={(e) => setFormular({ ...formular, name: e.target.value })} />
              </label>
              <label className="feld">
                <span>Saison</span>
                <select value={formular.saison} onChange={(e) => setFormular({ ...formular, saison: e.target.value })}>
                  {saisons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feld">
                <span>Liga</span>
                <select value={formular.liga} onChange={(e) => setFormular({ ...formular, liga: e.target.value })}>
                  {(Object.keys(LIGEN) as LigaKennung[]).map((k) => (
                    <option key={k} value={k}>
                      {LIGEN[k].name}
                    </option>
                  ))}
                  <option value="">ohne Liga</option>
                </select>
              </label>
              <label className="feld">
                <span>Staffel</span>
                <input
                  value={formular.staffel}
                  onChange={(e) => setFormular({ ...formular, staffel: e.target.value })}
                  placeholder="OH / B"
                />
              </label>
              <label className="feld">
                <span>Nummer im Pass</span>
                <input
                  inputMode="numeric"
                  value={formular.rang}
                  onChange={(e) => setFormular({ ...formular, rang: e.target.value })}
                />
              </label>
              <label className="feld">
                <span>Notiz</span>
                <input value={formular.notiz} onChange={(e) => setFormular({ ...formular, notiz: e.target.value })} />
              </label>
              <label className="haken">
                <input
                  type="checkbox"
                  checked={formular.aktiv}
                  onChange={(e) => setFormular({ ...formular, aktiv: e.target.checked })}
                />
                <span>gemeldet</span>
              </label>
            </div>
            <div className="knopfpaar">
              <button type="button" title="Die Angaben zur Mannschaft speichern" onClick={() => void speichern()}>
                Speichern
              </button>
              <button type="button" onClick={() => setFormular(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {derSaison.length === 0 && !formular && (
          <p className="hinweis">Für die Saison {saison} ist noch keine Mannschaft gemeldet.</p>
        )}
      </section>

      {derSaison.map((m) => {
        const eigeneSpieltage = spieltageVon(m);
        const ergebnisse = eigeneSpieltage.map(ergebnisVon);
        const bilanz = saisonBilanz(ergebnisse);
        const imKader = kader
          .filter((k) => k.mannschaft_id === m.id)
          .sort((a, b) => {
            if (a.stammspieler !== b.stammspieler) return a.stammspieler ? -1 : 1;
            return anzeige(a.person_id).localeCompare(anzeige(b.person_id), 'de');
          });
        const hinweisStamm = stammspielerHinweis(imKader.filter((k) => k.stammspieler).length);
        // Wer gespielt hat, ohne im Kader zu stehen
        const aushilfen = einsatzliste.filter(
          (e) => e.mannschaft_id === m.id && !imKader.some((k) => k.person_id === e.person_id)
        );
        const frei = mitglieder.filter((p) => !imKader.some((k) => k.person_id === p.id));

        return (
          <section className="block" key={m.id}>
            <div className="bearbeitenkopf">
              <div>
                <h3>
                  {m.name}
                  {!m.aktiv && <span className="marke"> nicht gemeldet</span>}
                </h3>
                <p className="hinweis">
                  {ligaAls(m.liga) ?? 'ohne Liga'}
                  {m.staffel ? ` · Staffel ${m.staffel}` : ''} · Nummer {m.rang} im Mannschaftspass
                  {m.notiz ? ` · ${m.notiz}` : ''}
                </p>
              </div>
              {darfVerwalten && (
                <div className="knopfpaar">
                  <button
                    type="button"
                    title="Name, Liga, Staffel und Nummer im Mannschaftspass ändern"
                    onClick={() =>
                      setFormular({
                        id: m.id,
                        name: m.name,
                        saison: m.saison,
                        liga: m.liga ?? '',
                        staffel: m.staffel ?? '',
                        rang: String(m.rang),
                        aktiv: m.aktiv,
                        notiz: m.notiz ?? ''
                      })
                    }
                  >
                    Ändern
                  </button>
                  <button type="button" title="Löscht die Mannschaft mit ihrem Kader. Ihre Spieltage bleiben erhalten." className="gefahrknopf" onClick={() => void mannschaftLoeschen(m)}>
                    Löschen
                  </button>
                </div>
              )}
            </div>

            <div className="kennzahlen">
              <div>
                <span>Begegnungen</span>
                <strong>{bilanz.gewertet}</strong>
                <small>
                  {bilanz.begegnungen > bilanz.gewertet
                    ? `${bilanz.begegnungen - bilanz.gewertet} noch offen`
                    : 'alle gewertet'}
                </small>
              </div>
              <div>
                <span>Matchpunkte</span>
                <strong>
                  {bilanz.matchpunkte[0]} : {bilanz.matchpunkte[1]}
                </strong>
                <small>
                  {bilanz.siege} Siege, {bilanz.unentschieden} Unentschieden, {bilanz.niederlagen} Niederlagen
                </small>
              </div>
              <div>
                <span>Partiepunkte</span>
                <strong>
                  {bilanz.partiepunkte[0]} : {bilanz.partiepunkte[1]}
                </strong>
                <small>über alle Begegnungen</small>
              </div>
            </div>

            <h4>Kader</h4>
            {hinweisStamm && <p className="hinweis">{hinweisStamm}</p>}
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Stammspieler</th>
                  <th>Kapitän</th>
                  <th>Berechtigt</th>
                  <th>Einsätze</th>
                  <th>Partien</th>
                  {darfVerwalten && <th></th>}
                </tr>
              </thead>
              <tbody>
                {imKader.map((k) => {
                  const einsatz = einsatzVon(k.person_id, m.id);
                  return (
                    <tr key={k.id}>
                      <td>{anzeige(k.person_id)}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={k.stammspieler}
                          disabled={!darfVerwalten}
                          onChange={(e) => void hakenSetzen(k, 'stammspieler', e.target.checked)}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={k.kapitaen}
                          disabled={!darfVerwalten}
                          onChange={(e) => void hakenSetzen(k, 'kapitaen', e.target.checked)}
                        />
                      </td>
                      <td>
                        {darfVerwalten ? (
                          <input
                            type="date"
                            value={k.berechtigt_ab ?? ''}
                            onChange={(e) => void berechtigtSetzen(k, e.target.value)}
                          />
                        ) : (
                          k.berechtigt_ab && DATUM(k.berechtigt_ab)
                        )}
                      </td>
                      <td>{einsatz?.begegnungen ?? 0}</td>
                      <td>{einsatz?.partien ?? 0}</td>
                      {darfVerwalten && (
                        <td>
                          <button type="button" title="Nimmt den Spieler aus dem Kader dieser Mannschaft." className="gefahrknopf" onClick={() => void spielerEntfernen(k)}>
                            Entfernen
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {aushilfen.map((e) => (
                  <tr key={`aus-${e.person_id}`}>
                    <td>
                      {anzeige(e.person_id)} <span className="hinweis">Aushilfe, nicht im Kader</span>
                    </td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>{e.begegnungen}</td>
                    <td>{e.partien}</td>
                    {darfVerwalten && <td></td>}
                  </tr>
                ))}
                {imKader.length === 0 && aushilfen.length === 0 && (
                  <tr>
                    <td colSpan={darfVerwalten ? 7 : 6} className="hinweis">
                      Noch niemand gemeldet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {darfVerwalten && frei.length > 0 && (
              <div className="zeile">
                <select value={zugang[m.id] ?? ''} onChange={(e) => setZugang({ ...zugang, [m.id]: e.target.value })}>
                  <option value="">Spieler wählen</option>
                  {frei.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personName(p)}
                    </option>
                  ))}
                </select>
                <button type="button" title="Nimmt den gewählten Spieler in den Kader dieser Mannschaft auf." onClick={() => void spielerAufnehmen(m)}>
                  In den Kader
                </button>
              </div>
            )}

            <h4>Saison {m.saison}</h4>
            {eigeneSpieltage.length === 0 ? (
              <p className="hinweis">Noch kein Spieltag dieser Mannschaft zugeordnet.</p>
            ) : (
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Spieltag</th>
                    <th>Gegner</th>
                    <th>Ort</th>
                    <th>Partiepunkte</th>
                    <th>Matchpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {eigeneSpieltage.map((t, i) => {
                    const liga = (t.einstellungen as TurnierEinstellungen)?.liga;
                    const e = ergebnisse[i];
                    return (
                      <tr key={t.id}>
                        <td>{DATUM(t.datum)}</td>
                        <td>
                          {liga?.spieltag}. Spieltag{liga?.begegnung === 2 ? ', 2. Begegnung' : ''}
                        </td>
                        <td>{liga?.gegner}</td>
                        <td>{liga?.heim ? 'zu Hause' : 'auswärts'}</td>
                        <td>
                          {e.partiepunkte[0]} : {e.partiepunkte[1]}
                        </td>
                        <td>{e.entschieden ? `${e.matchpunkte[0]} : ${e.matchpunkte[1]}` : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {rueckfrage}
    </div>
  );
}
