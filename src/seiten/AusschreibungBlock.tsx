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
import type { Ausschreibung, AusschreibungDaten } from '../ausschreibung';

// Ausschreibung in der Turnieransicht, solange das Turnier in Vorbereitung ist:
// Angaben pflegen, Text ansehen und teilen, Aushang als PDF.

export default function AusschreibungBlock({
  daten,
  gespeichert,
  speichern
}: {
  daten: Omit<AusschreibungDaten, 'ausschreibung'>;
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

  const volle: AusschreibungDaten = { ...daten, ausschreibung: entwurf };
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

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setMeldung('Text kopiert. In WhatsApp oder einer Mail einfügen.');
    } catch {
      setMeldung('Kopieren ging nicht. Bitte den Text markieren und kopieren.');
    }
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
      <div className="felder">
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

      <pre className="teiltext" title="So sieht der Text zum Teilen aus">{text}</pre>
      <div className="knopfpaar">
        <button type="button" title="Den Text in die Zwischenablage kopieren" onClick={() => void kopieren()}>
          Text kopieren
        </button>
        <button
          type="button"
          title="WhatsApp mit diesem Text öffnen; am Handy die App, am PC WhatsApp Web"
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}
        >
          Per WhatsApp teilen
        </button>
        <button
          type="button"
          title="Das eigene Mailprogramm mit Betreff und Text öffnen; die Empfänger wählst du dort"
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent(`Ausschreibung: ${daten.name}`)}&body=${encodeURIComponent(text.replace(/\*/g, ''))}`;
          }}
        >
          Per E-Mail
        </button>
        <button
          type="button"
          title="Eine DIN-A4-Seite mit den Angaben und Zeilen zum Eintragen, zum Aushängen im Vereinsheim"
          onClick={() => herunterladen(aushangPdf(volle), aushangDateiname(daten.name, daten.datum))}
        >
          Aushang (PDF)
        </button>
        {meldung && <span className="meldung zaehlstand">{meldung}</span>}
      </div>
    </section>
  );
}
