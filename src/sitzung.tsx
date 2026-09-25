import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Benutzer, MeinVerein, Rolle, Verein } from './datenbank.types';

// Zuletzt gewaehlter Verein, damit man nach dem Neuladen im selben bleibt
const GEMERKT = 'cuedesk.verein';
const gemerkterVerein = () => {
  try {
    return localStorage.getItem(GEMERKT);
  } catch {
    return null;
  }
};

export type SitzungsStand = {
  laedt: boolean;
  sitzung: Session | null;
  benutzer: Benutzer | null;
  verein: Verein | null; // der gewaehlte Verein, solange er nicht gesperrt ist
  rollen: Rolle[]; // Rollen im gewaehlten Verein
  vereine: MeinVerein[]; // alle eigenen Vereine, auch gesperrte
  gesperrt: MeinVerein | null; // gewaehlter Verein, falls er gesperrt ist
  istSuperAdmin: boolean;
  vereinWaehlen: (id: string) => void;
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
  const [vereine, setVereine] = useState<MeinVerein[]>([]);
  const [gesperrt, setGesperrt] = useState<MeinVerein | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(gemerkterVerein());

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
      setVereine([]);
      setGesperrt(null);
      return;
    }
    let abgebrochen = false;

    (async () => {
      const { data: b } = await supabase
        .from('benutzer')
        .select('*')
        .eq('id', sitzung.user.id)
        .maybeSingle();

      // Alle eigenen Vereine, auch gesperrte (die sonst unsichtbar sind)
      const { data: liste } = await supabase.rpc('meine_vereine');
      const eigene = (liste ?? []) as MeinVerein[];
      // Gewaehlt bleibt der gemerkte Verein; sonst der erste aktive
      const wahl =
        eigene.find((x) => x.id === gewaehlt) ?? eigene.find((x) => x.aktiv) ?? eigene[0] ?? null;

      const { data: v } =
        wahl && wahl.aktiv
          ? await supabase.from('vereine').select('*').eq('id', wahl.id).maybeSingle()
          : { data: null };

      if (abgebrochen) return;
      setBenutzer(b ?? null);
      setVereine(eigene);
      setRollen(wahl && wahl.aktiv ? wahl.rollen : []);
      setVerein(v ?? null);
      setGesperrt(wahl && !wahl.aktiv ? wahl : null);
    })();

    return () => {
      abgebrochen = true;
    };
  }, [sitzung, gewaehlt]);

  const wert = useMemo<SitzungsStand>(
    () => ({
      laedt,
      sitzung,
      benutzer,
      verein,
      rollen,
      vereine,
      gesperrt,
      istSuperAdmin: Boolean(benutzer?.systemadmin),
      vereinWaehlen: (id: string) => {
        try {
          localStorage.setItem(GEMERKT, id);
        } catch {
          // ohne Speicher gilt die Wahl bis zum Neuladen
        }
        setGewaehlt(id);
      },
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
    [laedt, sitzung, benutzer, verein, rollen, vereine, gesperrt]
  );

  return <Sitzungskontext.Provider value={wert}>{children}</Sitzungskontext.Provider>;
}

export function useSitzung(): SitzungsStand {
  const wert = useContext(Sitzungskontext);
  if (!wert) throw new Error('useSitzung ausserhalb von SitzungsRahmen benutzt');
  return wert;
}
