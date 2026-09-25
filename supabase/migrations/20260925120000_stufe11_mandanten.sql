-- =============================================================
--  Stufe 11: Mandanten, Phase 1 (docs/Mandanten.md)
--
--  1. Sperre wirksam: Rollen, Geraete und Einladungsrechte gelten nur in
--     einem aktiven Verein. Nur der Super-Admin aendert Status, Test-
--     Kennzeichen und Adresse (slug) eines Vereins.
--  2. Super-Admin sieht nur noch Kennzahlen: Vereinsdaten liest er nur
--     waehrend einer Support-Freigabe des Vereins-Administrators.
--  3. meine_vereine(): eigene Vereine samt Status, auch gesperrte.
--  4. Super-Admins verwalten, Vereine anlegen, sperren, entsperren.
--  5. system_protokoll: jede dieser Aktionen mit Zeit und Konto.
-- =============================================================

-- ---------- Vereine: Test-Kennzeichen und Sperrvermerk ----------

alter table public.vereine
  add column ist_test    boolean not null default false,
  add column gesperrt_am timestamptz,
  add column sperrgrund  text;

-- Status, Test-Kennzeichen und Adresse aendert nur der Super-Admin.
-- Aufrufe ohne Anmeldung (Serverfunktionen, Wartung) bleiben unberuehrt.
create function public.vereine_schutz() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.ist_systemadmin() and (
       new.aktiv is distinct from old.aktiv
    or new.ist_test is distinct from old.ist_test
    or new.gesperrt_am is distinct from old.gesperrt_am
    or new.sperrgrund is distinct from old.sperrgrund
    or new.slug is distinct from old.slug
  ) then
    raise exception 'Status, Test-Kennzeichen und Adresse eines Vereins ändert nur der Super-Admin.';
  end if;
  return new;
end;
$$;

create trigger vereine_schutz before update on public.vereine
  for each row execute function public.vereine_schutz();

-- ---------- Sperre in den Rechte-Funktionen ----------

