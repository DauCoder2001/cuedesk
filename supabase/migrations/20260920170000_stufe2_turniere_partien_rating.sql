-- =============================================================
--  CueDesk, Stufe 2: Serien, Turniere, Partien, Rating
--
--  Kern der Aenderung gegenueber "Turnier light": Jede Partie ist
--  ein eigener Datensatz mit Phase, Gruppe, Runde und Paarung.
--  Die positionsbasierten Schluessel (r0, A-r0) entfallen.
-- =============================================================

create type public.disziplin as enum ('8-ball', '9-ball', '10-ball', 'multi-ball', '14-1');
create type public.turnier_modus as enum ('einzelgruppe', 'zwei-gruppen', 'gruppen-ko', 'einzelspiel', 'sonstiges');
create type public.turnier_status as enum ('geplant', 'laeuft', 'beendet', 'abgebrochen');
create type public.partie_status as enum ('geplant', 'laeuft', 'beendet');
create type public.rating_quelle as enum ('eigene-daten', 'vorlaeufig', 'andere-disziplin', 'startwert', 'vereinsschnitt', 'von-hand', 'gast');

-- Entspricht der Liste "ausgeblendet" aus der Serienwertung.
alter table public.personen add column rating_ausgeblendet boolean not null default false;

create table public.serien (
  id          uuid primary key default gen_random_uuid(),
  verein_id   uuid not null references public.vereine (id) on delete restrict,
  name        text not null,
  saison      text,
  disziplin   public.disziplin not null default '8-ball',
  streicher   integer not null default 0 check (streicher >= 0),   -- 0 = alle Turniere zaehlen
  bonus       integer not null default 1 check (bonus >= 0),       -- Zusatzpunkte fuer Platz 1
  aktiv       boolean not null default true,
  alt_id      text,
  erstellt_am timestamptz not null default now(),
  unique (verein_id, id)
);

create table public.turniere (
  id             uuid primary key default gen_random_uuid(),
  verein_id      uuid not null references public.vereine (id) on delete restrict,
  name           text not null,
  datum          date not null,
  disziplin      public.disziplin not null default '8-ball',
  modus          public.turnier_modus not null default 'einzelgruppe',
  serie_id       uuid,
  status         public.turnier_status not null default 'geplant',
  rating_werten  boolean not null default true,
  eingefroren_am timestamptz,
  einstellungen  jsonb not null default '{}'::jsonb,   -- Race to je Phase, Gruppen, Qualifikanten
  quelle         text not null default 'cuedesk',      -- 'import' bei uebernommenen Altturnieren
  alt_id         text,
  importiert_am  timestamptz,
  erstellt_am    timestamptz not null default now(),
  unique (verein_id, id),
  foreign key (verein_id, serie_id) references public.serien (verein_id, id) on delete set null (serie_id)
);
create index turniere_verein_datum on public.turniere (verein_id, datum desc);

create table public.turnier_teilnehmer (
  turnier_id         uuid not null references public.turniere (id) on delete cascade,
  person_id          uuid not null,
  verein_id          uuid not null,
  startnummer        integer,
  gruppe             text,
  gesetzt            boolean not null default false,
  endplatz           integer,
  rating_eingefroren integer,
  rating_quelle      public.rating_quelle,
  primary key (turnier_id, person_id),
  foreign key (verein_id, person_id) references public.personen (verein_id, id) on delete restrict
);

