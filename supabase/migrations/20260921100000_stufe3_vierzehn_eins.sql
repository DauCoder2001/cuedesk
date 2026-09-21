-- =============================================================
--  CueDesk, Stufe 3: 14.1-Partien mit vollstaendigem Aufnahme-Protokoll
--
--  Die Partie selbst steht in "partien" (Disziplin 14-1, Ergebnis = Punkte,
--  race_to = Punkteziel, turnier_id leer bei Einzelspielen). Hier kommen die
--  14.1-Angaben und jede einzelne Aufnahme dazu.
-- =============================================================

create table public.partien_141 (
  partie_id       uuid primary key references public.partien (id) on delete cascade,
  verein_id       uuid not null references public.vereine (id) on delete restrict,
  ziel_punkte     integer not null default 0 check (ziel_punkte >= 0),
  ziel_aufnahmen  integer not null default 0 check (ziel_aufnahmen >= 0),
  aufnahmen_a     integer not null default 0,
  aufnahmen_b     integer not null default 0,
  hoechstserie_a  integer not null default 0,
  hoechstserie_b  integer not null default 0,
  dauer_sek       integer check (dauer_sek >= 0)
);

create table public.aufnahmen_141 (
  id             bigint generated always as identity primary key,
  partie_id      uuid not null references public.partien (id) on delete cascade,
  verein_id      uuid not null references public.vereine (id) on delete restrict,
  lfd_nr         integer not null,
  spieler        uuid not null,
  baelle         integer not null,
  punkte         integer not null,
  gesamt         integer not null,
  art            text not null check (art in ('serie', 'sicherheit', 'foul', 'foul3', 'eroeffnungsfoul', 'ende')),
  markierung     text not null default '' check (markierung in ('', '/', '//', '3F', '-2')),
  rack_segmente  integer[] not null default '{}',
  rack_nr        integer not null default 1,
  zeitpunkt      timestamptz,
  unique (partie_id, lfd_nr),
  foreign key (verein_id, spieler) references public.personen (verein_id, id) on delete restrict
);
create index aufnahmen_141_spieler on public.aufnahmen_141 (spieler);

-- Gehoert die Person zum angemeldeten Konto?
create function public.ist_eigene_person(p_person uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.benutzer_personen bp
    where bp.benutzer_id = auth.uid() and bp.person_id = p_person
  );
$$;
revoke execute on function public.ist_eigene_person(uuid) from public, anon;
grant execute on function public.ist_eigene_person(uuid) to authenticated;

alter table public.partien_141  enable row level security;
alter table public.aufnahmen_141 enable row level security;

grant select, insert, update, delete on public.partien_141  to authenticated;
grant select, insert, update, delete on public.aufnahmen_141 to authenticated;
grant all on public.partien_141, public.aufnahmen_141 to service_role;

-- Das Protokoll ist persoenliche Statistik: sichtbar fuer die Turnierleitung
-- und fuer die beiden Spieler der Partie selbst.
create policy p141_lesen on public.partien_141 for select to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}')
    or public.ist_systemadmin()
    or exists (
      select 1 from public.partien p
      where p.id = partie_id
        and (public.ist_eigene_person(p.spieler_a) or public.ist_eigene_person(p.spieler_b))
    )
  );
create policy a141_lesen on public.aufnahmen_141 for select to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}')
    or public.ist_systemadmin()
    or public.ist_eigene_person(spieler)
  );

-- Schreiben: die Tablets am Tisch und die Turnierleitung.
create policy p141_schreiben on public.partien_141 for all to authenticated
  using (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));
create policy a141_schreiben on public.aufnahmen_141 for all to authenticated
  using (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.geraet_verein() = verein_id or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));

create trigger protokoll after insert or update or delete on public.partien_141
  for each row execute function public.aenderung_protokollieren();
