-- =============================================================
--  Nachtrag zu Stufe 13
--
--  1. Das Protokoll der Super-Admins merkt sich den Vereinsnamen.
--     Beim Loeschen eines Vereins wird verein_id leer; ohne Namen
--     waere nicht mehr zu sehen, wen "Verein gesperrt" betraf.
--  2. Aufraeumen kennt eine weitere Art: Eintraege im
--     Aenderungsprotokoll, deren Verein es nicht mehr gibt.
-- =============================================================

create or replace function public.protokollieren(p_aktion text, p_verein uuid, p_details jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.system_protokoll (benutzer_id, aktion, verein_id, details)
  values (
    auth.uid(), p_aktion, p_verein,
    -- ein mitgegebener Name hat Vorrang
    coalesce((select jsonb_build_object('name', v.name) from public.vereine v where v.id = p_verein), '{}'::jsonb)
      || coalesce(p_details, '{}'::jsonb)
  );
$$;

-- Vorhandene Eintraege nachtragen, solange der Verein noch da ist
update public.system_protokoll p
   set details = jsonb_build_object('name', v.name) || p.details
  from public.vereine v
 where v.id = p.verein_id and not (p.details ? 'name');

create or replace function public.aufraeumen_intern(p_ausfuehren boolean, p_arten text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v   jsonb := '{}'::jsonb;
  n   integer;
begin
  -- Kopplungscodes gelten 15 Minuten
  if p_ausfuehren and 'kopplungen' = any(p_arten) then
    delete from public.kopplungen where erstellt_am < now() - interval '15 minutes';
  end if;
  select count(*) into n from public.kopplungen where erstellt_am < now() - interval '15 minutes';
  v := v || jsonb_build_object('kopplungen', n);

  -- Tablet-Anmeldungen ohne Geraet (entfernte Tablets, abgebrochene Kopplungen)
  if p_ausfuehren and 'tablet_konten' = any(p_arten) then
    delete from auth.users u
     where u.is_anonymous and u.created_at < now() - interval '1 day'
       and not exists (select 1 from public.geraete g where g.auth_id = u.id);
  end if;
  select count(*) into n from auth.users u
   where u.is_anonymous and u.created_at < now() - interval '1 day'
     and not exists (select 1 from public.geraete g where g.auth_id = u.id);
  v := v || jsonb_build_object('tablet_konten', n);

  -- Tablets, die sich seit 90 Tagen nicht gemeldet haben
  if p_ausfuehren and 'tablets_alt' = any(p_arten) then
    delete from auth.users u using public.geraete g
     where g.auth_id = u.id and coalesce(g.zuletzt_gesehen, g.erstellt_am) < now() - interval '90 days';
    delete from public.geraete g where coalesce(g.zuletzt_gesehen, g.erstellt_am) < now() - interval '90 days';
  end if;
  select count(*) into n from public.geraete g
   where coalesce(g.zuletzt_gesehen, g.erstellt_am) < now() - interval '90 days';
  v := v || jsonb_build_object('tablets_alt', n);

  -- Einladungen, die 30 Tage niemand angenommen hat
  if p_ausfuehren and 'einladungen' = any(p_arten) then
    delete from public.einladungen where angenommen_am is null and erstellt_am < now() - interval '30 days';
  end if;
  select count(*) into n from public.einladungen where angenommen_am is null and erstellt_am < now() - interval '30 days';
  v := v || jsonb_build_object('einladungen', n);

  -- Tischstaende, die seit 14 Tagen niemand geaendert hat
  if p_ausfuehren and 'tischstaende' = any(p_arten) then
    delete from public.live_stand where aktualisiert < now() - interval '14 days';
  end if;
  select count(*) into n from public.live_stand where aktualisiert < now() - interval '14 days';
  v := v || jsonb_build_object('tischstaende', n);

  -- Aenderungsprotokoll aelter als zwei Jahre
  if p_ausfuehren and 'aenderungen' = any(p_arten) then
    delete from public.aenderungen where zeitpunkt < now() - interval '2 years';
  end if;
  select count(*) into n from public.aenderungen where zeitpunkt < now() - interval '2 years';
  v := v || jsonb_build_object('aenderungen', n);

  -- Aenderungsprotokoll von Vereinen, die es nicht mehr gibt
  if p_ausfuehren and 'aenderungen_verwaist' = any(p_arten) then
    delete from public.aenderungen a
     where a.verein_id is not null
       and not exists (select 1 from public.vereine v where v.id = a.verein_id);
  end if;
  select count(*) into n from public.aenderungen a
   where a.verein_id is not null
     and not exists (select 1 from public.vereine v where v.id = a.verein_id);
  v := v || jsonb_build_object('aenderungen_verwaist', n);

  -- Rueckmeldungen der Sicherung aelter als ein Jahr
  if p_ausfuehren and 'ereignisse' = any(p_arten) then
    delete from public.system_ereignisse where zeit < now() - interval '1 year';
  end if;
  select count(*) into n from public.system_ereignisse where zeit < now() - interval '1 year';
  v := v || jsonb_build_object('ereignisse', n);

  return v;
end;
$$;
