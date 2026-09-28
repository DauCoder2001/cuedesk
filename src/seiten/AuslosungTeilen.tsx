import { useState } from 'react';
import { auslosungText } from '../ausschreibung';
import TeilenKnoepfe from './TeilenKnoepfe';
import type { AuslosungDaten } from '../ausschreibung';

// Nach der Auslosung: Gruppen und Spieler als Text fuer WhatsApp oder E-Mail,
// wie die WhatsApp-Auslosung in Pool-TS. Aufklappbar, anfangs zu.

export default function AuslosungTeilen({ daten }: { daten: AuslosungDaten }) {
  const [mitRating, setMitRating] = useState(false);
  const [mitErsterRunde, setMitErsterRunde] = useState(false);
  const text = auslosungText(daten, { rating: mitRating, ersteRunde: mitErsterRunde });

  return (
    <section className="block">
      <details className="aufklapp">
        <summary title="Gruppen und Spieler als Text für WhatsApp oder E-Mail">Auslosung teilen</summary>
        <div className="knopfpaar">
          <label className="ankreuz">
            <input type="checkbox" checked={mitRating} onChange={(e) => setMitRating(e.target.checked)} />
            <span>mit Rating</span>
          </label>
          <label className="ankreuz">
            <input type="checkbox" checked={mitErsterRunde} onChange={(e) => setMitErsterRunde(e.target.checked)} />
            <span>mit den Spielen der 1. Runde</span>
          </label>
        </div>
        <pre className="teiltext" title="So sieht der Text zum Teilen aus">{text}</pre>
        <TeilenKnoepfe text={text} betreff={`Auslosung: ${daten.name}`} />
      </details>
    </section>
  );
}
