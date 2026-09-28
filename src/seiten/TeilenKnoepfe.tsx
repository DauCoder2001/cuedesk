import { useState } from 'react';
import type { ReactNode } from 'react';

// Text kopieren, per WhatsApp oder E-Mail teilen; gemeinsam fuer Ausschreibung
// und Auslosung. Weitere Knoepfe (z. B. Aushang) kommen als children dazu.

export default function TeilenKnoepfe({
  text,
  betreff,
  children
}: {
  text: string;
  betreff: string; // Betreff der E-Mail
  children?: ReactNode;
}) {
  const [meldung, setMeldung] = useState<string | null>(null);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setMeldung('Text kopiert. In WhatsApp oder einer Mail einfügen.');
    } catch {
      setMeldung('Kopieren ging nicht. Bitte den Text markieren und kopieren.');
    }
  }

  return (
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
          // Die WhatsApp-Sternchen fuer Fettschrift gehoeren nicht in die Mail
          window.location.href = `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text.replace(/\*/g, ''))}`;
        }}
      >
        Per E-Mail
      </button>
      {children}
      {meldung && <span className="meldung zaehlstand">{meldung}</span>}
    </div>
  );
}
