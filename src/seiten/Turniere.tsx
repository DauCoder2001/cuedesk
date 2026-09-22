import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import TurnierAnsicht from './TurnierAnsicht';
import type { Disziplin, Serie, Turnier, TurnierModus, TurnierStatus } from '../datenbank.types';

// Turnierliste. Turnierleiter, Sportwart und Vereins-Admin legen Turniere an
// und fuehren sie; Mitglieder sehen alles nur zum Lesen.

export const DISZIPLIN_TEXT: Record<Disziplin, string> = {
  '8-ball': '8-Ball',
  '9-ball': '9-Ball',
  '10-ball': '10-Ball',
  'multi-ball': 'Multi-Ball',
  '14-1': '14.1'
};

export const MODUS_TEXT: Record<TurnierModus, string> = {
  einzelgruppe: 'Einzelgruppe',
  'zwei-gruppen': 'Zwei Gruppen',
  'gruppen-ko': 'Gruppen mit KO',
  einzelspiel: 'Einzelspiel',
  sonstiges: 'Sonstiges'
};

export const STATUS_TEXT: Record<TurnierStatus, string> = {
  geplant: 'in Vorbereitung',
  laeuft: 'läuft',
  beendet: 'beendet',
  abgebrochen: 'abgebrochen'
};

// Was ein Turnier in turniere.einstellungen mitbringt
export type TurnierEinstellungen = {
  raceTo?: number;
  vorgabe?: { aktiv: boolean; staerke: number; obergrenze: number };
  handReihenfolge?: Record<string, number[]>;
  pausiert?: boolean; // Tablets starten keine neuen Spiele
  tvAnsicht?: 'auslosung' | 'live' | 'results'; // was die Fernseher zeigen
  beginn?: string; // erstes Ergebnis (Zeitprognose)
};

const heute = () => new Date().toISOString().slice(0, 10);

