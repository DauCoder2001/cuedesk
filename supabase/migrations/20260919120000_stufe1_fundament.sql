-- =============================================================
--  Pool-Club, Stufe 1: Fundament
--  Vereine, Benutzer, Rollen, Einladungen, Personen, Tische,
--  Geraete mit Kopplung, Aenderungsprotokoll.
--
--  Grundregel: Jede Tabelle mit Vereinsdaten traegt verein_id.
--  Die Rechte (Row Level Security) erlauben Zugriff nur auf
--  Vereine, in denen der Benutzer eine Rolle hat.
-- =============================================================

-- ---------- Aufzaehlungen ----------

create type public.rolle as enum ('vereinsadmin', 'sportwart', 'turnierleiter', 'mitglied');
create type public.personen_status as enum ('mitglied', 'gast', 'ausgetreten');

-- ---------- Tabellen ----------

create table public.vereine (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kurzname     text not null,
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,30}$'),   -- Teil der Adresse, z.B. /verden
  logo_url     text,
  farbe        text check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  aktiv        boolean not null default true,
  erstellt_am  timestamptz not null default now()
);

-- Ein Eintrag je angemeldetem Konto (anonyme Geraete-Konten ausgenommen).
create table public.benutzer (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  anzeigename  text,
  systemadmin  boolean not null default false,
  aktiv        boolean not null default true,
  erstellt_am  timestamptz not null default now()
);

create table public.benutzer_rollen (
  benutzer_id  uuid not null references public.benutzer (id) on delete cascade,
  verein_id    uuid not null references public.vereine (id) on delete restrict,
  rolle        public.rolle not null,
  primary key (benutzer_id, verein_id, rolle)
);

create table public.personen (
  id                uuid primary key default gen_random_uuid(),
  verein_id         uuid not null references public.vereine (id) on delete restrict,
  vorname           text not null,
  nachname          text not null,
  anzeigename       text,
  kuerzel           text,
  status            public.personen_status not null default 'mitglied',
  name_oeffentlich  boolean not null default false,   -- Einwilligung: Name in oeffentlichen Ansichten
  erstellt_am       timestamptz not null default now(),
  geaendert_am      timestamptz not null default now(),
  unique (verein_id, id)                              -- Ziel fuer vereinsgebundene Fremdschluessel
);

-- Vertrauliche Felder getrennt, damit Mitglieder und Tablets die Namensliste
-- lesen koennen, ohne Notiz, Startwert oder den Merker "minderjaehrig" zu sehen.
create table public.personen_intern (
  person_id         uuid primary key references public.personen (id) on delete cascade,
  verein_id         uuid not null,
  eintritt          date,
  austritt          date,
  minderjaehrig     boolean not null default false,
  rating_startwert  integer check (rating_startwert between 100 and 1000),
  notiz             text,
  foreign key (verein_id, person_id) references public.personen (verein_id, id) on delete cascade
);

-- Verknuepft ein Konto je Verein mit genau einem Personeneintrag.
create table public.benutzer_personen (
  benutzer_id  uuid not null references public.benutzer (id) on delete cascade,
  verein_id    uuid not null,
  person_id    uuid not null unique,
  primary key (benutzer_id, verein_id),
  foreign key (verein_id, person_id) references public.personen (verein_id, id) on delete cascade
);

