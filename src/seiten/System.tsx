import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { LIGEN } from '../liga';
import type { LigaKennung } from '../liga';
import { saisonAus } from '../mannschaften';
import { vereinsEinstellungen, vereinsKuerzel } from '../vereinseinstellungen';
import type { VereinsEinstellungen } from '../vereinseinstellungen';
import type { Disziplin, Mannschaft, TurnierModus } from '../datenbank.types';

// Seite "System": Einstellungen des Vereins, nur fuer den Vereins-Administrator.
// Verein (Name, Kuerzel, Logo), Vorgaben fuer neue Turniere und Liga-Spieltage,
// Saisonbeginn, Schutzwort. Die Rating-Rechenwerte stehen nur zur Ansicht da,
// weil eine Aenderung alle Ratings verschieben wuerde.

const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

type RatingWerte = {
  vereinsschnitt: number;
  zeitraum_monate: number;
  mindest_racks: number;
  rueckgriff_monate: number;
  gewicht: number;
  staerke_prozent: number;
};

// Formularstand: Zahlen als Text, damit man sie frei tippen kann
type Formular = {
  name: string;
  kurzname: string;
  logo: string | null;
  raceTo: string;
  disziplin: Disziplin;
  modus: TurnierModus;
  vorgabe: boolean;
  staerke: string; // leer: Wert aus den Rating-Einstellungen
  obergrenze: string;
  ratingWerten: boolean;
  liga: LigaKennung;
  mannschaftRang: string; // leer: erste der Saison
  saisonbeginn: number;
};

// Bild auf 128 x 128 Pixel verkleinern (Seitenverhaeltnis bleibt, Rand durchsichtig)
function logoVerkleinern(datei: File): Promise<string> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onerror = () => fehler(new Error('Die Datei ließ sich nicht lesen.'));
    leser.onload = () => {
      const bild = new Image();
      bild.onerror = () => fehler(new Error('Das ist kein Bild, das der Browser anzeigen kann.'));
      bild.onload = () => {
        const seite = 128;
        const leinwand = document.createElement('canvas');
        leinwand.width = seite;
        leinwand.height = seite;
        const stift = leinwand.getContext('2d');
        if (!stift) return fehler(new Error('Das Bild ließ sich nicht verkleinern.'));
        const faktor = Math.min(seite / bild.width, seite / bild.height);
        const b = bild.width * faktor;
        const h = bild.height * faktor;
        stift.drawImage(bild, (seite - b) / 2, (seite - h) / 2, b, h);
        fertig(leinwand.toDataURL('image/png'));
      };
      bild.src = String(leser.result);
    };
    leser.readAsDataURL(datei);
  });
}

function ausEinstellungen(name: string, kurzname: string, logo: string | null, e: VereinsEinstellungen): Formular {
  return {
    name,
    kurzname,
    logo,
    raceTo: String(e.turnier.raceTo),
    disziplin: e.turnier.disziplin,
    modus: e.turnier.modus,
    vorgabe: e.turnier.vorgabe,
    staerke: e.turnier.staerke === null ? '' : String(e.turnier.staerke),
    obergrenze: String(e.turnier.obergrenze),
    ratingWerten: e.turnier.ratingWerten,
    liga: e.liga.liga,
    mannschaftRang: e.liga.mannschaftRang === null ? '' : String(e.liga.mannschaftRang),
    saisonbeginn: e.saisonbeginn
  };
}

