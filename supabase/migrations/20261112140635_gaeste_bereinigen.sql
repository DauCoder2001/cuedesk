-- Gaeste bereinigen (Entscheidung 12.11.2026)
--
-- Jeder eingelesene Mannschaftspass eines Gegners legt bis zu 12 Gaeste an,
-- von denen meist nur vier spielen. Der Vereins-Administrator kann unter
-- System Gaeste entfernen, die nie gespielt haben: erst die Liste fuer einen
-- Zeitraum (Anlegedatum), dann das Entfernen der angehakten. Das Schutzwort
-- fragt die Anwendung vorher ab (wie beim Loeschen von Turnieren).
--
-- Ein Gast bleibt immer, wenn
--   - er in einer Partie, einer 14.1-Aufnahme oder als Teilnehmer steht,
--   - er in den Einstellungen eines Turniers steht, das nicht beendet ist
--     (z. B. im Gegner-Kader eines Spieltags in Vorbereitung),
--   - er in einem beendeten Turnier anderswo als im Gegner-Kader steht,
--   - er angemeldet ist, in einem Mannschaftskader steht, mit einem Konto
--     verknuepft oder eingeladen ist.

-- Warum ein Gast bleibt: 'spiel', 'offen', 'gebunden' - oder null (entfernbar).
-- Nur fuer die beiden Funktionen darunter.
create function public.gast_bindung(p_person uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.partien x where p_person in (x.spieler_a, x.spieler_b, x.partner_a, x.partner_b))
      or exists (select 1 from public.aufnahmen_141 x where x.spieler = p_person)
      or exists (select 1 from public.turnier_teilnehmer x where x.person_id = p_person)
      then 'spiel'
    when exists (
      select 1 from public.turniere t
       where t.verein_id = p.verein_id and t.status <> 'beendet'
         and t.einstellungen::text like '%' || p_person::text || '%')
      then 'offen'
    when exists (
      select 1 from public.turniere t
       where t.verein_id = p.verein_id
         and (t.einstellungen #- '{liga,gegnerKader}')::text like '%' || p_person::text || '%')
      or exists (select 1 from public.turnier_anmeldungen x where x.person_id = p_person)
      or exists (select 1 from public.mannschaft_spieler x where x.person_id = p_person)
      or exists (select 1 from public.benutzer_personen x where x.person_id = p_person)
      or exists (select 1 from public.einladungen x where x.person_id = p_person)
      then 'gebunden'
  end
  from public.personen p where p.id = p_person;
$$;

revoke execute on function public.gast_bindung(uuid) from public, anon, authenticated;

-- Liste fuer die Vorschau: Gaeste ohne Spiel, angelegt im Zeitraum (beide Tage
-- eingeschlossen, deutsche Zeit); dazu, wie viele weitere bleiben muessen.
create function public.gaeste_ohne_spiel(p_verein uuid, p_von date, p_bis date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ergebnis jsonb;
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
    raise exception 'Gäste bereinigen darf nur der Vereins-Administrator.';
  end if;
  with g as (
    select p.id, p.vorname, p.nachname, p.anzeigename, p.erstellt_am, public.gast_bindung(p.id) as bindung
      from public.personen p
     where p.verein_id = p_verein and p.status = 'gast' and p.anonymisiert_am is null
       and (p.erstellt_am at time zone 'Europe/Berlin')::date between p_von and p_bis
  )
  select jsonb_build_object(
    'gaeste', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'vorname', g.vorname, 'nachname', g.nachname, 'anzeigename', g.anzeigename,
        'angelegt', (g.erstellt_am at time zone 'Europe/Berlin')::date,
        -- Herkunft: der Spieltag, in dessen Gegner-Kader der Gast steht
        'spieltag', (
          select t.name from public.turniere t
           where t.verein_id = p_verein and t.einstellungen -> 'liga' -> 'gegnerKader' ? g.id::text
           order by t.datum, t.erstellt_am limit 1),
        'gegner', (
          select t.einstellungen -> 'liga' ->> 'gegner' from public.turniere t
           where t.verein_id = p_verein and t.einstellungen -> 'liga' -> 'gegnerKader' ? g.id::text
           order by t.datum, t.erstellt_am limit 1),
        'ausPass', exists (
          select 1 from public.personen_intern i
           where i.person_id = g.id and (nullif(i.dbu_nummer, '') is not null or nullif(i.passnummer, '') is not null))
      ) order by g.nachname, g.vorname, g.erstellt_am)
      from g where g.bindung is null), '[]'::jsonb),
    'offen', (select count(*) from g where g.bindung = 'offen'),
    'gebunden', (select count(*) from g where g.bindung = 'gebunden')
  ) into v_ergebnis;
  return v_ergebnis;
end;
$$;

revoke execute on function public.gaeste_ohne_spiel(uuid, date, date) from public, anon;
grant execute on function public.gaeste_ohne_spiel(uuid, date, date) to authenticated;

-- Entfernt die genannten Gaeste, soweit sie (noch) entfernbar sind, und nimmt
-- sie aus dem Gegner-Kader beendeter Spieltage. Ergebnis: Zahl der entfernten.
create function public.gaeste_bereinigen(p_verein uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_weg   uuid[];
  v_namen text;
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
    raise exception 'Gäste bereinigen darf nur der Vereins-Administrator.';
  end if;

  select array_agg(p.id), string_agg(trim(p.vorname || ' ' || p.nachname), ', ' order by p.nachname, p.vorname)
    into v_weg, v_namen
    from public.personen p
   where p.id = any (p_ids) and p.verein_id = p_verein and p.status = 'gast' and p.anonymisiert_am is null
     and public.gast_bindung(p.id) is null;
  if v_weg is null then
    return 0;
  end if;

  update public.turniere t
     set einstellungen = jsonb_set(t.einstellungen, '{liga,gegnerKader}', coalesce((
           select jsonb_agg(x.wert order by x.nr)
             from jsonb_array_elements(t.einstellungen -> 'liga' -> 'gegnerKader') with ordinality as x(wert, nr)
            where not ((x.wert #>> '{}') = any (v_weg::text[]))), '[]'::jsonb))
   where t.verein_id = p_verein
     and jsonb_typeof(t.einstellungen -> 'liga' -> 'gegnerKader') = 'array'
     and t.einstellungen -> 'liga' -> 'gegnerKader' ?| v_weg::text[];

  -- vertrauliche Angaben, Einwilligungen und Rating-Stand gehen mit (Kaskade)
  delete from public.personen where id = any (v_weg);

  perform public.protokollieren('gaeste_bereinigt', p_verein, jsonb_build_object(
    'anzahl', cardinality(v_weg), 'gaeste', v_namen));

  return cardinality(v_weg);
end;
$$;

revoke execute on function public.gaeste_bereinigen(uuid, uuid[]) from public, anon;
grant execute on function public.gaeste_bereinigen(uuid, uuid[]) to authenticated;
