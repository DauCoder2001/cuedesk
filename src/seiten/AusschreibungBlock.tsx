import { useState } from 'react';
import { herunterladen } from '../pdf';
import {
  alsEingabe,
  ausEingabe,
  aushangDateiname,
  aushangPdf,
  ausschreibungText,
  meldeschlussVorschlag
} from '../ausschreibung';
import { useUngespeichert, weichtAb } from '../ungespeichert';
import TeilenKnoepfe from './TeilenKnoepfe';
import type { Ausschreibung, AusschreibungDaten } from '../ausschreibung';

// Ausschreibung in der Turnieransicht, solange das Turnier in Vorbereitung ist:
// Angaben pflegen, Text ansehen und teilen, Aushang als PDF.

export default function AusschreibungBlock({
  daten,
  link,
  gespeichert,
  speichern
}: {
  daten: Omit<AusschreibungDaten, 'ausschreibung' | 'link'>;
  link: string; // Anmeldelink zu diesem Turnier
  gespeichert: Ausschreibung;
  speichern: (a: Ausschreibung) => Promise<boolean>;
}) {
  const [entwurf, setEntwurf] = useState<Ausschreibung>(gespeichert);
  const [meldung, setMeldung] = useState<string | null>(null);
  const geaendert = weichtAb(entwurf, gespeichert);

  async function sichern() {
    setMeldung(null);
    const sauber: Ausschreibung = {
      ...entwurf,
      startgeld: entwurf.startgeld?.trim() || undefined,
      hinweis: entwurf.hinweis?.trim() || undefined,
      hoechstens: entwurf.hoechstens && entwurf.hoechstens > 0 ? entwurf.hoechstens : undefined
    };
    if (!(await speichern(sauber))) return false;
    setEntwurf(sauber);
    setMeldung('Ausschreibung gespeichert.');
    return true;
  }
  useUngespeichert('ausschreibung', geaendert, 'Die Ausschreibung', () => sichern());

  // Der Anmeldelink steht nur im Text, solange die Anmeldung offen ist
  const volle: AusschreibungDaten = { ...daten, ausschreibung: entwurf, link: entwurf.offen ? link : undefined };
  const text = ausschreibungText(volle);

  // Neue Uhrzeit: Meldeschluss mitziehen, solange er dem Vorschlag folgt
  function uhrzeitSetzen(uhrzeit: string) {
    const alterVorschlag = entwurf.uhrzeit ? meldeschlussVorschlag(daten.datum, entwurf.uhrzeit) : null;
    const folgt = !entwurf.meldeschluss || entwurf.meldeschluss === alterVorschlag;
    setEntwurf({
      ...entwurf,
      uhrzeit: uhrzeit || undefined,
      meldeschluss: folgt ? (meldeschlussVorschlag(daten.datum, uhrzeit) ?? undefined) : entwurf.meldeschluss
    });
  }

  return (
    <section className="block">
      <div className="bearbeitenkopf">
        <div>
          <h2>Ausschreibung</h2>
          <p className="hinweis">
            Angaben für die Einladung zum Turnier. Daraus entstehen der Text zum Teilen und ein Aushang zum Eintragen.
          </p>
        </div>
        {geaendert && (
          <div className="knopfpaar">
            <button type="button" title="Die Angaben verwerfen" onClick={() => setEntwurf(gespeichert)}>
              Verwerfen
            </button>
            <button type="button" title="Die Angaben der Ausschreibung speichern" onClick={() => void sichern()}>
              Speichern
            </button>
          </div>
        )}
      </div>
      <div className="felder breitefelder">
        <label className="feld">
          <span>Beginn</span>
          <input type="time" value={entwurf.uhrzeit ?? ''} onChange={(e) => uhrzeitSetzen(e.target.value)} />
        </label>
        <label className="feld">
          <span>Meldeschluss</span>
          <input
            type="datetime-local"
            value={alsEingabe(entwurf.meldeschluss)}
            onChange={(e) => setEntwurf({ ...entwurf, meldeschluss: ausEingabe(e.target.value) })}
          />
          <small>Vorschlag: eine Stunde vor Beginn</small>
        </label>
        <label className="feld">
          <span>Startgeld</span>
          <input
            value={entwurf.startgeld ?? ''}
            placeholder="z. B. 5 €"
            onChange={(e) => setEntwurf({ ...entwurf, startgeld: e.target.value || undefined })}
          />
        </label>
        <label className="feld">
          <span>Höchstens Teilnehmer</span>
          <input
            type="number"
            min={2}
            value={entwurf.hoechstens ?? ''}
            placeholder="ohne Grenze"
            onChange={(e) => setEntwurf({ ...entwurf, hoechstens: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label className="feld ganzebreite">
          <span>Hinweis</span>
          <input
            value={entwurf.hinweis ?? ''}
            placeholder="z. B. Bitte 15 Minuten vorher da sein."
            onChange={(e) => setEntwurf({ ...entwurf, hinweis: e.target.value || undefined })}
          />
        </label>
      </div>

      <label className="ankreuz">
        <input
          type="checkbox"
          checked={Boolean(entwurf.offen)}
          onChange={(e) => setEntwurf({ ...entwurf, offen: e.target.checked || undefined })}
        />
        <span>
          Anmeldung für Mitglieder offen
          <small>
            Mitglieder mit Konto melden sich bis zum Meldeschluss auf der Seite Turniere selbst an und ab. Wer sich
            anmeldet, steht bis zur Auslosung direkt in der Teilnehmerliste. Der Text zum Teilen bekommt den Link zur
            Anmeldung.
          </small>
        </span>
      </label>

      {meldung && <p className="meldung">{meldung}</p>}
      <pre className="teiltext" title="So sieht der Text zum Teilen aus">{text}</pre>
      <TeilenKnoepfe text={text} betreff={`Ausschreibung: ${daten.name}`}>
        <button
          type="button"
          title="Eine DIN-A4-Seite mit den Angaben und Zeilen zum Eintragen, zum Aushängen im Vereinsheim"
          onClick={() => herunterladen(aushangPdf(volle), aushangDateiname(daten.name, daten.datum))}
        >
          Aushang (PDF)
        </button>
      </TeilenKnoepfe>
    </section>
  );
}
