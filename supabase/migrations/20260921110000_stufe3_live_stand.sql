-- =============================================================
--  CueDesk, Stufe 3: Live-Stand der Tische und Anpassungen fuer die
--  uebernommenen Scoreboards
-- =============================================================

-- Live-Stand je Tisch: ersetzt "tables/<id>" aus Firebase. Das Scoreboard
-- schreibt hier seinen kompletten Zustand; andere Geraete (zweites Tablet,
-- spaeter TV und Turnierleitung) lesen mit.
create table public.live_stand (
  tisch_id      uuid primary key references public.tische (id) on delete cascade,
  verein_id     uuid not null references public.vereine (id) on delete restrict,
  zustand       jsonb not null,
  besitzer      text,
  aktualisiert  timestamptz not null default now()
);

alter table public.live_stand enable row level security;
grant select, insert, update, delete on public.live_stand to authenticated;
grant all on public.live_stand to service_role;

create policy live_lesen on public.live_stand for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy live_schreiben on public.live_stand for all to authenticated
  using (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));

-- Aenderungen sofort an alle Geraete verteilen.
alter publication supabase_realtime add table public.live_stand;

-- Abgebrochene Partien werden gespeichert, zaehlen aber nicht als Sieg oder
-- Niederlage.
alter type public.partie_status add value if not exists 'abgebrochen';

-- Im 14.1 koennen Punkte durch Fouls negativ werden.
alter table public.partien drop constraint if exists partien_ergebnis_a_check;
alter table public.partien drop constraint if exists partien_ergebnis_b_check;
alter table public.partien add constraint partien_ergebnis_a_check
  check (ergebnis_a >= 0 or disziplin = '14-1');
alter table public.partien add constraint partien_ergebnis_b_check
  check (ergebnis_b >= 0 or disziplin = '14-1');

-- Am Tablet duerfen Gaeste angelegt werden - aber nur Gaeste.
create policy personen_gast_am_tablet on public.personen for insert to authenticated
  with check (public.geraet_verein() = verein_id and status = 'gast');