create table public.partien (
  id              uuid primary key default gen_random_uuid(),
  verein_id       uuid not null references public.vereine (id) on delete restrict,
  turnier_id      uuid references public.turniere (id) on delete cascade,  -- leer bei Einzelspielen
  disziplin       public.disziplin not null default '8-ball',
  datum           date not null,
  phase           text,
  gruppe          text,
  runde           integer,
  paarung         integer,
  tisch_id        uuid,
  spieler_a       uuid not null,
  spieler_b       uuid not null,
  race_to         integer check (race_to > 0),
  vorgabe_a       integer not null default 0 check (vorgabe_a >= 0),
  vorgabe_b       integer not null default 0 check (vorgabe_b >= 0),
  ergebnis_a      integer check (ergebnis_a >= 0),
  ergebnis_b      integer check (ergebnis_b >= 0),
  status          public.partie_status not null default 'geplant',
  rating_werten   boolean not null default true,
  rating_grund    text,
  begonnen        timestamptz,
  beendet         timestamptz,
  eingetragen_von uuid references public.benutzer (id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  check (spieler_a <> spieler_b),
  foreign key (verein_id, spieler_a) references public.personen (verein_id, id) on delete restrict,
  foreign key (verein_id, spieler_b) references public.personen (verein_id, id) on delete restrict,
  foreign key (verein_id, tisch_id) references public.tische (verein_id, id) on delete set null (tisch_id)
);
create index partien_verein_datum on public.partien (verein_id, datum desc);
create index partien_turnier on public.partien (turnier_id);
create index partien_spieler_a on public.partien (spieler_a);
create index partien_spieler_b on public.partien (spieler_b);

create table public.rating_einstellungen (
  verein_id         uuid primary key references public.vereine (id) on delete restrict,
  zeitraum_monate   integer not null default 12 check (zeitraum_monate > 0),
  mindest_racks     integer not null default 100 check (mindest_racks >= 0),
  rueckgriff_monate integer not null default 36 check (rueckgriff_monate > 0),
  gewicht           integer not null default 30 check (gewicht >= 0),
  staerke_prozent   integer not null default 75 check (staerke_prozent between 0 and 100),
  vereinsschnitt    integer not null default 500 check (vereinsschnitt between 100 and 1000)
);

-- Momentaufnahme je Stichtag. Nur so laesst sich ein Verlauf zeigen, denn die
-- gemeinsame Berechnung verschiebt Werte auch rueckwirkend.
create table public.rating_stand (
  verein_id uuid not null references public.vereine (id) on delete restrict,
  stichtag  date not null,
  disziplin text not null,                       -- Disziplin oder 'gesamt'
  person_id uuid not null,
  wert      integer not null,
  racks     integer not null default 0,
  quelle    public.rating_quelle not null default 'eigene-daten',
  primary key (verein_id, stichtag, disziplin, person_id),
  foreign key (verein_id, person_id) references public.personen (verein_id, id) on delete cascade
);

-- Nur diese Partien zaehlen fuer das Vereins-Rating: Turnierpartien zwischen
-- zwei Mitgliedern, beide Schalter auf "werten". Einzelspiele und Partien mit
-- Gastbeteiligung bleiben aussen vor. Die Vorgabe ist herausgerechnet, es
-- bleiben die selbst gespielten Racks.
create view public.rating_partien with (security_invoker = true) as
  select p.id, p.verein_id, p.turnier_id, p.disziplin, p.datum,
         p.spieler_a, p.spieler_b,
         greatest(coalesce(p.ergebnis_a, 0) - p.vorgabe_a, 0) as racks_a,
         greatest(coalesce(p.ergebnis_b, 0) - p.vorgabe_b, 0) as racks_b
  from public.partien p
  join public.turniere t on t.id = p.turnier_id
  join public.personen a on a.id = p.spieler_a
  join public.personen b on b.id = p.spieler_b
  where p.status = 'beendet'
    and p.rating_werten
    and t.rating_werten
    and a.status <> 'gast'
    and b.status <> 'gast';

-- ---------- Rechte ----------

alter table public.serien               enable row level security;
alter table public.turniere             enable row level security;
alter table public.turnier_teilnehmer   enable row level security;
alter table public.partien              enable row level security;
alter table public.rating_einstellungen enable row level security;
alter table public.rating_stand         enable row level security;

grant select, insert, update, delete on public.serien               to authenticated;
grant select, insert, update, delete on public.turniere             to authenticated;
grant select, insert, update, delete on public.turnier_teilnehmer   to authenticated;
grant select, insert, update, delete on public.partien              to authenticated;
grant select, insert, update, delete on public.rating_einstellungen to authenticated;
grant select on public.rating_stand   to authenticated;
grant select on public.rating_partien to authenticated;

create policy serien_lesen on public.serien for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy serien_schreiben on public.serien for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'));

create policy turniere_lesen on public.turniere for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy turniere_schreiben on public.turniere for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));

create policy teilnehmer_lesen on public.turnier_teilnehmer for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy teilnehmer_schreiben on public.turnier_teilnehmer for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));

-- Ergebnisse tragen auch die Tablets am Tisch ein.
create policy partien_lesen on public.partien for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy partien_schreiben on public.partien for all to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}')
    or public.geraet_verein() = verein_id
  )
  with check (
    public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}')
    or public.geraet_verein() = verein_id
  );

create policy rating_einstellungen_lesen on public.rating_einstellungen for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
create policy rating_einstellungen_schreiben on public.rating_einstellungen for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}'));

-- Rating-Staende schreibt nur die Berechnung (Serverfunktion), nicht der Browser.
create policy rating_stand_lesen on public.rating_stand for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());

create trigger protokoll after insert or update or delete on public.serien
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.turniere
  for each row execute function public.aenderung_protokollieren();
create trigger protokoll after insert or update or delete on public.partien
  for each row execute function public.aenderung_protokollieren();

-- Alte Kennungen aus der Serienwertung duerfen je Verein nur einmal vorkommen.
-- Damit erkennt der Einlesevorgang beim zweiten Lauf, was schon da ist.
create unique index serien_alt_id on public.serien (verein_id, alt_id) where alt_id is not null;
create unique index turniere_alt_id on public.turniere (verein_id, alt_id) where alt_id is not null;

-- Dasselbe Turnier darf auch nicht unter gleichem Namen und Datum doppelt entstehen.
create unique index turniere_name_datum on public.turniere (verein_id, name, datum);

-- Teilnehmerzahl laut Turnier. Sie bestimmt die Punkte der Serienwertung.
-- Bei uebernommenen Altturnieren kann sie hoeher sein als die Zahl der
-- Teilnehmerzeilen, weil zusammengefuehrte Namen nur einmal zaehlen.
alter table public.turniere add column teilnehmerzahl integer check (teilnehmerzahl >= 0);
