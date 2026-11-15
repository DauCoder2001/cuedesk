import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useRueckfrage } from '../rueckfrage';
import { agentErreichbar, herunterfahrenFrage, herunterfahrenMeldung, nichtErreichbarText } from '../geraete';
import type { TvAgent } from '../geraete';

// Knopf "TV-Gerät herunterfahren": in der Zeile "TV zeigt:" (Turnier, Teamvergleich,
// Liga-Spieltag; seit 0.16.0 auch waehrend gespielt wird, dann mit Warnung in der
// Rueckfrage) und in der Geraeteliste. Die Bitte holt der Agent auf dem TV-Geraet ab
// (spaetestens nach 30 Sekunden).
//
// Ausgegraut mit Tooltip (seit 0.16.1/0.16.2), wenn kein TV-Gerät mit Agent
// eingerichtet ist oder sich keiner in den letzten 2 Minuten gemeldet hat. Die
// Liste wird jede Minute neu geladen: Geht der Fernseher an, wird der Knopf
// von selbst klickbar.

const OHNE_AGENT =
  'Kein TV-Gerät mit Agent eingerichtet, daher lässt sich nichts herunterfahren. ' +
  'Einrichten: unter „Tische und Geräte“ beim Fernseher „Agent-Schlüssel“ (Vereins-Administrator), ' +
  'Näheres in der Hilfe unter „Tablets und Fernseher“.';

const NEU_LADEN_MS = 60 * 1000;

export default function TvHerunterfahren({
  vereinId,
  laeuftNoch
}: {
  vereinId: string;
  laeuftNoch?: string; // z. B. "Das Turnier läuft noch." - Warnung in der Rueckfrage
}) {
  const [agenten, setAgenten] = useState<TvAgent[] | null>(null); // null: wird noch geladen
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  useEffect(() => {
    let abgebrochen = false;
    const laden = async () => {
      const { data } = await supabase.rpc('tv_agenten', { p_verein: vereinId });
      const liste = data ?? [];
      // Namen fuer den Tooltip ("Tablet als TV")
      const namen = new Map<string, string>();
      if (liste.length > 0) {
        const { data: geraete } = await supabase
          .from('geraete')
          .select('id, name')
          .in(
            'id',
            liste.map((a) => a.geraet_id)
          );
        (geraete ?? []).forEach((g) => namen.set(g.id, g.name));
      }
      if (abgebrochen) return;
      setAgenten(liste.map((a) => ({ name: namen.get(a.geraet_id) ?? 'TV-Gerät', zuletzt_gemeldet: a.zuletzt_gemeldet })));
      setJetzt(Date.now());
    };
    void laden();
    const zeitgeber = window.setInterval(() => void laden(), NEU_LADEN_MS);
    return () => {
      abgebrochen = true;
      window.clearInterval(zeitgeber);
    };
  }, [vereinId]);

  // Solange die Liste laedt, nichts zeigen (kein kurzes Aufblitzen des grauen Knopfs)
  if (agenten === null) return null;
  const erreichbar = agenten.filter((a) => agentErreichbar(a.zuletzt_gemeldet, jetzt)).length;
  const grau = agenten.length === 0 ? OHNE_AGENT : erreichbar === 0 ? nichtErreichbarText(agenten) : null;
  if (grau) {
    return (
      <button type="button" className="tvaus" disabled title={grau}>
        TV-Gerät herunterfahren
      </button>
    );
  }

  async function herunterfahren() {
    if (!(await fragen(herunterfahrenFrage(erreichbar, laeuftNoch), 'Herunterfahren'))) return;
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
        className="tvaus"
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
