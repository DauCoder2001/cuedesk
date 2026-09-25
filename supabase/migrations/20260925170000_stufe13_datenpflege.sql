-- =============================================================
--  Stufe 13: Mandanten, Phase 3 - Datenpflege (docs/Mandanten.md)
--
--  1. Export: alle Daten eines Vereins als JSON. Der Vereins-Admin
--     jederzeit, der Super-Admin nur bei einem gesperrten Verein.
--  2. Loeschen: gesperrt + Export -> vormerken, 30 Tage spaeter loescht
--     ein naechtlicher Lauf. Test-Vereine auch sofort.
--  3. Aufraeumen mit Vorschau: erst zaehlen, dann ausgewaehlte Arten
--     loeschen.
--  4. Demo zuruecksetzen: Inhalte eines Test-Vereins weg, Beispieldaten
--     neu.
-- =============================================================

alter table public.vereine
  add column export_am   timestamptz,   -- letzter Export, egal von wem
  add column loeschen_ab date;          -- vorgemerkt: ab diesem Tag weg

-- loeschen_ab aendert nur der Super-Admin (wie Status und Adresse).
create or replace function public.vereine_schutz() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.ist_systemadmin() and (
       new.aktiv is distinct from old.aktiv
    or new.ist_test is distinct from old.ist_test
    or new.gesperrt_am is distinct from old.gesperrt_am
    or new.sperrgrund is distinct from old.sperrgrund
    or new.slug is distinct from old.slug
    or new.loeschen_ab is distinct from old.loeschen_ab
  ) then
    raise exception 'Status, Test-Kennzeichen und Adresse eines Vereins ändert nur der Super-Admin.';
  end if;
  return new;
end;
$$;

-- Beim Loeschen eines ganzen Vereins darf auch die eigene Admin-Rolle weg.
create or replace function public.admin_selbstsperre() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('cuedesk.verein_loeschen', true) = 'an' then
    return old;
  end if;
  if old.rolle = 'vereinsadmin' and old.benutzer_id = auth.uid() then
    raise exception 'Die Rolle Vereins-Administrator kann man sich nicht selbst entziehen.';
  end if;
  return old;
end;
$$;

-- Entsperren hebt eine vorgemerkte Loeschung mit auf.
create or replace function public.verein_entsperren(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine entsperrt nur ein Super-Admin.';
  end if;
  update public.vereine
     set aktiv = true, gesperrt_am = null, sperrgrund = null, loeschen_ab = null
   where id = p_verein;
  perform public.protokollieren('verein_entsperrt', p_verein, '{}'::jsonb);
end;
$$;

-- ---------- 1. Export ----------

create function public.verein_export(p_verein uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_verein public.vereine;
  v_daten  jsonb := '{}'::jsonb;
  v_teil   jsonb;
  t        text;
begin
  select * into v_verein from public.vereine where id = p_verein;
  if v_verein.id is null then
    raise exception 'Verein nicht gefunden.';
  end if;
  if not (public.hat_rolle(p_verein, '{vereinsadmin}')
          or (public.ist_systemadmin() and not v_verein.aktiv)) then
    raise exception 'Exportieren darf der Vereins-Administrator, der Super-Admin nur bei einem gesperrten Verein.';
  end if;

  -- Alles, was an verein_id haengt - ohne Aenderungsprotokoll und Tischstaende.
  foreach t in array array[
    'personen', 'personen_intern', 'tische', 'serien', 'turniere', 'turnier_teilnehmer',
    'partien', 'partien_141', 'aufnahmen_141', 'rating_einstellungen', 'rating_stand',
    'mannschaften', 'mannschaft_spieler', 'benutzer_rechte', 'benutzer_personen', 'einladungen'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.verein_id = $1', t)
      into v_teil using p_verein;
    v_daten := v_daten || jsonb_build_object(t, v_teil);
  end loop;

  -- Konten nur mit E-Mail, Name und Rollen im Verein
  v_daten := v_daten || jsonb_build_object('konten', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', b.email, 'anzeigename', b.anzeigename,
             'rollen', (select jsonb_agg(r.rolle order by r.rolle) from public.benutzer_rollen r
                         where r.benutzer_id = b.id and r.verein_id = p_verein))), '[]'::jsonb)
      from public.benutzer b
     where exists (select 1 from public.benutzer_rollen r where r.benutzer_id = b.id and r.verein_id = p_verein)));

  -- Tablets ohne ihre Anmeldekennung
  v_daten := v_daten || jsonb_build_object('geraete', (
    select coalesce(jsonb_agg(to_jsonb(g) - 'auth_id'), '[]'::jsonb)
      from public.geraete g where g.verein_id = p_verein));

  update public.vereine set export_am = now() where id = p_verein;
  perform public.protokollieren('verein_exportiert', p_verein, '{}'::jsonb);

  return jsonb_build_object(
    'format', 'cuedesk-export',
    'version', 1,
    'erstellt', now(),
    'verein', to_jsonb(v_verein) - 'export_am' - 'loeschen_ab',
    'daten', v_daten
  );
