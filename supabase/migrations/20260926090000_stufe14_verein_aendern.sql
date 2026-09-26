-- =============================================================
--  Stufe 14: Super-Admin bearbeitet die Grunddaten eines Vereins
--
--  Name, Kurzname, Adresse (slug) und Test-Kennzeichen. Logo,
--  Vorgaben und Schutzwort bleiben Sache des Vereins-Administrators
--  (Seite System). Jede Aenderung steht mit vorher/nachher im
--  Protokoll der Konsole.
-- =============================================================

create function public.verein_aendern(
  p_verein uuid, p_name text, p_kurzname text, p_slug text, p_test boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vereine;
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine bearbeitet hier nur ein Super-Admin.';
  end if;
  select * into v from public.vereine where id = p_verein;
  if v.id is null then
    raise exception 'Verein nicht gefunden.';
  end if;
  if length(btrim(p_name)) < 2 then
    raise exception 'Der Name braucht mindestens zwei Zeichen.';
  end if;
  if p_slug !~ '^[a-z0-9-]{2,30}$' then
    raise exception 'Die Adresse besteht aus 2 bis 30 Kleinbuchstaben, Ziffern und Bindestrichen.';
  end if;

  update public.vereine
     set name     = btrim(p_name),
         kurzname = coalesce(nullif(btrim(p_kurzname), ''), btrim(p_name)),
         slug     = p_slug,
         ist_test = coalesce(p_test, false)
   where id = p_verein;

  perform public.protokollieren('verein_geaendert', p_verein, jsonb_build_object(
    'vorher', jsonb_build_object('name', v.name, 'kurzname', v.kurzname, 'slug', v.slug, 'test', v.ist_test),
    'nachher', jsonb_build_object('name', btrim(p_name),
                                  'kurzname', coalesce(nullif(btrim(p_kurzname), ''), btrim(p_name)),
                                  'slug', p_slug, 'test', coalesce(p_test, false))
  ));
end;
$$;

revoke execute on function public.verein_aendern(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.verein_aendern(uuid, text, text, text, boolean) to authenticated;
