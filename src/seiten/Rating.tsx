import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { funktionsFehlerText } from '../funktionsfehler';
import type { Person, RatingQuelle, RatingStand } from '../datenbank.types';

// Vereins-Rating: Liste je Disziplin, dazu die Lupe mit allen Partien, die in
// den Wert eines Spielers eingegangen sind.

const ANSICHTEN: { wert: string; name: string }[] = [
  { wert: 'gesamt', name: 'Gesamt' },
  { wert: '8-ball', name: '8-Ball' },
  { wert: '9-ball', name: '9-Ball' },
  { wert: '10-ball', name: '10-Ball' },
  { wert: 'multi-ball', name: 'Multi-Ball' }
];

const QUELLE_TEXT: Record<RatingQuelle, string> = {
  'eigene-daten': 'eigene Daten',
  vorlaeufig: 'vorläufig',
  'andere-disziplin': 'aus anderer Disziplin',
  startwert: 'Startwert',
  vereinsschnitt: 'Vereinsschnitt',
  'von-hand': 'von Hand gesetzt',
  gast: 'Gast'
};

type Partiezeile = {
  id: string;
  datum: string;
  phase: string | null;
  spieler_a: string;
  spieler_b: string;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
  disziplin: string;
  turniere: { name: string } | null;
};

