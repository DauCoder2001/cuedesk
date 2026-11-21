-- Rechte der Datenbank: Zeilenrichtlinien, Ausfuehrungsrechte der Funktionen
-- und Rollenpruefung der Funktionen, die Daten loeschen oder umschreiben.
\set ON_ERROR_STOP 1
begin;
\ir _vorbereitung.sql

-- Jede Tabelle in public hat Zeilenrichtlinien eingeschaltet
do $$
begin
  perform pg_temp.erwarte(
    not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
    'Tabelle ohne Zeilenrichtlinien: ' || coalesce((select string_agg(c.relname, ', ') from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity), ''));
end $$;

-- Ohne Anmeldung (anon) sind nur diese Funktionen mit erweiterten Rechten aufrufbar.
-- Funktionen fuer Ereignis-Trigger (z. B. rls_auto_enable von Supabase) lassen sich
-- ohnehin nicht aufrufen und zaehlen nicht.
do $$
declare
  v_offen text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_offen
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and pg_get_function_result(p.oid) <> 'event_trigger'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('agent_abfragen', 'ist_systemadmin', 'oeffentliche_ansicht');
  perform pg_temp.erwarte(v_offen is null, 'ohne Anmeldung aufrufbar: ' || coalesce(v_offen, ''));
end $$;

-- Interne Funktionen sind auch fuer angemeldete Nutzer nicht aufrufbar
do $$
declare
  v_offen text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_offen
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('gast_bindung', 'protokollieren', 'aufraeumen_intern', 'fristen_loeschen',
                       'verein_endgueltig_loeschen', 'vereine_loeschen_faellig', 'rating_nachts',
                       'einladungen_uebernehmen', 'letzter_vereinsadmin', 'tischstaende_loeschen')
     and has_function_privilege('authenticated', p.oid, 'execute');
  perform pg_temp.erwarte(v_offen is null, 'intern, aber angemeldet aufrufbar: ' || coalesce(v_offen, ''));
end $$;

-- Ohne Vereins-Admin werden die Funktionen abgewiesen, die Daten loeschen oder umschreiben
do $$
declare
  v_verein uuid := pg_temp.id('verein');
  v_a uuid;
  v_b uuid;
  wer text;
begin
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Probe', 'A', 'gast') returning id into v_a;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Probe', 'B', 'gast') returning id into v_b;

  foreach wer in array array['mitglied', 'leiter', null] loop
    perform pg_temp.als(wer);
    perform pg_temp.erwarte_fehler(format('select public.gaeste_ohne_spiel(%L, %L, %L)', v_verein, '2000-01-01', '2100-01-01'),
      'nur der Vereins-Administrator', 'gaeste_ohne_spiel als ' || coalesce(wer, 'anon'));
    perform pg_temp.erwarte_fehler(format('select public.gaeste_bereinigen(%L, array[%L]::uuid[])', v_verein, v_a),
      'nur der Vereins-Administrator', 'gaeste_bereinigen als ' || coalesce(wer, 'anon'));
    perform pg_temp.erwarte_fehler(format('select public.personen_zusammenfuehren(%L, %L)', v_a, v_b),
      'darf nur der Vereins-Administrator', 'personen_zusammenfuehren als ' || coalesce(wer, 'anon'));
    perform pg_temp.erwarte_fehler(format('select public.person_anonymisieren(%L)', v_a),
      'Nur der Vereins-Administrator', 'person_anonymisieren als ' || coalesce(wer, 'anon'));
  end loop;

  -- TV herunterfahren: Turnierleiter ja, Mitglied nein
  perform pg_temp.als('mitglied');
  perform pg_temp.erwarte_fehler(format('select public.tv_herunterfahren(%L)', v_verein), 'Keine Berechtigung', 'tv_herunterfahren als Mitglied');
  perform pg_temp.als('leiter');
  perform pg_temp.erwarte(public.tv_herunterfahren(v_verein) = 0, 'tv_herunterfahren als Turnierleiter (kein Geraet: 0)');

  -- Nichts wurde geloescht
  perform pg_temp.erwarte((select count(*) from public.personen where id in (v_a, v_b)) = 2, 'Probe-Gaeste noch da');
end $$;

\echo 'rechte: ok'
rollback;
