import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRueckfrage } from '../rueckfrage';
import { herunterfahrenFrage, herunterfahrenMeldung } from '../geraete';

// Knopf "TV-Gerät herunterfahren": in der Zeile "TV zeigt:" nach dem Abschluss
// und in der Geraeteliste. Die Bitte holt der Agent auf dem TV-Geraet ab
// (spaetestens nach 30 Sekunden). Ohne Agent im Verein erscheint kein Knopf;
// agenten uebergibt, wer die Liste schon geladen hat.

export default function TvHerunterfahren({ vereinId, agenten }: { vereinId: string; agenten?: number }) {
  const [geladen, setGeladen] = useState(0);
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
  if (anzahl === 0) return null;

  async function herunterfahren() {
    if (!(await fragen(herunterfahrenFrage(anzahl), 'Herunterfahren'))) return;
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
        title="Fährt das TV-Gerät sauber herunter. Es startet erst wieder, wenn der Strom kurz getrennt wird."
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
