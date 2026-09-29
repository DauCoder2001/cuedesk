import { useState } from 'react';
import { supabase } from '../supabase';
import { herunterladen } from '../pdf';
import { auskunftDateiname, auskunftPdf } from '../auskunft';
import type { Auskunft } from '../auskunft';

// Knoepfe "PDF" und "JSON" fuer die Auskunft zu einem Spieler (Art. 15/20),
// auf der Seite "Spieler" und unter "Mein Konto". Wer abrufen darf, prueft
// die Datenbankfunktion person_auskunft.
export default function AuskunftKnoepfe({ personId, beschriftung }: { personId: string; beschriftung: string }) {
  const [laedt, setLaedt] = useState<'pdf' | 'json' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function holen(art: 'pdf' | 'json') {
    setLaedt(art);
    setFehler(null);
    const { data, error } = await supabase.rpc('person_auskunft', { p_person: personId });
    setLaedt(null);
    if (error || !data) return setFehler(error?.message ?? 'Keine Auskunft erhalten.');
    const auskunft = data as Auskunft;
    if (art === 'pdf') return herunterladen(auskunftPdf(auskunft), auskunftDateiname(auskunft, 'pdf'));
    const url = URL.createObjectURL(new Blob([JSON.stringify(auskunft, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = auskunftDateiname(auskunft, 'json');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="auskunft">
      <div className="knopfpaar">
        <span className="hinweis">{beschriftung}</span>
        <button
          type="button"
          title="Alle gespeicherten Daten als PDF zum Lesen (Art. 15 DSGVO)"
          disabled={laedt !== null}
          onClick={() => void holen('pdf')}
        >
          {laedt === 'pdf' ? 'Wird erstellt …' : 'PDF'}
        </button>
        <button
          type="button"
          title="Alle gespeicherten Daten maschinenlesbar als JSON-Datei (Art. 20 DSGVO)"
          disabled={laedt !== null}
          onClick={() => void holen('json')}
        >
          {laedt === 'json' ? 'Wird erstellt …' : 'JSON'}
        </button>
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  );
}
