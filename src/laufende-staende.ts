// Live-Staende der Tische eines Vereins, nach Turnierpartie geordnet. Fuer den
// Spielplan in Turnier- und Liga-Ansicht: dort steht neben den leeren
// Ergebnisfeldern der laufende Stand. Die Leitung darf live_stand immer lesen.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type TischStand = { tischId: string; zustand: unknown; aktualisiert: string | null };

export function useLaufendeStaende(vereinId: string | undefined): Map<string, TischStand> {
  const [staende, setStaende] = useState<Map<string, TischStand>>(new Map());

  useEffect(() => {
    if (!vereinId) return;
    let vorbei = false;
    let zeitgeber: number | null = null;
    const laden = async () => {
      const { data } = await supabase.from('live_stand').select('tisch_id, zustand, aktualisiert').eq('verein_id', vereinId);
      if (vorbei) return;
      const neu = new Map<string, TischStand>();
      (data ?? []).forEach((z) => {
        const spiel = (z.zustand as { tournamentMatchId?: string } | null)?.tournamentMatchId;
        if (spiel) neu.set(spiel, { tischId: z.tisch_id, zustand: z.zustand, aktualisiert: z.aktualisiert });
      });
      setStaende(neu);
    };
    void laden();
    // Jeder Stoss schreibt den Stand; gebuendelt neu lesen
    const spaeter = () => {
      if (zeitgeber !== null) window.clearTimeout(zeitgeber);
      zeitgeber = window.setTimeout(() => void laden(), 300);
    };
    const kanal = supabase
      .channel(`laufende-staende-${vereinId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${vereinId}` }, spaeter)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${vereinId}` }, spaeter)
      // Beim Loeschen liefert die Datenbank nur den Schluessel (tisch_id), ein
      // Filter auf verein_id greift dann nie - deshalb ungefiltert neu lesen.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_stand' }, spaeter)
      .subscribe();
    return () => {
      vorbei = true;
      if (zeitgeber !== null) window.clearTimeout(zeitgeber);
      void supabase.removeChannel(kanal);
    };
  }, [vereinId]);

  return staende;
}
