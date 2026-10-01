-- Stufe 25: Live-Uebertragung je Turnier schalten.
--
-- Die Tablets schreiben ihren Stand weiter in live_stand (sonst waere ein
-- laufendes Spiel nach Neuladen weg). Sichtbar ist er fuer Mitglieder und
-- Fernseher aber nur, solange ein Turnier oder Liga-Spieltag des Vereins
-- laeuft und dort einstellungen.live nicht false ist (fehlt der Schluessel,
-- gilt "an"). In dieser Zeit erscheinen alle Tische, auch freie Spiele.
-- Die Leitung (Vereins-Admin, Sportwart, Turnierleiter) sieht immer alles,
-- ebenso ein freigegebener Support-Zugang und das Tablet seinen eigenen Tisch.
-- Realtime wendet dieselbe Regel an.

create function public.live_uebertragen(p_verein uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.turniere t
     where t.verein_id = p_verein
       and t.status = 'laeuft'
       and coalesce((t.einstellungen ->> 'live')::boolean, true)
  );
$$;
revoke execute on function public.live_uebertragen(uuid) from public, anon;
grant execute on function public.live_uebertragen(uuid) to authenticated;

-- Ist das angemeldete Geraet das Tablet dieses Tisches?
create function public.ist_eigener_tisch(p_tisch uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.geraete g where g.auth_id = auth.uid() and g.aktiv and g.tisch_id = p_tisch);
$$;
revoke execute on function public.ist_eigener_tisch(uuid) from public, anon;
grant execute on function public.ist_eigener_tisch(uuid) to authenticated;

-- Die Schreibregel aus Stufe 3 galt "for all" und damit auch fuers Lesen:
-- jedes Geraet des Vereins haette weiter alles gesehen. Sie wird in Anlegen,
-- Aendern und Loeschen aufgeteilt (gleiche Bedingung); gelesen wird nur noch
-- ueber live_lesen.
drop policy live_schreiben on public.live_stand;
create policy live_anlegen on public.live_stand for insert to authenticated
  with check (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));
create policy live_aendern on public.live_stand for update to authenticated
  using (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));
create policy live_loeschen on public.live_stand for delete to authenticated
  using (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));

drop policy live_lesen on public.live_stand;
create policy live_lesen on public.live_stand for select to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}')
    or public.support_freigegeben(verein_id)
    or public.ist_eigener_tisch(tisch_id)
    or (public.ist_im_verein(verein_id) and public.live_uebertragen(verein_id))
  );