export default function Rating() {
  const { verein, darf } = useSitzung();
  const darfRechnen = darf('vereinsadmin', 'sportwart', 'turnierleiter');

  const [ansicht, setAnsicht] = useState('gesamt');
  const [stichtag, setStichtag] = useState<string | null>(null);
  const [stand, setStand] = useState<RatingStand[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [partien, setPartien] = useState<Partiezeile[]>([]);
  const [rechnet, setRechnet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!verein) return;
    const { data: neuester } = await supabase
      .from('rating_stand')
      .select('stichtag')
      .eq('verein_id', verein.id)
      .order('stichtag', { ascending: false })
      .limit(1)
      .maybeSingle();

    setStichtag(neuester?.stichtag ?? null);
    if (!neuester?.stichtag) {
      setStand([]);
      return;
    }

    const [standAntwort, personenAntwort] = await Promise.all([
      supabase
        .from('rating_stand')
        .select('*')
        .eq('verein_id', verein.id)
        .eq('stichtag', neuester.stichtag),
      supabase.from('personen').select('*').eq('verein_id', verein.id)
    ]);
    setStand(standAntwort.data ?? []);
    setPersonen(personenAntwort.data ?? []);
  }, [verein]);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function neuRechnen() {
    if (!verein) return;
    setRechnet(true);
    setFehler(null);
    setMeldung(null);
    const { data, error } = await supabase.functions.invoke('rating', {
      body: { verein_id: verein.id }
    });
    setRechnet(false);
    if (error) {
      setFehler(await funktionsFehlerText(error));
      return;
    }
    if (data?.fehler) {
      setFehler(data.fehler);
      return;
    }
    const bericht = data?.vereine?.[0];
    setMeldung(
      bericht
        ? `Neu gerechnet: ${bericht.spieler} Spieler aus ${bericht.partien} Partien.`
        : 'Neu gerechnet.'
    );
    await laden();
  }

  async function lupe(personId: string) {
    if (offen === personId) {
      setOffen(null);
      return;
    }
    setOffen(personId);
    setPartien([]);
    const { data } = await supabase
      .from('partien')
      .select(
        'id, datum, phase, spieler_a, spieler_b, ergebnis_a, ergebnis_b, vorgabe_a, vorgabe_b, disziplin, turniere(name)'
      )
      .or(`spieler_a.eq.${personId},spieler_b.eq.${personId}`)
      .eq('status', 'beendet')
      .order('datum', { ascending: false })
      .limit(200);
    setPartien((data ?? []) as unknown as Partiezeile[]);
  }

  const namen = useMemo(() => {
    const map = new Map<string, string>();
    personen.forEach((person) => map.set(person.id, personName(person)));
    return map;
  }, [personen]);

  const liste = useMemo(
    () =>
      stand
        .filter((zeile) => zeile.disziplin === ansicht)
        .sort((a, b) => b.wert - a.wert || (namen.get(a.person_id) ?? '').localeCompare(namen.get(b.person_id) ?? '')),
    [stand, ansicht, namen]
  );

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <h2>Vereins-Rating</h2>
          {darfRechnen && (
            <button type="button" onClick={() => void neuRechnen()} disabled={rechnet}>
              {rechnet ? 'Rechnet' : 'Jetzt neu berechnen'}
            </button>
          )}
        </div>

        <p className="hinweis">
          {stichtag
            ? `Stand vom ${new Date(stichtag).toLocaleDateString('de-DE')}. Vereinsschnitt 500, 100 Punkte Unterschied bedeuten die doppelte Rack-Gewinnchance.`
            : 'Noch nicht gerechnet.'}
        </p>

        <div className="filterzeile">
          {ANSICHTEN.map((eintrag) => (
            <button
              key={eintrag.wert}
              type="button"
              className={ansicht === eintrag.wert ? 'chip aktiv' : 'chip'}
              onClick={() => setAnsicht(eintrag.wert)}
            >
              {eintrag.name}
            </button>
          ))}
        </div>

        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      <section className="block">
        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Platz</th>
              <th>Name</th>
              <th style={{ width: '80px' }}>Wert</th>
              <th style={{ width: '80px' }}>Racks</th>
              <th style={{ width: '170px' }}>Grundlage</th>
              <th style={{ width: '90px' }}></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((zeile, platz) => (
              <Fragment key={zeile.person_id}>
                <tr>
                  <td>{platz + 1}</td>
                  <td>{namen.get(zeile.person_id) ?? 'unbekannt'}</td>
                  <td>
                    <strong>{zeile.wert}</strong>
                  </td>
                  <td>{zeile.racks}</td>
                  <td>
                    <span className={`marke quelle-${zeile.quelle}`}>{QUELLE_TEXT[zeile.quelle]}</span>
                  </td>
                  <td className="rechts">
                    <button type="button" onClick={() => void lupe(zeile.person_id)}>
                      {offen === zeile.person_id ? 'Zu' : 'Partien'}
                    </button>
                  </td>
                </tr>
                {offen === zeile.person_id && (
                  <tr key={`${zeile.person_id}-partien`}>
                    <td colSpan={6}>
                      <PartienListe
                        partien={partien}
                        personId={zeile.person_id}
                        namen={namen}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {liste.length === 0 && (
              <tr>
                <td colSpan={6} className="hinweis">
                  {stichtag ? 'Keine Werte in dieser Disziplin.' : 'Noch kein Rating gerechnet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PartienListe({
  partien,
  personId,
  namen
}: {
  partien: Partiezeile[];
  personId: string;
  namen: Map<string, string>;
}) {
  if (partien.length === 0) return <p className="hinweis">Keine Partien gefunden.</p>;

  return (
    <table className="tabelle innen">
      <thead>
        <tr>
          <th style={{ width: '90px' }}>Datum</th>
          <th>Turnier</th>
          <th>Gegner</th>
          <th style={{ width: '110px' }}>Ergebnis</th>
          <th style={{ width: '120px' }}>gewertete Racks</th>
        </tr>
      </thead>
      <tbody>
        {partien.map((partie) => {
          const istA = partie.spieler_a === personId;
          const gegner = namen.get(istA ? partie.spieler_b : partie.spieler_a) ?? 'unbekannt';
          const eigen = (istA ? partie.ergebnis_a : partie.ergebnis_b) ?? 0;
          const fremd = (istA ? partie.ergebnis_b : partie.ergebnis_a) ?? 0;
          const eigenVorgabe = istA ? partie.vorgabe_a : partie.vorgabe_b;
          const fremdVorgabe = istA ? partie.vorgabe_b : partie.vorgabe_a;
          return (
            <tr key={partie.id}>
              <td>{new Date(partie.datum).toLocaleDateString('de-DE')}</td>
              <td>
                {partie.turniere?.name ?? 'Einzelspiel'}
                {partie.phase ? <small> · {partie.phase}</small> : null}
              </td>
              <td>{gegner}</td>
              <td>
                {eigen}:{fremd}
                {eigenVorgabe + fremdVorgabe > 0 && (
                  <small>
                    {' '}
                    (Vorgabe {eigenVorgabe}:{fremdVorgabe})
                  </small>
                )}
              </td>
              <td>
                {Math.max(0, eigen - eigenVorgabe)}:{Math.max(0, fremd - fremdVorgabe)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
