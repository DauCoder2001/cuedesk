import { useState } from 'react';
import { supabase } from '../supabase';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import type { Person } from '../datenbank.types';

// Korrektur importierter Spieltage (quelle 'import', beendet): einen falsch
// zugeordneten Spieler durch den richtigen ersetzen - Teilnahme mit Endplatz
// und alle Partien dieses einen Spieltags. Der neue Spieler darf an dem Tag
// nicht schon dabei sein, sonst stuende er doppelt in Wertung und Partien.

export function ersetzenFehler(alt: string, neu: string, teilnehmer: Set<string>): string | null {
  if (!alt || !neu) return 'Bitte beide Spieler wählen.';
  if (alt === neu) return 'Das ist derselbe Spieler.';
  if (!teilnehmer.has(alt)) return 'Der zu ersetzende Spieler gehört nicht zu diesem Spieltag.';
  if (teilnehmer.has(neu)) return 'Der neue Spieler ist an diesem Spieltag schon dabei.';
  return null;
}

export default function SpielerErsetzen({
  turnierId,
  teilnehmer,
  personen,
  anzeige,
  fertig
}: {
  turnierId: string;
  teilnehmer: string[];
  personen: Person[];
  anzeige: (id: string) => string;
  fertig: () => Promise<void> | void;
}) {
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();
  const dabei = new Set(teilnehmer);

  const kandidaten = [...personen]
    .filter((p) => !dabei.has(p.id) && !p.anonymisiert_am)
    .sort((a, b) => personName(a).localeCompare(personName(b), 'de'));

  async function ersetzen() {
    setMeldung(null);
    const problem = ersetzenFehler(alt, neu, dabei);
    if (problem) return setFehler(problem);
    const neuName = personName(personen.find((p) => p.id === neu)!);
    if (!(await fragen(`An diesem Spieltag „${anzeige(alt)}“ durch „${neuName}“ ersetzen? Endplatz und alle Partien gehen auf ${neuName} über.`, 'Ersetzen'))) return;
    setFehler(null);
    setLaeuft(true);
    try {
      // Erst die Partien, dann die Teilnahme
      const a = await supabase.from('partien').update({ spieler_a: neu }).eq('turnier_id', turnierId).eq('spieler_a', alt);
      if (a.error) throw new Error(a.error.message);
      const b = await supabase.from('partien').update({ spieler_b: neu }).eq('turnier_id', turnierId).eq('spieler_b', alt);
      if (b.error) throw new Error(b.error.message);
      const { error } = await supabase.from('turnier_teilnehmer').update({ person_id: neu }).eq('turnier_id', turnierId).eq('person_id', alt);
      if (error) throw new Error(error.message);
      setMeldung(`Ersetzt: ${anzeige(alt)} → ${neuName}. Danach unter Rating „Jetzt neu berechnen“.`);
      setAlt('');
      setNeu('');
      await fertig();
    } catch (e) {
      setFehler(`Nicht ersetzt: ${(e as Error).message}`);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="block">
      <h2>Spieler ersetzen</h2>
      <p className="hinweis">
        Für Fehler beim Einlesen: Ist ein Name dem falschen Spieler zugeordnet, hier den richtigen eintragen. Das gilt nur
        für diesen Spieltag.
      </p>
      <div className="zeile">
        <select value={alt} onChange={(e) => setAlt(e.target.value)} title="Der falsch zugeordnete Spieler" disabled={laeuft}>
          <option value="">Spieler am Spieltag …</option>
          {[...teilnehmer]
            .sort((a, b) => anzeige(a).localeCompare(anzeige(b), 'de'))
            .map((id) => (
              <option key={id} value={id}>
                {anzeige(id)}
              </option>
            ))}
        </select>
        <span>durch</span>
        <select value={neu} onChange={(e) => setNeu(e.target.value)} title="Der richtige Spieler" disabled={laeuft}>
          <option value="">richtigen Spieler …</option>
          {kandidaten.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p)}
              {p.status === 'gast' ? ' (Gast)' : p.status === 'ausgetreten' ? ' (ausgetreten)' : ''}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void ersetzen()} disabled={laeuft || !alt || !neu} title="Teilnahme und Partien umschreiben">
          {laeuft ? 'Ersetzt …' : 'Ersetzen'}
        </button>
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {meldung && <p className="meldung">{meldung}</p>}
      {rueckfrage}
    </section>
  );
}
