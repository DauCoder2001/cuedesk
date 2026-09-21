-- =============================================================
--  CueDesk, Stufe 3: Turnierleiter koppeln Tablets
--
--  Turnierleiter duerfen Tablets koppeln, sehen die Geraeteliste und koennen
--  die Tischzuordnung aendern. Tische anlegen und loeschen sowie Geraete
--  entkoppeln bleibt beim Vereins-Administrator.
-- =============================================================

create or replace function public.geraet_koppeln(p_code text, p_verein uuid, p_name text, p_tisch uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_auth uuid;
  v_id   uuid;
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin,turnierleiter}') then
    raise exception 'Keine Berechtigung';
  end if;
  select auth_id into v_auth from public.kopplungen
    where code = upper(p_code) and erstellt_am > now() - interval '15 minutes';
  if v_auth is null then
    raise exception 'Code unbekannt oder abgelaufen';
  end if;
  insert into public.geraete (verein_id, auth_id, name, tisch_id)
    values (p_verein, v_auth, p_name, p_tisch)
    returning id into v_id;
  delete from public.kopplungen where auth_id = v_auth;
  return v_id;
end;
$$;

drop policy geraete_lesen on public.geraete;
create policy geraete_lesen on public.geraete for select to authenticated
  using (auth_id = auth.uid()
         or public.hat_rolle(verein_id, '{vereinsadmin,turnierleiter}')
         or public.ist_systemadmin());

drop policy geraete_aendern on public.geraete;
create policy geraete_aendern on public.geraete for update to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,turnierleiter}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,turnierleiter}'));