create or replace function public.hat_rolle(p_verein uuid, p_rollen public.rolle[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.benutzer_rollen r
    join public.benutzer b on b.id = r.benutzer_id
    join public.vereine v on v.id = r.verein_id
    where r.benutzer_id = auth.uid() and b.aktiv and v.aktiv
      and r.verein_id = p_verein and r.rolle = any (p_rollen)
  );
$$;

-- Ein Tablet eines gesperrten Vereins gehoert zu keinem Verein mehr und
-- laeuft dadurch nur noch offline.
create or replace function public.geraet_verein() returns uuid
language sql stable security definer set search_path = ''
as $$
  select g.verein_id
  from public.geraete g
  join public.vereine v on v.id = g.verein_id
  where g.auth_id = auth.uid() and g.aktiv and v.aktiv;
$$;

create or replace function public.darf_einladen(p_verein uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.hat_rolle(p_verein, '{vereinsadmin,sportwart}')
      or exists (
        select 1
        from public.benutzer_rechte r
        join public.benutzer b on b.id = r.benutzer_id
        join public.vereine v on v.id = r.verein_id
        where r.benutzer_id = auth.uid() and b.aktiv and v.aktiv
          and r.verein_id = p_verein and r.darf_einladen
      );
$$;

create or replace function public.ist_eigene_person(p_person uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.benutzer_personen bp
    join public.vereine v on v.id = bp.verein_id
    where bp.benutzer_id = auth.uid() and bp.person_id = p_person and v.aktiv
  );
$$;

-- ---------- Protokoll der Super-Admin-Aktionen ----------

create table public.system_protokoll (
  id         bigint generated always as identity primary key,
  zeit       timestamptz not null default now(),
  benutzer_id uuid references public.benutzer (id) on delete set null,
  aktion     text not null,
  verein_id  uuid references public.vereine (id) on delete set null,
  details    jsonb not null default '{}'::jsonb
);
alter table public.system_protokoll enable row level security;
create policy protokoll_lesen on public.system_protokoll for select to authenticated
  using (public.ist_systemadmin());

create function public.protokollieren(p_aktion text, p_verein uuid, p_details jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.system_protokoll (benutzer_id, aktion, verein_id, details)
  values (auth.uid(), p_aktion, p_verein, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.protokollieren(text, uuid, jsonb) from public, anon, authenticated;

-- ---------- Support-Freigabe ----------

create table public.support_freigaben (
  id          bigint generated always as identity primary key,
  verein_id   uuid not null references public.vereine (id) on delete cascade,
  bis         timestamptz not null,
  erteilt_von uuid references public.benutzer (id) on delete set null,
  erteilt_am  timestamptz not null default now(),
  beendet_am  timestamptz
);
alter table public.support_freigaben enable row level security;
create policy freigaben_lesen on public.support_freigaben for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());

-- Darf der Super-Admin gerade in diesen Verein hineinsehen?
create function public.support_freigegeben(p_verein uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.ist_systemadmin() and exists (
    select 1 from public.support_freigaben f
    where f.verein_id = p_verein and f.beendet_am is null and f.bis > now()
  );
$$;

create function public.support_freigeben(p_verein uuid, p_tage integer) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_bis timestamptz := now() + make_interval(days => p_tage);
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
    raise exception 'Den Support-Zugang gibt nur der Vereins-Administrator frei.';
  end if;
  if p_tage not between 1 and 7 then
    raise exception 'Der Support-Zugang gilt 1 bis 7 Tage.';
  end if;
  update public.support_freigaben set beendet_am = now()
   where verein_id = p_verein and beendet_am is null;
  insert into public.support_freigaben (verein_id, bis, erteilt_von) values (p_verein, v_bis, auth.uid());
  perform public.protokollieren('support_freigegeben', p_verein, jsonb_build_object('bis', v_bis));
  return v_bis;
end;
$$;

create function public.support_beenden(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
    raise exception 'Den Support-Zugang beendet nur der Vereins-Administrator.';
  end if;
  update public.support_freigaben set beendet_am = now()
   where verein_id = p_verein and beendet_am is null;
  perform public.protokollieren('support_beendet', p_verein, '{}'::jsonb);
end;
$$;

-- ---------- Lese-Regeln: Super-Admin nur mit Freigabe ----------

drop policy aenderungen_lesen on public.aenderungen;
create policy aenderungen_lesen on public.aenderungen for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.support_freigegeben(verein_id)
         or (tabelle = any (array['partien', 'turniere', 'turnier_teilnehmer'])
             and public.hat_rolle(verein_id, '{sportwart,turnierleiter}')));

drop policy a141_lesen on public.aufnahmen_141;
create policy a141_lesen on public.aufnahmen_141 for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}') or public.support_freigegeben(verein_id)
         or exists (select 1 from public.partien p
                    where p.id = aufnahmen_141.partie_id
                      and (public.ist_eigene_person(p.spieler_a) or public.ist_eigene_person(p.spieler_b))));

drop policy p141_lesen on public.partien_141;
create policy p141_lesen on public.partien_141 for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}') or public.support_freigegeben(verein_id)
         or exists (select 1 from public.partien p
                    where p.id = partien_141.partie_id
                      and (public.ist_eigene_person(p.spieler_a) or public.ist_eigene_person(p.spieler_b))));

drop policy bp_lesen on public.benutzer_personen;
create policy bp_lesen on public.benutzer_personen for select to authenticated
  using (benutzer_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin}') or public.support_freigegeben(verein_id));

drop policy rechte_lesen on public.benutzer_rechte;
create policy rechte_lesen on public.benutzer_rechte for select to authenticated
  using (benutzer_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin}') or public.support_freigegeben(verein_id));

drop policy rechte_schreiben on public.benutzer_rechte;
create policy rechte_schreiben on public.benutzer_rechte for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin}'));

drop policy geraete_lesen on public.geraete;
create policy geraete_lesen on public.geraete for select to authenticated
  using (auth_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin,turnierleiter}') or public.support_freigegeben(verein_id));

drop policy pi_lesen on public.personen_intern;
create policy pi_lesen on public.personen_intern for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}') or public.support_freigegeben(verein_id));

-- Die Tabellen, die jedes Vereinsmitglied lesen darf
do $$
declare
  eintrag record;
begin
  for eintrag in
    select * from (values
      ('live_stand', 'live_lesen'),
      ('mannschaft_spieler', 'mannschaft_spieler_lesen'),
      ('mannschaften', 'mannschaften_lesen'),
      ('partien', 'partien_lesen'),
      ('personen', 'personen_lesen'),
      ('rating_einstellungen', 'rating_einstellungen_lesen'),
      ('rating_stand', 'rating_stand_lesen'),
      ('serien', 'serien_lesen'),
      ('tische', 'tische_lesen'),
      ('turnier_teilnehmer', 'teilnehmer_lesen'),
      ('turniere', 'turniere_lesen')
    ) as t(tabelle, regel)
  loop
    execute format('drop policy %I on public.%I', eintrag.regel, eintrag.tabelle);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (public.ist_im_verein(verein_id) or public.support_freigegeben(verein_id))',
      eintrag.regel, eintrag.tabelle);
  end loop;
