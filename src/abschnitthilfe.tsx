// Kleines "?" an einem Abschnitt einer Seite: Beim Zeigen steht die
// Erklaerung im Tooltip, ein Klick zeigt den passenden Abschnitt der Hilfe
// (Ueberschrift in hilfe/*.md) in einem Dialog. Die Seite dahinter bleibt
// stehen, man verliert also nicht das geoeffnete Turnier.
import { useState } from 'react';
import { Modal } from './modal';
import { abschnitt } from './hilfe';
import { THEMEN } from './hilfe-texte';
import { Bloecke } from './seiten/Hilfe';

export function AbschnittHilfe({ ueberschrift, tipp }: { ueberschrift: string; tipp: string }) {
  const [offen, setOffen] = useState(false);
  const text = offen ? abschnitt(THEMEN, ueberschrift) : null;
  return (
    <>
      <button
        type="button"
        className="hilfeknopf abschnitthilfe"
        title={`${tipp}\nKlick: Hilfe zu „${ueberschrift}“ anzeigen.`}
        aria-label={`Hilfe zu ${ueberschrift}`}
        onClick={() => setOffen(true)}
      >
        ?
      </button>
      {offen && (
        <Modal breit abbrechen={() => setOffen(false)}>
          <h2>{ueberschrift}</h2>
          <div className="hilfetext">
            {text ? <Bloecke bloecke={text.bloecke} /> : <p>{tipp}</p>}
          </div>
          {text && <p className="hinweis">Aus der Hilfe „{text.thema.titel}“.</p>}
          <div className="knopfpaar">
            <button type="button" onClick={() => setOffen(false)}>
              Schließen
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
