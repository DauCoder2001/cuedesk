// Eine Partie zurueck auf "offen" stellen, damit sie am Tablet wieder in der
// Spielauswahl steht. Leere Ergebnisfelder allein reichen dafuer nicht: der
// Tisch bliebe an der Partie haengen, und das Tablet hielte sie fuer laufend.

import { supabase } from './supabase';
import type { Partie } from './datenbank.types';

type Zustand = Pick<Partie, 'tisch_id' | 'status' | 'ergebnis_a' | 'ergebnis_b'>;

// Gibt es etwas zurueckzusetzen? (Tisch, Status oder Ergebnis)
export function zuruecksetzbar(p: Zustand | null | undefined): boolean {
  if (!p) return false;
  return p.tisch_id !== null || p.status !== 'geplant' || p.ergebnis_a !== null || p.ergebnis_b !== null;
}

// null = geklappt, sonst der Fehlertext
export async function partieZuruecksetzen(p: Partie): Promise<string | null> {
  // Haelt ein Tablet die Partie, wird sein Stand verworfen; es zeigt dann
  // wieder die Spielauswahl.
  if (p.tisch_id) {
    const { error } = await supabase
      .from('live_stand')
      .delete()
      .eq('tisch_id', p.tisch_id)
      .eq('zustand->>tournamentMatchId', p.id);
    if (error) return error.message;
  }
  if (p.disziplin === '14-1') {
    const aufnahmen = await supabase.from('aufnahmen_141').delete().eq('partie_id', p.id);
    if (aufnahmen.error) return aufnahmen.error.message;
    const zusatz = await supabase.from('partien_141').delete().eq('partie_id', p.id);
    if (zusatz.error) return zusatz.error.message;
  }
  const { error } = await supabase
    .from('partien')
    .update({ ergebnis_a: null, ergebnis_b: null, status: 'geplant', tisch_id: null, begonnen: null, beendet: null })
    .eq('id', p.id);
  return error ? error.message : null;
}