-- Einladung per E-Mail. Meldet sich jemand mit dieser Adresse an
-- (oder ist schon angemeldet), werden Rollen und Person zugeordnet.
create table public.einladungen (
  id              uuid primary key default gen_random_uuid(),
  verein_id       uuid not null references public.vereine (id) on delete restrict,
  email           text not null check (email = lower(email)),
  rollen          public.rolle[] not null default '{mitglied}',
  person_id       uuid,
  eingeladen_von  uuid references public.benutzer (id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  angenommen_am   timestamptz,
  unique (verein_id, email),
  foreign key (verein_id, person_id) references public.personen (verein_id, id) on delete set null (person_id)
);

create table public.tische (
  id           uuid primary key default gen_random_uuid(),
  verein_id    uuid not null references public.vereine (id) on delete restrict,
  nummer       integer not null check (nummer > 0),
  bezeichnung  text,
  aktiv        boolean not null default true,
  unique (verein_id, nummer),
  unique (verein_id, id)
);

-- Tablets und TV. Jedes Geraet meldet sich anonym an und wird vom
-- Vereins-Administrator per Kopplungscode einem Verein (und Tisch) zugeordnet.
create table public.geraete (
  id               uuid primary key default gen_random_uuid(),
  verein_id        uuid not null references public.vereine (id) on delete restrict,
  auth_id          uuid not null unique references auth.users (id) on delete cascade,
  name             text not null,
  tisch_id         uuid,
  aktiv            boolean not null default true,
  zuletzt_gesehen  timestamptz,
  erstellt_am      timestamptz not null default now(),
  foreign key (verein_id, tisch_id) references public.tische (verein_id, id) on delete set null (tisch_id)
);

-- Offene Kopplungsanfragen. Absichtlich ohne Policy: der Zugriff laeuft
-- ausschliesslich ueber kopplung_anfordern() und geraet_koppeln().
create table public.kopplungen (
  code         text primary key check (code ~ '^[A-Z0-9]{6}$'),
  auth_id      uuid not null unique references auth.users (id) on delete cascade,
  erstellt_am  timestamptz not null default now()
);

create table public.aenderungen (
  id            bigint generated always as identity primary key,
  zeitpunkt     timestamptz not null default now(),
  benutzer_id   uuid,
  verein_id     uuid,
  tabelle       text not null,
  datensatz_id  text,
  aktion        text not null,     -- insert, update, delete
  vorher        jsonb,
  nachher       jsonb
);
create index aenderungen_verein_zeit on public.aenderungen (verein_id, zeitpunkt desc);

-- ---------- Hilfsfunktionen fuer die Rechte ----------
-- security definer: lesen die Rollentabellen ohne selbst an RLS zu scheitern.

create function public.ist_systemadmin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select b.systemadmin and b.aktiv from public.benutzer b where b.id = auth.uid()), false);
$$;

