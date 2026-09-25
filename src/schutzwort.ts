// Ein einfaches Wort schuetzt die Stellen, die am Tisch niemand versehentlich
// ausloesen soll: die verdeckte Aufstellung und das Neuladen eines Tablets.
// Es haelt keinen Angreifer auf, nur den schnellen Griff daneben.
//
// Das Wort steht nicht im Programm, sondern in der Datenbank (Seite "System").
// Sie sagt nur "stimmt" oder "stimmt nicht"; ohne eigenes Wort gilt "8-ball".

import { supabase } from './supabase';

export async function schutzwortPruefen(vereinId: string, eingabe: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('schutzwort_stimmt', { p_verein: vereinId, p_wort: eingabe });
  return !error && data === true;
}
