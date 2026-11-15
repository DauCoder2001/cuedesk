import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRueckfrage } from '../rueckfrage';
import { herunterfahrenFrage, herunterfahrenMeldung } from '../geraete';

// Knopf "TV-Gerät herunterfahren": in der Zeile "TV zeigt:" (Turnier, Teamvergleich,
// Liga-Spieltag; seit 0.16.0 auch waehrend gespielt wird, dann mit Warnung in der
// Rueckfrage) und in der Geraeteliste. Die Bitte holt der Agent auf dem TV-Geraet ab
// (spaetestens nach 30 Sekunden). Ohne Agent im Verein ist der Knopf ausgegraut,
// der Tooltip sagt, wie man einen einrichtet (seit 0.16.1); agenten uebergibt,
// wer die Liste schon geladen hat.

const OHNE_AGENT =
  'Kein TV-Gerät mit Agent eingerichtet, daher lässt sich nichts herunterfahren. ' +
  'Einrichten: unter „Tische und Geräte“ beim Fernseher „Agent-Schlüssel“ (Vereins-Administrator), ' +
  'Näheres in der Hilfe unter „Tablets und Fernseher“.';

export default function TvHerunterfahren({
  vereinId,
  agenten,
  laeuftNoch
}: {
  vereinId: string;
  agenten?: number;
  laeuftNoch?: string; // z. B. "Das Turnier läuft noch." - Warnung in der Rueckfrage
}) {
  const [geladen, setGeladen] = useState<number | null>(null); // null: wird noch geladen
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  useEffect(() => {
    if (agenten !== undefined) return;
    let abgebrochen = false;
    void supabase.rpc('tv_agenten', { p_verein: vereinId }).then(({ data }) => {
      if (!abgebrochen) setGeladen(data?.length ?? 0);
    });
    return () => {
      abgebrochen = true;
    };
  }, [vereinId, agenten]);

  const anzahl = agenten ?? geladen;
  // Solange die Liste laedt, nichts zeigen (kein kurzes Aufblitzen des grauen Knopfs)
  if (anzahl === null) return null;
  if (anzahl === 0) {
    return (
      <button type="button" disabled title={OHNE_AGENT}>
        TV-Gerät herunterfahren
      </button>
    );
  }
  const geraete = anzahl;

  async function herunterfahren() {
    if (!(await fragen(herunterfahrenFrage(geraete, laeuftNoch), 'Herunterfahren'))) return;
    setArbeitet(true);
    setFehler(null);
    setMeldung(null);
    const { data, error } = await supabase.rpc('tv_herunterfahren', { p_verein: vereinId });
    setArbeitet(false);
    if (error) return setFehler(error.message);
    if (!data) return setFehler('Kein TV-Gerät erreichbar. Sein Agent hat sich in den letzten 2 Minuten nicht gemeldet.');
    setMeldung(herunterfahrenMeldung(data));
  }

  return (
    <>
      <button
        type="button"
        title={
          laeuftNoch
            ? `Fährt das TV-Gerät sauber herunter. ${laeuftNoch} Es startet erst wieder, wenn der Strom kurz getrennt wird.`
            : 'Fährt das TV-Gerät sauber herunter. Es startet erst wieder, wenn der Strom kurz getrennt wird.'
        }
        disabled={arbeitet || meldung !== null}
        onClick={() => void herunterfahren()}
      >
        TV-Gerät herunterfahren
      </button>
      {meldung && <span className="meldung">{meldung}</span>}
      {fehler && <span className="fehler">{fehler}</span>}
      {rueckfrage}
    </>
  );
}