create function public.hat_rolle(p_verein uuid, p_rollen public.rolle[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.benutzer_rollen r
    join public.benutzer b on b.id = r.benutzer_id
    where r.benutzer_id = auth.uid() and b.aktiv
      and r.verein_id = p_verein and r.rolle = any (p_rollen)
  );
$$;

-- Verein des angemeldeten Geraets (null, wenn kein gekoppeltes Geraet).
create function public.geraet_verein() returns uuid
language sql stable security definer set search_path = ''
as $$
  select g.verein_id from public.geraete g where g.auth_id = auth.uid() and g.aktiv;
$$;

-- Irgendeine Rolle im Verein oder gekoppeltes Geraet des Vereins.
create function public.ist_im_verein(p_verein uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.hat_rolle(p_verein, '{vereinsadmin,sportwart,turnierleiter,mitglied}')
      or public.geraet_verein() = p_verein;
$$;

-- ---------- Einladungen uebernehmen ----------

create function public.einladungen_uebernehmen(p_benutzer uuid, p_email text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e record;
begin
  for e in
    select * from public.einladungen
    where email = lower(p_email) and angenommen_am is null
  loop
    insert into public.benutzer_rollen (benutzer_id, verein_id, rolle)
      select p_benutzer, e.verein_id, unnest(e.rollen)
      on conflict do nothing;
    if e.person_id is not null then
      insert into public.benutzer_personen (benutzer_id, verein_id, person_id)
        values (p_benutzer, e.verein_id, e.person_id)
        on conflict do nothing;
    end if;
    update public.einladungen set angenommen_am = now() where id = e.id;
  end loop;
end;
$$;
revoke execute on function public.einladungen_uebernehmen(uuid, text) from public, anon, authenticated;

-- Neues Konto: Benutzereintrag anlegen und offene Einladungen einloesen.
create function public.neues_konto() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;                        -- Geraete-Konten bekommen keinen Benutzereintrag
  end if;
  insert into public.benutzer (id, email) values (new.id, lower(new.email))
    on conflict (id) do nothing;
  perform public.einladungen_uebernehmen(new.id, new.email);
  return new;
end;
$$;
create trigger neues_konto after insert on auth.users
  for each row execute function public.neues_konto();

-- Neue Einladung fuer ein schon bestehendes Konto: sofort einloesen.
create function public.einladung_sofort() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_benutzer uuid;
begin
  select id into v_benutzer from public.benutzer where email = new.email;
  if v_benutzer is not null then
    perform public.einladungen_uebernehmen(v_benutzer, new.email);
  end if;
  return new;
end;
$$;
create trigger einladung_sofort after insert on public.einladungen
  for each row execute function public.einladung_sofort();

-- ---------- Geraete-Kopplung ----------

-- Vom Tablet aufgerufen (anonym angemeldet): liefert einen 6-stelligen Code,
-- den das Tablet als Text und QR-Code anzeigt.
create function public.kopplung_anfordern() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  delete from public.kopplungen where erstellt_am < now() - interval '15 minutes';
  loop
    -- ohne 0/O und 1/I, damit der Code beim Abtippen eindeutig ist
    v_code := substr(translate(upper(encode(extensions.gen_random_bytes(8), 'base64')), '+/=0O1I', ''), 1, 6);
    exit when length(v_code) = 6 and not exists (select 1 from public.kopplungen where code = v_code);
  end loop;
  insert into public.kopplungen (code, auth_id) values (v_code, auth.uid())
    on conflict (auth_id) do update set code = excluded.code, erstellt_am = now();
  return v_code;
end;
$$;

-- Vom Vereins-Administrator aufgerufen: koppelt das Geraet mit dem Code.
create function public.geraet_koppeln(p_code text, p_verein uuid, p_name text, p_tisch uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_auth uuid;
  v_id   uuid;
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
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

-- Vom Geraet regelmaessig aufgerufen: "ich bin noch da".
create function public.geraet_meldet_sich() returns void
language sql security definer set search_path = ''
as $$
  update public.geraete set zuletzt_gesehen = now() where auth_id = auth.uid();
$$;

-- ---------- Aenderungsprotokoll ----------

create function public.aenderung_protokollieren() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_alt jsonb;
  v_neu jsonb;
  v_satz jsonb;
begin
  if tg_op <> 'INSERT' then v_alt := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_neu := to_jsonb(new); end if;
  v_satz := coalesce(v_neu, v_alt);
  insert into public.aenderungen (benutzer_id, verein_id, tabelle, datensatz_id, aktion, vorher, nachher)
  values (
    auth.uid(),
    case when tg_table_name = 'vereine' then (v_satz ->> 'id')::uuid else (v_satz ->> 'verein_id')::uuid end,
    tg_table_name,
    coalesce(v_satz ->> 'id', v_satz ->> 'benutzer_id'),
    lower(tg_op),
    v_alt,
    v_neu
  );
  return coalesce(new, old);
end;
$$;

create trigger protokoll after insert or update or delete on public.vereine
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.benutzer_rollen
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.benutzer_personen
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.einladungen
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.personen
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.personen_intern
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.tische
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.geraete
  for each row execute function public.aenderung_protokollieren();

-- geaendert_am bei Personen mitfuehren
create function public.geaendert_am_setzen() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;
create trigger geaendert_am before update on public.personen
  for each row execute function public.geaendert_am_setzen();

-- ---------- Row Level Security ----------

alter table public.vereine            enable row level security;
alter table public.benutzer           enable row level security;
alter table public.benutzer_rollen    enable row level security;
alter table public.personen           enable row level security;
alter table public.personen_intern    enable row level security;
alter table public.benutzer_personen  enable row level security;
alter table public.einladungen        enable row level security;
alter table public.tische             enable row level security;
alter table public.geraete            enable row level security;
alter table public.kopplungen         enable row level security;   -- ohne Policy: kein direkter Zugriff
alter table public.aenderungen        enable row level security;

-- Vereine: aktive Vereine sind oeffentlich lesbar (Vereinsauswahl).
create policy vereine_lesen on public.vereine for select to anon, authenticated
  using (aktiv or public.ist_systemadmin());
create policy vereine_anlegen on public.vereine for insert to authenticated
  with check (public.ist_systemadmin());
create policy vereine_aendern on public.vereine for update to authenticated
  using (public.ist_systemadmin() or public.hat_rolle(id, '{vereinsadmin}'))
  with check (public.ist_systemadmin() or public.hat_rolle(id, '{vereinsadmin}'));
create policy vereine_loeschen on public.vereine for delete to authenticated
  using (public.ist_systemadmin());

-- Benutzer: sich selbst sehen; Vereins-Admins sehen die Benutzer ihres Vereins.
create policy benutzer_lesen on public.benutzer for select to authenticated
  using (
    id = auth.uid()
    or public.ist_systemadmin()
    or exists (select 1 from public.benutzer_rollen r
               where r.benutzer_id = benutzer.id and public.hat_rolle(r.verein_id, '{vereinsadmin}'))
  );
-- Nur der Anzeigename ist selbst aenderbar; systemadmin und aktiv sind ueber
-- die Spaltenrechte weiter unten gesperrt.
create policy benutzer_selbst_aendern on public.benutzer for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Rollen: eigene sehen; Vereins-Admin verwaltet die Rollen seines Vereins.
create policy rollen_lesen on public.benutzer_rollen for select to authenticated
  using (benutzer_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());
create policy rollen_schreiben on public.benutzer_rollen for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin())
  with check (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());

-- Personen (Namensliste): jeder im Verein liest, Vereins-Admin und Sportwart schreiben.
create policy personen_lesen on public.personen for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy personen_schreiben on public.personen for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'));

-- Vertrauliche Felder: nur Vereins-Admin, Sportwart und Turnierleiter.
create policy pi_lesen on public.personen_intern for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}') or public.ist_systemadmin());
create policy pi_schreiben on public.personen_intern for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'));

-- Konto-Person-Verknuepfung
create policy bp_lesen on public.benutzer_personen for select to authenticated
  using (benutzer_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());
create policy bp_schreiben on public.benutzer_personen for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin}'));

-- Einladungen: nur Vereins-Admin
create policy einladungen_admin on public.einladungen for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin())
  with check (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());

