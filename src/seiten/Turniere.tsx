import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import LigaAnsicht from './LigaAnsicht';
import TurnierAnsicht from './TurnierAnsicht';
import { LIGEN } from '../liga';
import type { Ausspielziele, LigaKennung } from '../liga';
import { saisonAus } from '../mannschaften';
import { vereinsEinstellungen } from '../vereinseinstellungen';
import { kurzesRaceHinweis } from '../vorgabe';
import type { Disziplin, Mannschaft, Serie, Turnier, TurnierModus, TurnierStatus } from '../datenbank.types';

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
  liga: 'Liga-Spieltag',
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
  raceTo?: number; // Einzelgruppe und Gruppenphase
  racePhase2?: number; // Zwei Gruppen: Platzierungsduelle
  phase2?: { A: string[]; B: string[] }; // Zwei Gruppen: beim Start von Phase 2 fixierte Gruppenreihenfolge
  tausch?: { raus: string; rein: string; von: string; nach: string; zeit: string }[]; // Gruppentausch von Hand
  // Gruppen mit KO
  gruppenzahl?: number; // 2 oder 4, fest ab der Auslosung
  weiter?: number; // Spieler je Gruppe in der KO-Runde
  paarung?: number; // 1 Standard, 2 ueber Kreuz (nur zwei Gruppen, KO-Feld 8)
  raceKo?: { R16?: number; QF?: number; SF?: number; FIN?: number }; // Halbfinale gilt auch fuer Platz 3
  racePhase3?: number;
  ko?: { seeds: string[]; option: number; gruppenzahl: number; weiter: number; reihung: Record<string, string[]> };
  phase3?: { reihung: string[]; abPlatz: number };
  nachgetragen?: { person: string; gruppe: string | null; zeit: string }[]; // Nachzuegler fuer den Bericht
  // Liga-Spieltag (Begegnung)
  liga?: {
    liga: LigaKennung;
    spieltag: number;
    heim: boolean; // Heimrecht der eigenen Mannschaft im ersten Spiel
    gegner: string; // Name der gegnerischen Mannschaft
    eigene: string; // Name der eigenen Mannschaft
    mannschaft_id?: string | null; // gemeldete Mannschaft, fuer Kader und Saisonuebersicht
    ziele: Ausspielziele;
    // Ein Spieltag besteht aus zwei Begegnungen am selben Tag; in der zweiten
    // wechselt das Heimrecht (BLVN, 2er-Spieltage).
    begegnung: 1 | 2;
    // Verdeckte Aufstellung: je Runde und Mannschaft, bis der Kapitaen sie freigibt
    verdeckt?: { hin?: { heim?: boolean; gast?: boolean }; rueck?: { heim?: boolean; gast?: boolean } };
    partner?: string; // die jeweils andere Begegnung des Spieltags
    // Halbe Aufstellung: Spiele, in denen erst eine Seite feststeht (Schluessel
    // ist die Spielnummer). Mit beiden Spielern wird daraus eine Partie.
    aufstellung?: Record<string, { heim?: string | null; gast?: string | null }>;
    quelle?: string; // URL des eingelesenen Spielberichts
  };
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
  const [modus, setModus] = useState<TurnierModus>('einzelgruppe');
  const [raceTo, setRaceTo] = useState('5');
  const [racePhase2, setRacePhase2] = useState('5');
  const [raceKo, setRaceKo] = useState({ R16: '5', QF: '5', SF: '5', FIN: '5', P3: '5' });
  const [liga, setLiga] = useState<LigaKennung>('kreisliga');
  const [spieltag, setSpieltag] = useState('1');
  const [heim, setHeim] = useState(true);
  const [gegner, setGegner] = useState('');
  const [eigeneMannschaft, setEigeneMannschaft] = useState('');
  const [mannschaften, setMannschaften] = useState<Mannschaft[]>([]);
  const [mannschaftId, setMannschaftId] = useState('');
  // Spaß-Liga: eigene Ausspielziele
  const [ziele, setZiele] = useState({ punkte141: '50', aufnahmen141: '20', '8-ball': '4', '9-ball': '5', '10-ball': '4' });
  const [serieId, setSerieId] = useState('');
  const [vorgabeAn, setVorgabeAn] = useState(true);
  const [staerke, setStaerke] = useState('75');
  const [obergrenze, setObergrenze] = useState('0');
  const [ratingWerten, setRatingWerten] = useState(true);
  // Ausgleich in Prozent aus den Rating-Einstellungen, falls der Verein keinen eigenen vorgibt
  const [ratingStaerke, setRatingStaerke] = useState(75);
  const vorgaben = vereinsEinstellungen(verein?.einstellungen);

  const laden = useCallback(async () => {
    if (!verein) return;
    const [turnierAntwort, serienAntwort, einstellungAntwort, mannschaftAntwort] = await Promise.all([
      supabase.from('turniere').select('*').eq('verein_id', verein.id).order('datum', { ascending: false }),
      supabase.from('serien').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('name'),
      supabase.from('rating_einstellungen').select('staerke_prozent').eq('verein_id', verein.id).maybeSingle(),
      supabase.from('mannschaften').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('rang')
    ]);
    if (turnierAntwort.error) setFehler(turnierAntwort.error.message);
    setTurniere(turnierAntwort.data ?? []);
    setSerien(serienAntwort.data ?? []);
    setMannschaften(mannschaftAntwort.data ?? []);
    if (einstellungAntwort.data) setRatingStaerke(einstellungAntwort.data.staerke_prozent);
  }, [verein]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Gemeldete Mannschaften der Saison, in die das Datum faellt
  const mannschaftenDerSaison = mannschaften.filter((m) => m.saison === saisonAus(datum, vorgaben.saisonbeginn));
  const gewaehlteMannschaft = mannschaftenDerSaison.find((m) => m.id === mannschaftId) ?? null;

  // Die Mannschaft bringt ihre Liga mit; frei eingetragene Namen nicht.
  function mannschaftWaehlen(id: string) {
    setMannschaftId(id);
    const m = mannschaftenDerSaison.find((x) => x.id === id);
    if (m?.liga && m.liga in LIGEN) setLiga(m.liga as LigaKennung);
  }

  // Kurze Races stufen die Vorgabe grob ab; beim Anlegen darauf hinweisen
  const hinweisKurzesRace = kurzesRaceHinweis([
    Number(raceTo),
    ...(modus === 'zwei-gruppen' ? [Number(racePhase2)] : []),
    ...(modus === 'gruppen-ko' ? Object.values(raceKo).map(Number) : [])
  ]);

  async function anlegen() {
    if (!verein) return;
    setFehler(null);
    const race = Number(raceTo);
    if (!name.trim()) return setFehler('Bitte einen Namen eingeben.');
    const race2 = Number(racePhase2);
    if (!Number.isInteger(race) || race < 1 || race > 25) return setFehler('Race to zwischen 1 und 25.');
    if (modus === 'zwei-gruppen' && (!Number.isInteger(race2) || race2 < 1 || race2 > 25)) {
      return setFehler('Race to für die Platzierungsduelle zwischen 1 und 25.');
    }
    const ko = Object.fromEntries(Object.entries(raceKo).map(([k, v]) => [k, Number(v)]));
    if (modus === 'gruppen-ko' && Object.values(ko).some((x) => !Number.isInteger(x) || x < 1 || x > 25)) {
      return setFehler('Race to je Runde zwischen 1 und 25.');
    }
    if (modus === 'liga' && !gegner.trim()) return setFehler('Bitte die gegnerische Mannschaft eintragen.');
    const eigeneZiele: Ausspielziele = {
      punkte141: Number(ziele.punkte141),
      aufnahmen141: Number(ziele.aufnahmen141),
      '8-ball': Number(ziele['8-ball']),
      '9-ball': Number(ziele['9-ball']),
      '10-ball': Number(ziele['10-ball'])
    };
    if (
      modus === 'liga' &&
      liga === 'spass' &&
      Object.values(eigeneZiele).some((x) => !Number.isInteger(x) || x < 1 || x > 200)
    ) {
      return setFehler('Ausspielziele: ganze Zahlen zwischen 1 und 200.');
    }
    const einstellungen: TurnierEinstellungen = {
      raceTo: race,
      ...(modus === 'liga'
        ? {
            liga: {
              liga,
              spieltag: Math.max(1, Number(spieltag) || 1),
              heim,
              gegner: gegner.trim(),
              eigene: gewaehlteMannschaft?.name ?? (eigeneMannschaft.trim() || verein.name),
              mannschaft_id: mannschaftId || null,
              ziele: liga === 'spass' ? eigeneZiele : LIGEN[liga].ziele,
              begegnung: 1 as const
            }
          }
        : {}),
      ...(modus === 'zwei-gruppen' ? { racePhase2: race2 } : {}),
      ...(modus === 'gruppen-ko'
        ? { raceKo: { R16: ko.R16, QF: ko.QF, SF: ko.SF, FIN: ko.FIN }, racePhase3: ko.P3 }
        : {}),
      vorgabe: {
        // In der Liga wird ohne Vorgabe gespielt (Ausschreibung, Abschnitt Modus)
        aktiv: modus === 'liga' ? false : vorgabeAn,
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
        disziplin: modus === 'liga' ? 'multi-ball' : disziplin,
        modus,
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

  const offenesTurnier = turniere.find((t) => t.id === offen);
  if (offen && offenesTurnier?.modus === 'liga') {
    return (
      <LigaAnsicht
        turnierId={offen}
        oeffnen={(id) => {
          setOffen(id);
          void laden();
        }}
        zurueck={() => {
          setOffen(null);
          void laden();
        }}
      />
    );
  }

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
            <button
              type="button"
              title="Ein neues Turnier oder einen Liga-Spieltag anlegen"
              onClick={() => {
                // Vorgaben aus der Seite "System"
                const t = vorgaben.turnier;
                const race = String(t.raceTo);
                setDisziplin(t.disziplin);
                setModus(t.modus);
                setRaceTo(race);
                setRacePhase2(race);
                setRaceKo({ R16: race, QF: race, SF: race, FIN: race, P3: race });
                setVorgabeAn(t.vorgabe);
                setStaerke(String(t.staerke ?? ratingStaerke));
                setObergrenze(String(t.obergrenze));
                setRatingWerten(t.ratingWerten);
                setLiga(vorgaben.liga.liga);
                // Standard-Mannschaft nach Nummer im Mannschaftspass, sonst die erste der Saison
                const rang = vorgaben.liga.mannschaftRang;
                const standard = mannschaftenDerSaison.find((m) => m.rang === rang) ?? mannschaftenDerSaison[0];
                setMannschaftId(standard?.id ?? '');
                // Wie beim Waehlen: Die Mannschaft bringt ihre Liga mit
                if (standard?.liga && standard.liga in LIGEN) setLiga(standard.liga as LigaKennung);
                setFormular(true);
              }}
            >
              Neues Turnier
            </button>
          )}
        </div>

        {formular && (
          <div className="kasten">
            <div className="feldkopf">Neues Turnier</div>
            <div className="felder">
              <label className="feld">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="3. Serienturnier 9-Ball" />
              </label>
              <label className="feld">
                <span>Datum</span>
                <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </label>
              {modus !== 'liga' && (
              <label className="feld">
                <span>Disziplin</span>
                <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as Disziplin)}>
                  <option value="8-ball">8-Ball</option>
                  <option value="9-ball">9-Ball</option>
                  <option value="10-ball">10-Ball</option>
                </select>
              </label>
              )}
              <label className="feld">
                <span>Modus</span>
                <select value={modus} onChange={(e) => setModus(e.target.value as TurnierModus)}>
                  <option value="einzelgruppe">Einzelgruppe (jeder gegen jeden)</option>
                  <option value="zwei-gruppen">Zwei Gruppen mit Platzierungsduellen</option>
                  <option value="gruppen-ko">Gruppen mit KO-Runde</option>
                  <option value="liga">Liga-Spieltag (Begegnung)</option>
                </select>
              </label>
              {modus === 'liga' && (
                <>
                  <label className="feld">
                    <span>Liga</span>
                    <select value={liga} onChange={(e) => setLiga(e.target.value as LigaKennung)}>
                      {(Object.keys(LIGEN) as LigaKennung[]).map((k) => (
                        <option key={k} value={k}>
                          {LIGEN[k].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="feld">
                    <span>Spieltag</span>
                    <input inputMode="numeric" value={spieltag} onChange={(e) => setSpieltag(e.target.value)} />
                  </label>
                  {liga === 'spass' &&
                    (
                      [
                        ['punkte141', '14.1: Punkte'],
                        ['aufnahmen141', '14.1: höchstens Aufnahmen'],
                        ['8-ball', '8-Ball: Gewinnsätze'],
                        ['9-ball', '9-Ball: Gewinnsätze'],
                        ['10-ball', '10-Ball: Gewinnsätze']
                      ] as const
                    ).map(([k, text]) => (
                      <label key={k} className="feld">
                        <span>{text}</span>
                        <input inputMode="numeric" value={ziele[k]} onChange={(e) => setZiele({ ...ziele, [k]: e.target.value })} />
                      </label>
                    ))}
                  <label className="feld">
                    <span>Heimrecht</span>
                    <select value={heim ? 'heim' : 'gast'} onChange={(e) => setHeim(e.target.value === 'heim')}>
                      <option value="heim">Heimspiel</option>
                      <option value="gast">Auswärtsspiel</option>
                    </select>
                  </label>
                  <label className="feld">
                    <span>Eigene Mannschaft</span>
                    {mannschaftenDerSaison.length > 0 ? (
                      <select value={mannschaftId} onChange={(e) => mannschaftWaehlen(e.target.value)}>
                        {mannschaftenDerSaison.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.staffel ? ` (${m.staffel})` : ''}
                          </option>
                        ))}
                        <option value="">andere, von Hand eintragen</option>
                      </select>
                    ) : (
                      <input value={eigeneMannschaft} onChange={(e) => setEigeneMannschaft(e.target.value)} placeholder={verein.name} />
                    )}
                  </label>
                  {mannschaftenDerSaison.length > 0 && !mannschaftId && (
                    <label className="feld">
                      <span>Name der Mannschaft</span>
                      <input value={eigeneMannschaft} onChange={(e) => setEigeneMannschaft(e.target.value)} placeholder={verein.name} />
                    </label>
                  )}
                  <label className="feld">
                    <span>Gegner</span>
                    <input value={gegner} onChange={(e) => setGegner(e.target.value)} placeholder="BC Achim 2" />
                  </label>
                </>
              )}
              {modus !== 'liga' && (
              <label className="feld">
                <span>{modus === 'einzelgruppe' ? 'Race to' : 'Race to Gruppenphase'}</span>
                <input inputMode="numeric" value={raceTo} onChange={(e) => setRaceTo(e.target.value)} />
              </label>
              )}
              {modus === 'zwei-gruppen' && (
                <label className="feld">
                  <span>Race to Platzierungsduelle</span>
                  <input inputMode="numeric" value={racePhase2} onChange={(e) => setRacePhase2(e.target.value)} />
                </label>
              )}
              {modus === 'gruppen-ko' &&
                (
                  [
                    ['R16', 'Race to Achtelfinale'],
                    ['QF', 'Race to Viertelfinale'],
                    ['SF', 'Race to Halbfinale und Platz 3'],
                    ['FIN', 'Race to Finale'],
                    ['P3', 'Race to Platzierungsspiele']
                  ] as const
                ).map(([k, text]) => (
                  <label key={k} className="feld">
                    <span>{text}</span>
                    <input inputMode="numeric" value={raceKo[k]} onChange={(e) => setRaceKo({ ...raceKo, [k]: e.target.value })} />
                  </label>
                ))}
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
            {modus !== 'liga' && (
            <label className="ankreuz">
              <input type="checkbox" checked={vorgabeAn} onChange={(e) => setVorgabeAn(e.target.checked)} />
              <span>
                Mit Vorgabe (Handicap)
                <small>Der schwächere Spieler startet mit Sätzen Vorsprung, berechnet aus dem Vereins-Rating.</small>
              </span>
            </label>
            )}
            {vorgabeAn && modus !== 'liga' && (
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
            {vorgabeAn && modus !== 'liga' && hinweisKurzesRace && <p className="hinweis">{hinweisKurzesRace}</p>}
            <label className="ankreuz">
              <input type="checkbox" checked={ratingWerten} onChange={(e) => setRatingWerten(e.target.checked)} />
              <span>
                Zählt für das Vereins-Rating
                <small>
                  {modus === 'liga'
                    ? 'Im Liga-Spieltag zählen auch die Partien gegen die gegnerische Mannschaft; 14.1 zählt nie.'
                    : 'Partien mit Gästen zählen nie.'}
                </small>
              </span>
            </label>
            <div className="knopfpaar">
              <button type="button" title="Legt das Turnier mit diesen Angaben an." onClick={() => void anlegen()}>
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
