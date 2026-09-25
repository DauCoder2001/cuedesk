import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Benutzer, Rolle, Verein } from './datenbank.types';

export type SitzungsStand = {
  laedt: boolean;
  sitzung: Session | null;
  benutzer: Benutzer | null;
  verein: Verein | null;
  rollen: Rolle[];
  darf: (...rollen: Rolle[]) => boolean;
  abmelden: () => Promise<void>;
  // Nach Aenderungen auf der Seite "System": Name, Logo, Einstellungen frisch holen
  vereinNeuLaden: () => Promise<void>;
};

const Sitzungskontext = createContext<SitzungsStand | null>(null);

export function SitzungsRahmen({ children }: { children: ReactNode }) {
  const [laedt, setLaedt] = useState(true);
  const [sitzung, setSitzung] = useState<Session | null>(null);
  const [benutzer, setBenutzer] = useState<Benutzer | null>(null);
  const [verein, setVerein] = useState<Verein | null>(null);
  const [rollen, setRollen] = useState<Rolle[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSitzung(data.session);
      setLaedt(false);
    });
    const { data: horcher } = supabase.auth.onAuthStateChange((_ereignis, neue) => {
      setSitzung(neue);
    });
    return () => horcher.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sitzung) {
      setBenutzer(null);
      setVerein(null);
      setRollen([]);
      return;
    }
    let abgebrochen = false;

    (async () => {
      const { data: b } = await supabase
        .from('benutzer')
        .select('*')
        .eq('id', sitzung.user.id)
        .maybeSingle();

      const { data: r } = await supabase
        .from('benutzer_rollen')
        .select('verein_id, rolle')
        .eq('benutzer_id', sitzung.user.id);

      const vereinId = r?.[0]?.verein_id ?? null;
      const { data: v } = vereinId
        ? await supabase.from('vereine').select('*').eq('id', vereinId).maybeSingle()
        : { data: null };

      if (abgebrochen) return;
      setBenutzer(b ?? null);
      setRollen((r ?? []).map((zeile) => zeile.rolle));
      setVerein(v ?? null);
    })();

    return () => {
      abgebrochen = true;
    };
  }, [sitzung]);

  const wert = useMemo<SitzungsStand>(
    () => ({
      laedt,
      sitzung,
      benutzer,
      verein,
      rollen,
      darf: (...gesuchte: Rolle[]) => gesuchte.some((rolle) => rollen.includes(rolle)),
      abmelden: async () => {
        await supabase.auth.signOut();
      },
      vereinNeuLaden: async () => {
        if (!verein) return;
        const { data } = await supabase.from('vereine').select('*').eq('id', verein.id).maybeSingle();
        if (data) setVerein(data);
      }
    }),
    [laedt, sitzung, benutzer, verein, rollen]
  );

  return <Sitzungskontext.Provider value={wert}>{children}</Sitzungskontext.Provider>;
}

export function useSitzung(): SitzungsStand {
  const wert = useContext(Sitzungskontext);
  if (!wert) throw new Error('useSitzung ausserhalb von SitzungsRahmen benutzt');
  return wert;
}
