-- =============================================================
--  CueDesk, Stufe 9: Mannschaften und Kader
--
--  Ein Verein meldet je Saison mehrere Mannschaften (im Mannschaftspass die
--  Teams 1, 2, 3 ...). Zu jeder gehoert ein Kader mit Stammspielern, einem
--  Kapitaen und dem Datum der Spielberechtigung. Ein Liga-Spieltag verweist
--  ueber einstellungen -> liga -> mannschaft_id auf seine Mannschaft, daraus
--  entsteht die Saisonuebersicht.
--
--  Die Einsaetze je Spieler und Mannschaft zaehlt die Anwendung aus den
--  Partien der Spieltage; dafuer braucht es hier keine eigene Spalte.
-- =============================================================

create table public.mannschaften (
  id           uuid primary key default gen_random_uuid(),
  verein_id    uuid not null references public.vereine (id) on delete restrict,
  name         text not null,                 -- z.B. "PBC Bassum 3"
  saison       text not null,                 -- z.B. "2026/27"
  liga         text,                          -- Kennung aus src/liga.ts, leer bei eigener Runde
  staffel      text,                          -- z.B. "OH / B", wenn eine Liga mehrere Staffeln hat
  rang         integer not null default 1,    -- Team-Nummer im Mannschaftspass, bestimmt die Reihenfolge
  aktiv        boolean not null default true,
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  unique (verein_id, saison, name),
  unique (verein_id, id)                      -- Ziel fuer vereinsgebundene Fremdschluessel
);

-- Kader einer Mannschaft. Ein Spieler darf in mehreren Kadern stehen (er hilft
-- nach oben aus), Stammspieler ist er aber nur in einem.
create table public.mannschaft_spieler (
  id             uuid primary key default gen_random_uuid(),
  verein_id      uuid not null,
  mannschaft_id  uuid not null,
  person_id      uuid not null,
  stammspieler   boolean not null default false,
  kapitaen       boolean not null default false,
  berechtigt_ab  date,                        -- Spalte "Berechtigt" im Mannschaftspass
  position       integer,                     -- Reihenfolge in der Meldeliste
  erstellt_am    timestamptz not null default now(),
  unique (mannschaft_id, person_id),
  foreign key (verein_id, mannschaft_id) references public.mannschaften (verein_id, id) on delete cascade,
  foreign key (verein_id, person_id)     references public.personen     (verein_id, id) on delete cascade
);

-- Verbandsnummern gehoeren zur Person, nicht zur Mannschaft, und sind
-- vertraulich: personen_intern lesen nur Vereinsadmin, Sportwart und
-- Turnierleitung.
alter table public.personen_intern
  add column passnummer text,
  add column dbu_nummer text;

create index mannschaften_verein_saison on public.mannschaften (verein_id, saison);
create index mannschaft_spieler_person  on public.mannschaft_spieler (person_id);

alter table public.mannschaften       enable row level security;
alter table public.mannschaft_spieler enable row level security;

-- Lesen darf jeder im Verein, pflegen Vereinsadmin und Sportwart.
create policy mannschaften_lesen on public.mannschaften for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy mannschaften_schreiben on public.mannschaften for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'));

create policy mannschaft_spieler_lesen on public.mannschaft_spieler for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy mannschaft_spieler_schreiben on public.mannschaft_spieler for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'));

grant select, insert, update, delete on public.mannschaften       to authenticated;
grant select, insert, update, delete on public.mannschaft_spieler to authenticated;
grant all on public.mannschaften, public.mannschaft_spieler to service_role;

create trigger geaendert_am before update on public.mannschaften
  for each row execute function public.geaendert_am_setzen();

create trigger protokoll after insert or update or delete on public.mannschaften
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.mannschaft_spieler
  for each row execute function public.aenderung_protokollieren();
