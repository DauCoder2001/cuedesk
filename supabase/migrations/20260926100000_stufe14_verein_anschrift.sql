-- =============================================================
--  Stufe 14, Teil 2: Anschrift, Homepage und Kontakt des Vereins
--
--  Vereinsdaten, keine Mitgliederdaten. Gebraucht fuer die
--  Turnier-Ausschreibung (Spielort), spaetere Vereinsseiten und den
--  Kontakt aus der Konsole. Pflegen darf sie der Vereins-Administrator
--  (Seite System, ueber die vorhandene Regel vereine_aendern) und der
--  Super-Admin ueber verein_aendern.
-- =============================================================

alter table public.vereine
  add column strasse       text,   -- Spiellokal: Strasse und Hausnummer
  add column plz           text,
  add column ort           text,
  add column homepage      text,
  add column kontakt_email text;

-- verein_aendern bekommt die neuen Felder; die alte Fassung faellt weg.
drop function public.verein_aendern(uuid, text, text, text, boolean);

create function public.verein_aendern(
  p_verein uuid, p_name text, p_kurzname text, p_slug text, p_test boolean,
  p_strasse text, p_plz text, p_ort text, p_homepage text, p_kontakt_email text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vereine;
  n jsonb;
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
    raise exception 'Die Web-Adresse besteht aus 2 bis 30 Kleinbuchstaben, Ziffern und Bindestrichen.';
  end if;

  n := jsonb_build_object(
    'name', btrim(p_name),
    'kurzname', coalesce(nullif(btrim(p_kurzname), ''), btrim(p_name)),
    'slug', p_slug,
    'test', coalesce(p_test, false),
    'strasse', nullif(btrim(p_strasse), ''),
    'plz', nullif(btrim(p_plz), ''),
    'ort', nullif(btrim(p_ort), ''),
    'homepage', nullif(btrim(p_homepage), ''),
    'kontakt_email', nullif(lower(btrim(p_kontakt_email)), '')
  );

  update public.vereine
     set name          = n ->> 'name',
         kurzname      = n ->> 'kurzname',
         slug          = n ->> 'slug',
         ist_test      = (n ->> 'test')::boolean,
         strasse       = n ->> 'strasse',
         plz           = n ->> 'plz',
         ort           = n ->> 'ort',
         homepage      = n ->> 'homepage',
         kontakt_email = n ->> 'kontakt_email'
   where id = p_verein;

  perform public.protokollieren('verein_geaendert', p_verein, jsonb_build_object(
    'vorher', jsonb_build_object('name', v.name, 'kurzname', v.kurzname, 'slug', v.slug, 'test', v.ist_test,
                                 'strasse', v.strasse, 'plz', v.plz, 'ort', v.ort,
                                 'homepage', v.homepage, 'kontakt_email', v.kontakt_email),
    'nachher', n
  ));
end;
$$;

revoke execute on function public.verein_aendern(uuid, text, text, text, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.verein_aendern(uuid, text, text, text, boolean, text, text, text, text, text) to authenticated;