export default function System() {
  const { verein, darf, vereinNeuLaden } = useSitzung();
  const istAdmin = darf('vereinsadmin');

  const [formular, setFormular] = useState<Formular | null>(null);
  const [rating, setRating] = useState<RatingWerte | null>(null);
  const [mannschaften, setMannschaften] = useState<Mannschaft[]>([]);
  const [wort, setWort] = useState('');
  const [wortWieder, setWortWieder] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const dateiFeld = useRef<HTMLInputElement>(null);

  const zuruecksetzen = useCallback(() => {
    if (!verein) return;
    setFormular(ausEinstellungen(verein.name, verein.kurzname, verein.logo_url, vereinsEinstellungen(verein.einstellungen)));
  }, [verein]);

  useEffect(() => {
    zuruecksetzen();
  }, [zuruecksetzen]);

  useEffect(() => {
    if (!verein) return;
    void (async () => {
      const [r, m] = await Promise.all([
        supabase.from('rating_einstellungen').select('*').eq('verein_id', verein.id).maybeSingle(),
        supabase.from('mannschaften').select('*').eq('verein_id', verein.id).order('rang')
      ]);
      setRating((r.data as RatingWerte | null) ?? null);
      setMannschaften(m.data ?? []);
    })();
  }, [verein]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;
  if (!istAdmin) return <p className="hinweis">Diese Seite ist dem Vereins-Administrator vorbehalten.</p>;
  if (!formular) return <p className="hinweis">Lädt.</p>;

  const f = formular;
  const setze = (teil: Partial<Formular>) => {
    setFormular({ ...f, ...teil });
    setMeldung(null);
  };

  // Mannschaften der laufenden Saison fuer die Auswahl "Standard-Mannschaft"
  const saison = saisonAus(new Date().toISOString().slice(0, 10), f.saisonbeginn);
  const mannschaftenJetzt = mannschaften.filter((m) => m.saison === saison);

  async function logoWaehlen(datei: File | undefined) {
    if (!datei) return;
    try {
      setze({ logo: await logoVerkleinern(datei) });
      setFehler(null);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function speichern() {
    if (!verein) return;
    const zahl = (text: string) => (text.trim() === '' ? null : Number(text));
    const race = zahl(f.raceTo);
    const staerke = zahl(f.staerke);
    const grenze = zahl(f.obergrenze) ?? 0;
    if (!f.name.trim()) return setFehler('Der Verein braucht einen Namen.');
    if (race === null || !Number.isInteger(race) || race < 1 || race > 25) return setFehler('Race to zwischen 1 und 25.');
    if (staerke !== null && (!Number.isInteger(staerke) || staerke < 0 || staerke > 100)) {
      return setFehler('Ausgleich in Prozent zwischen 0 und 100, oder leer lassen.');
    }
    if (!Number.isInteger(grenze) || grenze < 0 || grenze > 24) return setFehler('Höchstens Sätze Vorgabe zwischen 0 und 24.');

    const einstellungen: VereinsEinstellungen = {
      turnier: {
        raceTo: race,
        disziplin: f.disziplin,
        modus: f.modus,
        vorgabe: f.vorgabe,
        staerke,
        obergrenze: grenze,
        ratingWerten: f.ratingWerten
      },
      liga: { liga: f.liga, mannschaftRang: zahl(f.mannschaftRang) },
      saisonbeginn: f.saisonbeginn
    };
    setArbeitet(true);
    const { error } = await supabase
      .from('vereine')
      .update({
        name: f.name.trim(),
        kurzname: f.kurzname.trim() || vereinsKuerzel('', f.name),
        logo_url: f.logo,
        einstellungen
      })
      .eq('id', verein.id);
    setArbeitet(false);
    if (error) return setFehler(error.message);
    setFehler(null);
    setMeldung('Gespeichert.');
    await vereinNeuLaden();
  }

  async function schutzwortAendern() {
    if (!verein) return;
    if (wort.trim().length < 3) return setFehler('Das Schutzwort braucht mindestens drei Zeichen.');
    if (wort.trim() !== wortWieder.trim()) return setFehler('Die beiden Eingaben stimmen nicht überein.');
    const { error } = await supabase.rpc('schutzwort_setzen', { p_verein: verein.id, p_wort: wort.trim() });
    if (error) return setFehler(error.message);
    setWort('');
    setWortWieder('');
    setFehler(null);
    setMeldung('Schutzwort geändert. Es gilt ab sofort für „Tablet neu laden“ und „Aufstellung zeigen“.');
  }

  return (
    <div className="einspaltig">
      <section className="block">
        <h2>System</h2>
        <p className="hinweis">Einstellungen für den ganzen Verein. Ändern darf sie nur der Vereins-Administrator.</p>
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      <section className="block">
        <h2>Verein</h2>
        <div className="felder">
          <label className="feld">
            <span>Name</span>
            <input value={f.name} onChange={(e) => setze({ name: e.target.value })} />
          </label>
          <label className="feld">
            <span>Kurzname (die ersten zwei Buchstaben stehen im Kästchen, wenn es kein Logo gibt)</span>
            <input value={f.kurzname} onChange={(e) => setze({ kurzname: e.target.value })} />
          </label>
        </div>
        <div className="logozeile">
          <span className="zeichen gross">
            {f.logo ? <img src={f.logo} alt="Vereinslogo" /> : vereinsKuerzel(f.kurzname, f.name)}
          </span>
          <button type="button" title="Ein Bild wählen. Es wird auf 128 × 128 Pixel verkleinert." onClick={() => dateiFeld.current?.click()}>
            Bild wählen
          </button>
          <input
            ref={dateiFeld}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void logoWaehlen(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {f.logo && (
            <button type="button" title="Das Logo entfernen; dann steht wieder das Kürzel im Kästchen." onClick={() => setze({ logo: null })}>
              Entfernen
            </button>
          )}
        </div>
      </section>

      <section className="block">
        <h2>Vorgaben für „Neues Turnier“</h2>
        <p className="hinweis">Mit diesen Werten öffnet sich das Formular. Im Formular lassen sie sich für jedes Turnier ändern.</p>
        <div className="felder">
          <label className="feld">
            <span>Race to</span>
            <input inputMode="numeric" value={f.raceTo} onChange={(e) => setze({ raceTo: e.target.value })} />
          </label>
          <label className="feld">
            <span>Disziplin</span>
            <select value={f.disziplin} onChange={(e) => setze({ disziplin: e.target.value as Disziplin })}>
              <option value="8-ball">8-Ball</option>
              <option value="9-ball">9-Ball</option>
              <option value="10-ball">10-Ball</option>
            </select>
          </label>
          <label className="feld">
            <span>Modus</span>
            <select value={f.modus} onChange={(e) => setze({ modus: e.target.value as TurnierModus })}>
              <option value="einzelgruppe">Einzelgruppe (jeder gegen jeden)</option>
              <option value="zwei-gruppen">Zwei Gruppen mit Platzierungsduellen</option>
              <option value="gruppen-ko">Gruppen mit KO-Runde</option>
              <option value="liga">Liga-Spieltag (Begegnung)</option>
            </select>
          </label>
          <label className="feld">
            <span>Ausgleich in Prozent (leer: {rating?.staerke_prozent ?? 75} aus dem Rating)</span>
            <input inputMode="numeric" value={f.staerke} onChange={(e) => setze({ staerke: e.target.value })} />
          </label>
          <label className="feld">
            <span>Höchstens Sätze Vorgabe (0 = ohne Grenze)</span>
            <input inputMode="numeric" value={f.obergrenze} onChange={(e) => setze({ obergrenze: e.target.value })} />
          </label>
        </div>
        <label className="ankreuz">
          <input type="checkbox" checked={f.vorgabe} onChange={(e) => setze({ vorgabe: e.target.checked })} />
          <span>Mit Vorgabe (Handicap)</span>
        </label>
        <label className="ankreuz">
          <input type="checkbox" checked={f.ratingWerten} onChange={(e) => setze({ ratingWerten: e.target.checked })} />
          <span>Zählt für das Vereins-Rating</span>
        </label>
      </section>

      <section className="block">
        <h2>Vorgaben für Liga-Spieltage</h2>
        <div className="felder">
          <label className="feld">
            <span>Liga</span>
            <select value={f.liga} onChange={(e) => setze({ liga: e.target.value as LigaKennung })}>
              {(Object.keys(LIGEN) as LigaKennung[]).map((k) => (
                <option key={k} value={k}>
                  {LIGEN[k].name}
                </option>
              ))}
            </select>
          </label>
          <label className="feld">
            <span>Eigene Mannschaft</span>
            <select value={f.mannschaftRang} onChange={(e) => setze({ mannschaftRang: e.target.value })}>
              <option value="">die erste der Saison</option>
              {[1, 2, 3, 4, 5].map((rang) => {
                const m = mannschaftenJetzt.find((x) => x.rang === rang);
                return (
                  <option key={rang} value={String(rang)}>
                    Nummer {rang} im Mannschaftspass{m ? ` (jetzt: ${m.name})` : ''}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="feld">
            <span>Saisonbeginn</span>
            <select value={f.saisonbeginn} onChange={(e) => setze({ saisonbeginn: Number(e.target.value) })}>
              {MONATE.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hinweis">
          Die Mannschaft wird über ihre Nummer im Mannschaftspass gewählt, damit die Vorgabe auch in der nächsten Saison
          stimmt. Hat die Mannschaft eine Liga eingetragen, gilt deren Liga.
        </p>
      </section>

      <div className="knopfpaar rechts">
        <button type="button" title="Die Eingaben dieser Seite verwerfen." onClick={() => { zuruecksetzen(); setFehler(null); setMeldung(null); }}>
          Verwerfen
        </button>
        <button type="button" title="Verein, Vorgaben und Saisonbeginn speichern." onClick={() => void speichern()} disabled={arbeitet}>
          Speichern
        </button>
      </div>

      <section className="block">
        <h2>Schutzwort</h2>
        <p className="hinweis">
          Gilt für „Tablet neu laden“ in der Live-Übersicht und „Aufstellung zeigen“ beim Liga-Spieltag. Das aktuelle Wort
          wird nirgends angezeigt; ohne eigenes Wort gilt „8-Ball“.
        </p>
        <div className="felder">
          <label className="feld">
            <span>Neues Schutzwort</span>
            <input type="password" autoComplete="new-password" value={wort} onChange={(e) => setWort(e.target.value)} />
          </label>
          <label className="feld">
            <span>Noch einmal</span>
            <input type="password" autoComplete="new-password" value={wortWieder} onChange={(e) => setWortWieder(e.target.value)} />
          </label>
        </div>
        <div className="knopfpaar">
          <button type="button" title="Das neue Schutzwort speichern. Es gilt sofort." onClick={() => void schutzwortAendern()}>
            Schutzwort ändern
          </button>
        </div>
      </section>

      <section className="block">
        <h2>Rating-Rechenwerte</h2>
        <p className="hinweis">
          Nur zur Ansicht. Eine Änderung würde alle Ratings verschieben, und die Rating-Erklärung stimmte nicht mehr.
        </p>
        {rating ? (
          <table className="tabelle">
            <tbody>
              <tr><td>Vereinsschnitt</td><td className="rechts">{rating.vereinsschnitt}</td></tr>
              <tr><td>Zeitraum</td><td className="rechts">{rating.zeitraum_monate} Monate</td></tr>
              <tr><td>Mindest-Racks für „eigene Daten“</td><td className="rechts">{rating.mindest_racks}</td></tr>
              <tr><td>Rückgriff höchstens</td><td className="rechts">{rating.rueckgriff_monate} Monate</td></tr>
              <tr><td>Gewicht (gedachte Racks)</td><td className="rechts">{rating.gewicht}</td></tr>
              <tr><td>Ausgleich der Vorgabe</td><td className="rechts">{rating.staerke_prozent} %</td></tr>
            </tbody>
          </table>
        ) : (
          <p className="hinweis">Es sind noch keine Rating-Einstellungen gespeichert; es gelten die Standardwerte (500, 12, 100, 36, 30, 75 %).</p>
        )}
      </section>
    </div>
  );
}
