import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { schutzwortPruefen } from '../schutzwort';
import { partieZuruecksetzen } from '../partie-zuruecksetzen';
import type { Partie } from '../datenbank.types';

// Rueckfrage mit Schutzwort, bevor eine Partie zurueck auf "offen" geht.
// Das Schutzwort haelt den schnellen Griff daneben auf, wie bei
// "Tablet neu laden" und "Aufstellung zeigen".
export default function ZuruecksetzenDialog(props: {
  partie: Partie;
  vereinId: string;
  paarung: string; // "Frank F. – Waldemar M."
  fertig: () => void;
  abbrechen: () => void;
}) {
  const { partie: p } = props;
  const [tisch, setTisch] = useState<number | null>(null);
  useEffect(() => {
    if (!p.tisch_id) return;
    void supabase
      .from('tische')
      .select('nummer')
      .eq('id', p.tisch_id)
      .maybeSingle()
      .then(({ data }) => setTisch(data?.nummer ?? null));
  }, [p.tisch_id]);
  const [wort, setWort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const mitErgebnis = p.ergebnis_a !== null && p.ergebnis_b !== null;

  async function zuruecksetzen() {
    if (arbeitet) return;
    setArbeitet(true);
    if (!(await schutzwortPruefen(props.vereinId, wort))) {
      setArbeitet(false);
      setFehler('Das Passwort stimmt nicht.');
      return;
    }
    const meldung = await partieZuruecksetzen(p);
    setArbeitet(false);
    if (meldung) return setFehler(meldung);
    props.fertig();
  }

  return (
    <div className="dialoghintergrund" onClick={props.abbrechen}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Partie zurücksetzen</h2>
        <p>
          {props.paarung}
          {mitErgebnis
            ? `: Das Ergebnis ${p.ergebnis_a} : ${p.ergebnis_b} wird verworfen.`
            : p.tisch_id
              ? ` läuft an ${tisch !== null ? `Tisch ${tisch}` : 'einem Tisch'}. Der Spielstand am Tisch wird verworfen, das Tablet zeigt wieder die Spielauswahl.`
              : ' wird wieder offen gestellt.'}
          {p.disziplin === '14-1' ? ' Das Aufnahme-Protokoll wird gelöscht.' : ''} Danach steht die Partie wieder in der
          Spielauswahl am Tablet.
        </p>
        <div className="zeile">
          <input
            type="password"
            placeholder="Passwort"
            value={wort}
            autoFocus
            onChange={(e) => setWort(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void zuruecksetzen()}
          />
          <button type="button" title="Mit dem Passwort die Partie zurück auf offen stellen" onClick={() => void zuruecksetzen()}>
            Zurücksetzen
          </button>
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        <button type="button" onClick={props.abbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