end;
$$;

-- ---------- 2. Loeschen ----------

-- Intern: loescht einen Verein mit allem, was an ihm haengt. Nur fuer den
-- naechtlichen Lauf und verein_sofort_loeschen - kein direkter Aufruf.
create function public.verein_endgueltig_loeschen(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name   text;
  v_konten uuid[];
  v_tablets uuid[];
begin
  select name into v_name from public.vereine where id = p_verein;
  if v_name is null then
    return;
  end if;
  perform set_config('cuedesk.verein_loeschen', 'an', true);

  -- Konten, die nur hier eine Rolle haben und kein Super-Admin sind
  select coalesce(array_agg(distinct r.benutzer_id), '{}') into v_konten
    from public.benutzer_rollen r join public.benutzer b on b.id = r.benutzer_id
   where r.verein_id = p_verein and not b.systemadmin
     and not exists (select 1 from public.benutzer_rollen x
                      where x.benutzer_id = r.benutzer_id and x.verein_id <> p_verein);
  select coalesce(array_agg(auth_id), '{}') into v_tablets
    from public.geraete where verein_id = p_verein and auth_id is not null;

  -- Reihenfolge wegen der Verweise mit "on delete restrict"
  delete from public.live_stand          where verein_id = p_verein;
  delete from public.aufnahmen_141       where verein_id = p_verein;
  delete from public.partien_141         where verein_id = p_verein;
  delete from public.partien             where verein_id = p_verein;
  delete from public.turnier_teilnehmer  where verein_id = p_verein;
  delete from public.turniere            where verein_id = p_verein;
  delete from public.serien              where verein_id = p_verein;
  delete from public.mannschaft_spieler  where verein_id = p_verein;
  delete from public.mannschaften        where verein_id = p_verein;
  delete from public.rating_stand        where verein_id = p_verein;
  delete from public.rating_einstellungen where verein_id = p_verein;
  delete from public.benutzer_personen   where verein_id = p_verein;
  delete from public.einladungen         where verein_id = p_verein;
  delete from public.benutzer_rechte     where verein_id = p_verein;
  delete from public.benutzer_rollen     where verein_id = p_verein;
  delete from public.personen_intern     where verein_id = p_verein;
  delete from public.personen            where verein_id = p_verein;
  delete from public.geraete             where verein_id = p_verein;
  delete from public.tische              where verein_id = p_verein;
  delete from public.vereine             where id = p_verein;   -- Schutzwort, Freigaben per cascade

  delete from auth.users where id = any(v_konten) or id = any(v_tablets);
  -- zuletzt: auch die Eintraege, die das Loeschen eben selbst erzeugt hat
  delete from public.aenderungen where verein_id = p_verein;

  perform public.protokollieren('verein_geloescht', null,
    jsonb_build_object('name', v_name, 'verein', p_verein, 'konten', cardinality(v_konten)));
end;
$$;

create function public.verein_loeschen_vormerken(p_verein uuid) returns date
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vereine;
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine löscht nur ein Super-Admin.';
  end if;
  select * into v from public.vereine where id = p_verein;
  if v.aktiv then
    raise exception 'Erst sperren, dann löschen.';
  end if;
  if v.export_am is null or v.export_am < v.gesperrt_am then
    raise exception 'Vor dem Löschen die Daten exportieren.';
  end if;
  update public.vereine set loeschen_ab = current_date + 30 where id = p_verein;
  perform public.protokollieren('loeschung_vorgemerkt', p_verein,
                                jsonb_build_object('ab', current_date + 30));
  return current_date + 30;
end;
$$;

create function public.verein_loeschen_abbrechen(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur für Super-Admins.';
  end if;
  update public.vereine set loeschen_ab = null where id = p_verein;
  perform public.protokollieren('loeschung_abgebrochen', p_verein, '{}'::jsonb);
end;
$$;

-- Test-Vereine ohne Frist; der Name muss zur Bestaetigung stimmen.
create function public.verein_sofort_loeschen(p_verein uuid, p_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vereine;
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine löscht nur ein Super-Admin.';
  end if;
  select * into v from public.vereine where id = p_verein;
  if not v.ist_test then
    raise exception 'Sofort löschen geht nur bei Test-Vereinen.';
  end if;
  if v.aktiv then
    raise exception 'Erst sperren, dann löschen.';
  end if;
  if btrim(p_name) is distinct from v.name then
    raise exception 'Der Name stimmt nicht.';
  end if;
  perform public.verein_endgueltig_loeschen(p_verein);
end;
$$;

-- Naechtlicher Lauf
create function public.vereine_loeschen_faellig() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  n    integer := 0;
begin
  for v_id in
    select id from public.vereine where not aktiv and loeschen_ab <= current_date
  loop
    perform public.verein_endgueltig_loeschen(v_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('vereine-loeschen', '0 3 * * *', 'select public.vereine_loeschen_faellig()');

-- ---------- 3. Aufraeumen ----------

-- Eine Stelle fuer die Regeln, damit Vorschau und Ausfuehrung gleich zaehlen.
create function public.aufraeumen_intern(p_ausfuehren boolean, p_arten text[]) returns jsonb
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

  -- Rueckmeldungen der Sicherung aelter als ein Jahr
  if p_ausfuehren and 'ereignisse' = any(p_arten) then
    delete from public.system_ereignisse where zeit < now() - interval '1 year';
  end if;
  select count(*) into n from public.system_ereignisse where zeit < now() - interval '1 year';
  v := v || jsonb_build_object('ereignisse', n);

  return v;
end;
$$;

create function public.aufraeumen_vorschau() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur für Super-Admins.';
  end if;
  return public.aufraeumen_intern(false, '{}');
end;
$$;

-- Liefert die Zahlen vorher; danach ruft die Oberflaeche die Vorschau neu ab.
create function public.aufraeumen(p_arten text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_vorher jsonb;
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur für Super-Admins.';
  end if;
  v_vorher := public.aufraeumen_intern(false, '{}');
  perform public.aufraeumen_intern(true, p_arten);
  perform public.protokollieren('aufgeraeumt', null,
    (select jsonb_object_agg(k, v_vorher -> k) from unnest(p_arten) k));
  return v_vorher;
end;
$$;

-- ---------- 4. Demo zuruecksetzen ----------

-- Inhalte eines Test-Vereins weg, Beispieldaten neu. Konten, Rollen,
-- Tablets, Tische und Einstellungen bleiben; Personen mit Konto auch.
create function public.demo_zuruecksetzen(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_personen uuid[] := '{}';
  v_id       uuid;
  v_turnier  uuid;
  v_tische   uuid[];
  v_vor      text[] := array['Anna','Bernd','Carla','Dirk','Elke','Frank','Greta','Hauke','Ines','Jens','Kerstin','Lars'];
  v_nach     text[] := array['Albers','Brandt','Claussen','Dierks','Ehlers','Fricke','Garbers','Hollmann','Imken','Janssen','Kruse','Lüdemann'];
  v_start    int[]  := array[720, 690, 660, 640, 610, 590, 560, 540, 520, 500, 470, 450];
  i int; j int; r int; k int;
  a int; b int; n int := 6;
  v_kreis int[];
  v_sieger int; v_rest int;
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur für Super-Admins.';
  end if;
  if not exists (select 1 from public.vereine where id = p_verein and ist_test) then
    raise exception 'Demo zurücksetzen geht nur bei Test-Vereinen.';
  end if;

  delete from public.live_stand          where verein_id = p_verein;
  delete from public.aufnahmen_141       where verein_id = p_verein;
  delete from public.partien_141         where verein_id = p_verein;
  delete from public.partien             where verein_id = p_verein;
  delete from public.turnier_teilnehmer  where verein_id = p_verein;
  delete from public.turniere            where verein_id = p_verein;
  delete from public.serien              where verein_id = p_verein;
  delete from public.mannschaft_spieler  where verein_id = p_verein;
  delete from public.mannschaften        where verein_id = p_verein;
  delete from public.rating_stand        where verein_id = p_verein;
  delete from public.einladungen         where verein_id = p_verein and angenommen_am is null;
  delete from public.personen p
   where p.verein_id = p_verein
     and not exists (select 1 from public.benutzer_personen bp where bp.person_id = p.id);
  delete from public.aenderungen where verein_id = p_verein;

  -- 12 erfundene Spieler, die letzten zwei als Gaeste
  for i in 1..12 loop
    insert into public.personen (verein_id, vorname, nachname, status, name_oeffentlich)
    values (p_verein, v_vor[i], v_nach[i], case when i > 10 then 'gast' else 'mitglied' end, true)
    returning id into v_id;
    insert into public.personen_intern (person_id, verein_id, eintritt, rating_startwert)
    values (v_id, p_verein, current_date - (i * 97), v_start[i]);
    v_personen := v_personen || v_id;
  end loop;

  -- Tische nur, wenn es noch keine gibt
  if not exists (select 1 from public.tische where verein_id = p_verein) then
    insert into public.tische (verein_id, nummer, bezeichnung)
    select p_verein, x, 'Tisch ' || x from generate_series(1, 4) x;
  end if;
  select array_agg(id order by nummer) into v_tische from public.tische where verein_id = p_verein;

  -- Beendetes 8-Ball-Turnier: 6 Spieler, jeder gegen jeden, Race to 4
  insert into public.turniere (verein_id, name, datum, disziplin, modus, status, rating_werten,
                               eingefroren_am, teilnehmerzahl, einstellungen)
  values (p_verein, 'Demo-Turnier 8-Ball', current_date - 14, '8-ball', 'einzelgruppe', 'beendet', true,
          now() - interval '14 days', n,
          '{"raceTo": 4, "vorgabe": {"aktiv": false, "staerke": 75, "obergrenze": 0}}'::jsonb)
  returning id into v_turnier;
  for i in 1..n loop
    insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id, startnummer,
                                           rating_eingefroren, rating_quelle)
    values (v_turnier, v_personen[i], p_verein, i, v_start[i], 'startwert');
  end loop;

  -- Rundenplan nach dem Kreisverfahren; meist gewinnt der Staerkere,
  -- jedes vierte Spiel ist eine Ueberraschung.
  v_kreis := array[1, 2, 3, 4, 5, 6];
  for r in 1..n - 1 loop
    for k in 1..n / 2 loop
      a := v_kreis[k];
      b := v_kreis[n + 1 - k];
      v_sieger := case when (a + b + r) % 4 = 0 then greatest(a, b) else least(a, b) end;
      v_rest := (a * 7 + b * 3 + r) % 4;
      insert into public.partien (verein_id, turnier_id, disziplin, datum, phase, runde, paarung, tisch_id,
                                  spieler_a, spieler_b, race_to, ergebnis_a, ergebnis_b, status,
                                  rating_werten, begonnen, beendet)
      values (p_verein, v_turnier, '8-ball', current_date - 14, 'gruppe', r, k, v_tische[1 + (k - 1) % cardinality(v_tische)],
              v_personen[a], v_personen[b], 4,
              case when v_sieger = a then 4 else v_rest end,
              case when v_sieger = b then 4 else v_rest end,
              'beendet', true,
              (current_date - 14) + time '19:00' + (r * interval '40 minutes'),
              (current_date - 14) + time '19:30' + (r * interval '40 minutes'));
    end loop;
    -- Kreis drehen, der erste bleibt stehen
    v_kreis := array[v_kreis[1], v_kreis[n]] || v_kreis[2:n - 1];
  end loop;

  -- Endplaetze nach Siegen, dann Spieldifferenz
  update public.turnier_teilnehmer t set endplatz = s.platz
    from (
      select x.person_id, row_number() over (order by sum(x.sieg) desc, sum(x.diff) desc) as platz
        from (
          select spieler_a as person_id, (ergebnis_a > ergebnis_b)::int as sieg, ergebnis_a - ergebnis_b as diff
            from public.partien where turnier_id = v_turnier
          union all
          select spieler_b, (ergebnis_b > ergebnis_a)::int, ergebnis_b - ergebnis_a
            from public.partien where turnier_id = v_turnier
        ) x group by x.person_id
    ) s
   where t.turnier_id = v_turnier and t.person_id = s.person_id;

  -- Geplantes 9-Ball-Turnier zum Ausprobieren, 8 Anmeldungen
  insert into public.turniere (verein_id, name, datum, disziplin, modus, status, einstellungen)
  values (p_verein, 'Demo-Turnier 9-Ball', current_date + 7, '9-ball', 'einzelgruppe', 'geplant',
          '{"raceTo": 5, "vorgabe": {"aktiv": true, "staerke": 75, "obergrenze": 0}}'::jsonb)
  returning id into v_turnier;
  for i in 3..10 loop
    insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id)
    values (v_turnier, v_personen[i], p_verein);
  end loop;

  perform public.protokollieren('demo_zurueckgesetzt', p_verein, '{}'::jsonb);
end;
$$;

-- ---------- Ausfuehrungsrechte ----------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.verein_export(uuid)',
    'public.verein_loeschen_vormerken(uuid)',
    'public.verein_loeschen_abbrechen(uuid)',
    'public.verein_sofort_loeschen(uuid, text)',
    'public.aufraeumen_vorschau()',
    'public.aufraeumen(text[])',
    'public.demo_zuruecksetzen(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- nur intern
  foreach f in array array[
    'public.verein_endgueltig_loeschen(uuid)',
    'public.vereine_loeschen_faellig()',
    'public.aufraeumen_intern(boolean, text[])'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