-- Tische: jeder im Verein liest, Vereins-Admin schreibt.
create policy tische_lesen on public.tische for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy tische_schreiben on public.tische for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin}'));

-- Geraete: Vereins-Admin verwaltet, ein Geraet sieht sich selbst.
-- Angelegt werden Geraete nur ueber geraet_koppeln().
create policy geraete_lesen on public.geraete for select to authenticated
  using (auth_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());
create policy geraete_aendern on public.geraete for update to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin}'));
create policy geraete_loeschen on public.geraete for delete to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}'));

-- Aenderungsprotokoll: nur lesen, nur Admins. Geschrieben wird per Trigger.
create policy aenderungen_lesen on public.aenderungen for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());

-- ---------- Tabellenrechte ----------
-- Grundrechte je Zugriffsrolle. Was davon erlaubt ist, entscheidet
-- zusaetzlich die Row Level Security.

grant select on public.vereine to anon;                     -- Vereinsauswahl
grant select, insert, update, delete on public.vereine to authenticated;

grant select on public.benutzer to authenticated;
grant update (anzeigename) on public.benutzer to authenticated;

grant select, insert, update, delete on public.benutzer_rollen   to authenticated;
grant select, insert, update, delete on public.benutzer_personen to authenticated;
grant select, insert, update, delete on public.einladungen       to authenticated;
grant select, insert, update, delete on public.personen          to authenticated;
grant select, insert, update, delete on public.personen_intern   to authenticated;
grant select, insert, update, delete on public.tische            to authenticated;

-- Geraete entstehen nur ueber geraet_koppeln(), deshalb kein insert.
grant select, update, delete on public.geraete to authenticated;

grant select on public.aenderungen to authenticated;

-- ---------- Ausfuehrungsrechte der Funktionen ----------
-- Standardmaessig darf PUBLIC jede Funktion aufrufen. Das wird zurueckgenommen
-- und gezielt wieder vergeben. Triggerfunktionen bleiben ganz gesperrt.

revoke execute on function public.aenderung_protokollieren() from public, anon, authenticated;
revoke execute on function public.einladung_sofort() from public, anon, authenticated;
revoke execute on function public.neues_konto() from public, anon, authenticated;
revoke execute on function public.geaendert_am_setzen() from public, anon, authenticated;

revoke execute on function public.hat_rolle(uuid, public.rolle[]) from public, anon;
revoke execute on function public.ist_im_verein(uuid) from public, anon;
revoke execute on function public.geraet_verein() from public, anon;
revoke execute on function public.ist_systemadmin() from public;
revoke execute on function public.kopplung_anfordern() from public, anon;
revoke execute on function public.geraet_koppeln(text, uuid, text, uuid) from public, anon;
revoke execute on function public.geraet_meldet_sich() from public, anon;

grant execute on function public.hat_rolle(uuid, public.rolle[]) to authenticated;
grant execute on function public.ist_im_verein(uuid) to authenticated;
grant execute on function public.geraet_verein() to authenticated;
grant execute on function public.kopplung_anfordern() to authenticated;
grant execute on function public.geraet_koppeln(text, uuid, text, uuid) to authenticated;
grant execute on function public.geraet_meldet_sich() to authenticated;

-- ist_systemadmin steckt in der Policy der oeffentlich lesbaren Vereinsliste.
grant execute on function public.ist_systemadmin() to anon, authenticated;
