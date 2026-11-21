-- Liegengebliebene Tischstaende: der naechtliche Lauf entfernt, was 48 Stunden
-- unveraendert ist, und laesst laufende Spiele stehen.
\set ON_ERROR_STOP 1
begin;
\ir _vorbereitung.sql

do $$
declare
  v_verein uuid := pg_temp.id('verein');
  v_alt    uuid;
  v_knapp  uuid;
  v_neu    uuid;
  v_n      int;
begin
  insert into public.tische (verein_id, nummer) values (v_verein, 1) returning id into v_alt;
  insert into public.tische (verein_id, nummer) values (v_verein, 2) returning id into v_knapp;
  insert into public.tische (verein_id, nummer) values (v_verein, 3) returning id into v_neu;
  insert into public.live_stand (tisch_id, verein_id, zustand, aktualisiert) values
    (v_alt,   v_verein, '{"gameType":"pool","score1":10,"score2":9}', now() - interval '49 hours'),
    (v_knapp, v_verein, '{"gameType":"pool","score1":2,"score2":1}',  now() - interval '47 hours'),
    (v_neu,   v_verein, '{"gameType":"pool","score1":1,"score2":0}',  now() - interval '5 minutes');

  -- Andere Vereine koennen ebenfalls alte Staende haben; gezaehlt wird nur der Probeverein
  v_n := public.tischstaende_loeschen();
  perform pg_temp.erwarte(v_n >= 1, 'mindestens der alte Stand wurde entfernt, ist ' || v_n);
  perform pg_temp.erwarte(not exists (select 1 from public.live_stand where tisch_id = v_alt), 'Stand nach 49 Stunden ist weg');
  perform pg_temp.erwarte(exists (select 1 from public.live_stand where tisch_id = v_knapp), 'Stand nach 47 Stunden bleibt');
  perform pg_temp.erwarte(exists (select 1 from public.live_stand where tisch_id = v_neu), 'laufendes Spiel bleibt');

  -- Naechtlicher Lauf ist eingeplant
  perform pg_temp.erwarte(
    exists (select 1 from cron.job where jobname = 'tischstaende-loeschen' and command like '%tischstaende_loeschen()%'),
    'naechtlicher Lauf tischstaende-loeschen fehlt');

  -- Konsole -> Aufraeumen zaehlt mit derselben Frist
  perform pg_temp.erwarte(
    (public.aufraeumen_intern(false, '{}') ->> 'tischstaende')::int
      = (select count(*) from public.live_stand where aktualisiert < now() - interval '48 hours'),
    'Konsole zaehlt Tischstaende mit 48 Stunden');
end $$;

\echo 'tischstaende: ok'
rollback;