end;
$$;

-- ---------- Eigene Vereine, auch gesperrte ----------

create function public.meine_vereine()
returns table (id uuid, name text, kurzname text, logo_url text, aktiv boolean, sperrgrund text, rollen public.rolle[])
language sql stable security definer set search_path = ''
as $$
  select v.id, v.name, v.kurzname, v.logo_url, v.aktiv, v.sperrgrund, array_agg(r.rolle order by r.rolle)
  from public.benutzer_rollen r
  join public.benutzer b on b.id = r.benutzer_id and b.aktiv
  join public.vereine v on v.id = r.verein_id
  where r.benutzer_id = auth.uid()
  group by v.id
  order by v.name;
$$;

-- ---------- Super-Admin: Konten und Vereine ----------

-- Ein vorhandenes Konto (per E-Mail) zum Super-Admin machen oder es zuruecknehmen.
-- Der letzte aktive Super-Admin bleibt.
create function public.systemadmin_setzen(p_email text, p_ja boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_konto uuid;
begin
  if not public.ist_systemadmin() then
    raise exception 'Das darf nur ein Super-Admin.';
  end if;
  select b.id into v_konto from public.benutzer b where lower(b.email) = lower(btrim(p_email));
  if v_konto is null then
    raise exception 'Zu dieser Adresse gibt es kein Konto. Die Person muss sich zuerst einmal anmelden oder eingeladen werden.';
  end if;
  if not p_ja and (select count(*) from public.benutzer where systemadmin and aktiv and id <> v_konto) = 0 then
    raise exception 'Der letzte Super-Admin kann nicht entfernt werden.';
  end if;
  update public.benutzer set systemadmin = p_ja where id = v_konto;
  perform public.protokollieren(case when p_ja then 'systemadmin_ernannt' else 'systemadmin_entzogen' end,
                                null, jsonb_build_object('email', lower(btrim(p_email))));
end;
$$;

create function public.verein_anlegen(p_name text, p_kurzname text, p_slug text, p_test boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine legt nur ein Super-Admin an.';
  end if;
  if length(btrim(p_name)) < 2 then
    raise exception 'Der Verein braucht einen Namen.';
  end if;
  -- wie die Regel vereine_slug_check, nur mit verstaendlicher Meldung
  if p_slug !~ '^[a-z0-9-]{2,30}$' then
    raise exception 'Die Adresse besteht aus 2 bis 30 Kleinbuchstaben, Ziffern und Bindestrichen.';
  end if;
  insert into public.vereine (name, kurzname, slug, ist_test)
  values (btrim(p_name), coalesce(nullif(btrim(p_kurzname), ''), btrim(p_name)), p_slug, coalesce(p_test, false))
  returning id into v_id;
  perform public.protokollieren('verein_angelegt', v_id,
                                jsonb_build_object('name', btrim(p_name), 'slug', p_slug, 'test', coalesce(p_test, false)));
  return v_id;
end;
$$;

create function public.verein_sperren(p_verein uuid, p_grund text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine sperrt nur ein Super-Admin.';
  end if;
  update public.vereine
     set aktiv = false, gesperrt_am = now(), sperrgrund = nullif(btrim(p_grund), '')
   where id = p_verein;
  perform public.protokollieren('verein_gesperrt', p_verein, jsonb_build_object('grund', p_grund));
end;
$$;

create function public.verein_entsperren(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Vereine entsperrt nur ein Super-Admin.';
  end if;
  update public.vereine set aktiv = true, gesperrt_am = null, sperrgrund = null where id = p_verein;
  perform public.protokollieren('verein_entsperrt', p_verein, '{}'::jsonb);
end;
$$;

-- ---------- Ausfuehrungsrechte ----------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.support_freigegeben(uuid)',
    'public.support_freigeben(uuid, integer)',
    'public.support_beenden(uuid)',
    'public.meine_vereine()',
    'public.systemadmin_setzen(text, boolean)',
    'public.verein_anlegen(text, text, text, boolean)',
    'public.verein_sperren(uuid, text)',
    'public.verein_entsperren(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke execute on function public.vereine_schutz() from public, anon, authenticated;
