-- =============================================================
--  Stufe 12: Mandanten, Phase 2 - Kennzahlen fuer die Konsole
--  (docs/Mandanten.md)
--
--  1. system_ereignisse: Rueckmeldungen von aussen, zuerst die
--     woechentliche Sicherung (GitHub schreibt Zeit, Erfolg, Groesse).
--  2. konsole_vereine(): Zahlen je Verein - keine Namen, keine Ergebnisse.
--  3. konsole_datenbank(): Groesse, groesste Tabellen, Verbindungen,
--     letzte Laeufe des naechtlichen Ratings.
--  Alles nur fuer Super-Admins.
-- =============================================================

create table public.system_ereignisse (
  id            bigint generated always as identity primary key,
  zeit          timestamptz not null default now(),
  art           text not null,            -- 'sicherung'
  erfolg        boolean not null,
  groesse_bytes bigint,
  text          text
);
alter table public.system_ereignisse enable row level security;
create policy ereignisse_lesen on public.system_ereignisse for select to authenticated
  using (public.ist_systemadmin());
-- In diesem Projekt bekommen neue Tabellen keine Rechte von selbst.
-- Geschrieben wird nur ueber die Datenbankverbindung der Sicherung.
grant select on public.system_ereignisse to authenticated;

-- ---------- Zahlen je Verein ----------

create function public.konsole_vereine()
returns table (
  verein_id         uuid,
  konten            integer,   -- Konten mit einer Rolle im Verein
  letzte_anmeldung  timestamptz,
  mitglieder        integer,   -- Spieler mit Status Mitglied
  gaeste            integer,
  turniere_30       integer,   -- Turniere und Spieltage der letzten 30 Tage
  partien_30        integer,   -- beendete Partien der letzten 30 Tage
  partien_gesamt    integer,
  tablets           integer,
  tablets_online    integer,   -- in den letzten 2 Minuten gemeldet
  datensaetze       bigint     -- grobe Groesse: Zeilen in den Vereinstabellen
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur fuer Super-Admins.';
  end if;
  return query
  select v.id,
    (select count(distinct r.benutzer_id)::int from public.benutzer_rollen r where r.verein_id = v.id),
    (select max(b.angemeldet_am) from public.benutzer b
       join public.benutzer_rollen r on r.benutzer_id = b.id where r.verein_id = v.id),
    (select count(*)::int from public.personen p where p.verein_id = v.id and p.status = 'mitglied'),
    (select count(*)::int from public.personen p where p.verein_id = v.id and p.status = 'gast'),
    (select count(*)::int from public.turniere t where t.verein_id = v.id and t.datum >= current_date - 30),
    (select count(*)::int from public.partien p where p.verein_id = v.id and p.status = 'beendet'
       and coalesce(p.beendet::date, p.datum) >= current_date - 30),
    (select count(*)::int from public.partien p where p.verein_id = v.id),
    (select count(*)::int from public.geraete g where g.verein_id = v.id and g.aktiv),
    (select count(*)::int from public.geraete g where g.verein_id = v.id and g.aktiv
       and g.zuletzt_gesehen > now() - interval '2 minutes'),
    (select (select count(*) from public.personen x where x.verein_id = v.id)
          + (select count(*) from public.turniere x where x.verein_id = v.id)
          + (select count(*) from public.partien x where x.verein_id = v.id)
          + (select count(*) from public.aufnahmen_141 x where x.verein_id = v.id)
          + (select count(*) from public.rating_stand x where x.verein_id = v.id)
          + (select count(*) from public.aenderungen x where x.verein_id = v.id))::bigint
  from public.vereine v;
end;
$$;

-- ---------- Zustand der Datenbank ----------

create function public.konsole_datenbank() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur fuer Super-Admins.';
  end if;
  return jsonb_build_object(
    'groesse_bytes', pg_database_size(current_database()),
    'verbindungen', (select count(*) from pg_catalog.pg_stat_activity where datname = current_database()),
    'tabellen', (
      select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb) from (
        select c.relname as name, pg_total_relation_size(c.oid) as bytes, c.reltuples::bigint as zeilen
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 8
      ) t),
    'rating_laeufe', (
      select coalesce(jsonb_agg(l order by l.start desc), '[]'::jsonb) from (
        select d.status, d.start_time as start, d.end_time as ende, left(d.return_message, 200) as meldung
        from cron.job_run_details d join cron.job j on j.jobid = d.jobid
        where j.jobname = 'rating-nachts'
        order by d.start_time desc
        limit 5
      ) l)
  );
end;
$$;

revoke execute on function public.konsole_vereine() from public, anon;
revoke execute on function public.konsole_datenbank() from public, anon;
grant execute on function public.konsole_vereine() to authenticated;
grant execute on function public.konsole_datenbank() to authenticated;