export default function Turniere() {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');

  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [serien, setSerien] = useState<Serie[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [formular, setFormular] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Formularfelder
  const [name, setName] = useState('');
  const [datum, setDatum] = useState(heute());
  const [disziplin, setDisziplin] = useState<Disziplin>('9-ball');
  const [raceTo, setRaceTo] = useState('5');
  const [serieId, setSerieId] = useState('');
  const [vorgabeAn, setVorgabeAn] = useState(true);
  const [staerke, setStaerke] = useState('75');
  const [obergrenze, setObergrenze] = useState('0');
  const [ratingWerten, setRatingWerten] = useState(true);

  const laden = useCallback(async () => {
    if (!verein) return;
    const [turnierAntwort, serienAntwort, einstellungAntwort] = await Promise.all([
      supabase.from('turniere').select('*').eq('verein_id', verein.id).order('datum', { ascending: false }),
      supabase.from('serien').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('name'),
      supabase.from('rating_einstellungen').select('staerke_prozent').eq('verein_id', verein.id).maybeSingle()
    ]);
    if (turnierAntwort.error) setFehler(turnierAntwort.error.message);
    setTurniere(turnierAntwort.data ?? []);
    setSerien(serienAntwort.data ?? []);
    if (einstellungAntwort.data) setStaerke(String(einstellungAntwort.data.staerke_prozent));
  }, [verein]);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function anlegen() {
    if (!verein) return;
    setFehler(null);
    const race = Number(raceTo);
    if (!name.trim()) return setFehler('Bitte einen Namen eingeben.');
    if (!Number.isInteger(race) || race < 1 || race > 25) return setFehler('Race to zwischen 1 und 25.');
    const einstellungen: TurnierEinstellungen = {
      raceTo: race,
      vorgabe: {
        aktiv: vorgabeAn,
        staerke: Math.min(100, Math.max(0, Number(staerke) || 0)),
        obergrenze: Math.max(0, Number(obergrenze) || 0)
      }
    };
    const { data, error } = await supabase
      .from('turniere')
      .insert({
        verein_id: verein.id,
        name: name.trim(),
        datum,
        disziplin,
        modus: 'einzelgruppe',
        serie_id: serieId || null,
        status: 'geplant',
        rating_werten: ratingWerten,
        einstellungen
      })
      .select('id')
      .single();
    if (error || !data) return setFehler(error?.message ?? 'Turnier nicht angelegt.');
    setFormular(false);
    setName('');
    await laden();
    setOffen(data.id);
  }

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  if (offen) {
    return (
      <TurnierAnsicht
        turnierId={offen}
        zurueck={() => {
          setOffen(null);
          void laden();
        }}
      />
    );
  }

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <h2>Turniere</h2>
          {darfLeiten && !formular && (
            <button type="button" onClick={() => setFormular(true)}>
              Neues Turnier
            </button>
          )}
        </div>

        {formular && (
          <div className="kasten">
            <div className="feldkopf">Neues Turnier (Einzelgruppe, jeder gegen jeden)</div>
            <div className="felder">
              <label className="feld">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="3. Serienturnier 9-Ball" />
              </label>
              <label className="feld">
                <span>Datum</span>
                <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </label>
              <label className="feld">
                <span>Disziplin</span>
                <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as Disziplin)}>
                  <option value="8-ball">8-Ball</option>
                  <option value="9-ball">9-Ball</option>
                  <option value="10-ball">10-Ball</option>
                </select>
              </label>
              <label className="feld">
                <span>Race to</span>
                <input inputMode="numeric" value={raceTo} onChange={(e) => setRaceTo(e.target.value)} />
              </label>
              <label className="feld">
                <span>Serie</span>
                <select value={serieId} onChange={(e) => setSerieId(e.target.value)}>
                  <option value="">keine</option>
                  {serien.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.saison ? ` (${s.saison})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ankreuz">
              <input type="checkbox" checked={vorgabeAn} onChange={(e) => setVorgabeAn(e.target.checked)} />
              <span>
                Mit Vorgabe (Handicap)
                <small>Der schwächere Spieler startet mit Sätzen Vorsprung, berechnet aus dem Vereins-Rating.</small>
              </span>
            </label>
            {vorgabeAn && (
              <div className="felder">
                <label className="feld">
                  <span>Ausgleich in Prozent</span>
                  <input inputMode="numeric" value={staerke} onChange={(e) => setStaerke(e.target.value)} />
                </label>
                <label className="feld">
                  <span>Höchstens Sätze Vorgabe (0 = ohne Grenze)</span>
                  <input inputMode="numeric" value={obergrenze} onChange={(e) => setObergrenze(e.target.value)} />
                </label>
              </div>
            )}
            <label className="ankreuz">
              <input type="checkbox" checked={ratingWerten} onChange={(e) => setRatingWerten(e.target.checked)} />
              <span>
                Zählt für das Vereins-Rating
                <small>Partien mit Gästen zählen nie.</small>
              </span>
            </label>
            <div className="knopfpaar">
              <button type="button" onClick={() => void anlegen()}>
                Anlegen
              </button>
              <button type="button" onClick={() => setFormular(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {fehler && <p className="fehler">{fehler}</p>}

        <table className="tabelle">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Datum</th>
              <th>Name</th>
              <th>Disziplin</th>
              <th>Modus</th>
              <th>Stand</th>
            </tr>
          </thead>
          <tbody>
            {turniere.map((t) => (
              <tr key={t.id} className="klickbar" onClick={() => setOffen(t.id)}>
                <td>{new Date(`${t.datum}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                <td>
                  {t.name}
                  {t.quelle === 'import' && <span className="marke">aus Turnier light</span>}
                </td>
                <td>{DISZIPLIN_TEXT[t.disziplin]}</td>
                <td>{MODUS_TEXT[t.modus]}</td>
                <td className={t.status === 'laeuft' ? 'livelaeuft' : ''}>{STATUS_TEXT[t.status]}</td>
              </tr>
            ))}
            {turniere.length === 0 && (
              <tr>
                <td colSpan={5} className="hinweis">
                  Noch kein Turnier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
