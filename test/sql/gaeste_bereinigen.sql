-- Gaeste bereinigen (System -> "Gäste bereinigen"): wer in der Liste steht,
-- wer bleiben muss und was beim Entfernen mit dem Gegner-Kader passiert.
\set ON_ERROR_STOP 1
begin;
\ir _vorbereitung.sql

do $$
declare
  v_verein  uuid := pg_temp.id('verein');
  v_frei    uuid;  -- Gast ohne alles: entfernbar
  v_partie  uuid;  -- Gast mit Partie: bleibt
  v_offen   uuid;  -- im Gegner-Kader eines laufenden Spieltags: bleibt
  v_alt     uuid;  -- nur im Gegner-Kader eines beendeten Spieltags: entfernbar
  v_angem   uuid;  -- fuer ein Turnier angemeldet: bleibt
  v_frueher uuid;  -- ausserhalb des Zeitraums angelegt: nicht in der Liste
  v_mitgl   uuid;  -- Mitglied ohne Spiel: nie in der Liste
  v_laeuft  uuid;
  v_beendet uuid;
  v_liste   jsonb;
  v_ids     uuid[];
  v_n       int;
begin
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Frei', 'Gast', 'gast') returning id into v_frei;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Partie', 'Gast', 'gast') returning id into v_partie;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Offen', 'Gast', 'gast') returning id into v_offen;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Alt', 'Gast', 'gast') returning id into v_alt;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Angemeldet', 'Gast', 'gast') returning id into v_angem;
  insert into public.personen (verein_id, vorname, nachname, status, erstellt_am) values (v_verein, 'Frueher', 'Gast', 'gast', '2020-01-01') returning id into v_frueher;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Mitglied', 'Ohne', 'mitglied') returning id into v_mitgl;
  insert into public.personen_intern (person_id, verein_id, dbu_nummer) values (v_frei, v_verein, '999001');

  insert into public.turniere (verein_id, name, datum, modus, status, einstellungen)
  values (v_verein, 'Probe laeuft', current_date, 'liga', 'laeuft',
          jsonb_build_object('liga', jsonb_build_object('gegner', 'Probe Gegner 1', 'gegnerKader', jsonb_build_array(v_offen))))
  returning id into v_laeuft;
  insert into public.turniere (verein_id, name, datum, modus, status, einstellungen)
  values (v_verein, 'Probe beendet', current_date - 7, 'liga', 'beendet',
          jsonb_build_object('liga', jsonb_build_object('gegner', 'Probe Gegner 2', 'gegnerKader', jsonb_build_array(v_partie, v_alt))))
  returning id into v_beendet;
  insert into public.partien (verein_id, turnier_id, datum, spieler_a, spieler_b, ergebnis_a, ergebnis_b, status)
  values (v_verein, v_beendet, current_date - 7, v_partie, v_mitgl, 3, 1, 'beendet');
  insert into public.turnier_anmeldungen (turnier_id, person_id, verein_id) values (v_laeuft, v_angem, v_verein);

  -- Liste
  perform pg_temp.als('admin');
  v_liste := public.gaeste_ohne_spiel(v_verein, current_date - 30, current_date);
  select array_agg((x ->> 'id')::uuid order by x ->> 'vorname') into v_ids from jsonb_array_elements(v_liste -> 'gaeste') x;
  perform pg_temp.erwarte(v_ids = array[v_alt, v_frei], 'Liste soll genau Alt und Frei enthalten, ist: ' || (v_liste -> 'gaeste')::text);
  perform pg_temp.erwarte((v_liste ->> 'offen')::int = 1, 'offen = 1, ist ' || (v_liste ->> 'offen'));
  perform pg_temp.erwarte((v_liste ->> 'gebunden')::int = 1, 'gebunden = 1, ist ' || (v_liste ->> 'gebunden'));
  perform pg_temp.erwarte(
    (select x ->> 'spieltag' from jsonb_array_elements(v_liste -> 'gaeste') x where (x ->> 'id')::uuid = v_alt) = 'Probe beendet',
    'Herkunft von Alt ist der beendete Spieltag');
  perform pg_temp.erwarte(
    (select (x ->> 'ausPass')::boolean from jsonb_array_elements(v_liste -> 'gaeste') x where (x ->> 'id')::uuid = v_frei),
    'Frei hat eine DBU-Nummer (ausPass)');

  -- Entfernen: alle uebergeben, nur die entfernbaren gehen
  v_n := public.gaeste_bereinigen(v_verein, array[v_frei, v_partie, v_offen, v_alt, v_angem, v_frueher, v_mitgl]);
  perform pg_temp.erwarte(v_n = 3, 'entfernt sollen 3 sein (Frei, Alt, Frueher), sind ' || v_n);
  perform pg_temp.erwarte(not exists (select 1 from public.personen where id in (v_frei, v_alt, v_frueher)), 'Frei, Alt, Frueher sind weg');
  perform pg_temp.erwarte((select count(*) from public.personen where id in (v_partie, v_offen, v_angem, v_mitgl)) = 4,
    'Partie, Offen, Angemeldet und Mitglied bleiben');
  perform pg_temp.erwarte(not exists (select 1 from public.personen_intern where person_id = v_frei), 'Verbandsnummer von Frei ist mit weg');
  perform pg_temp.erwarte(
    (select einstellungen -> 'liga' -> 'gegnerKader' from public.turniere where id = v_beendet) = jsonb_build_array(v_partie),
    'Gegner-Kader des beendeten Spieltags enthaelt nur noch Partie');
  perform pg_temp.erwarte(
    (select einstellungen -> 'liga' -> 'gegnerKader' from public.turniere where id = v_laeuft) = jsonb_build_array(v_offen),
    'Gegner-Kader des laufenden Spieltags ist unveraendert');
  perform pg_temp.erwarte(
    exists (select 1 from public.system_protokoll where aktion = 'gaeste_bereinigt' and verein_id = v_verein and (details ->> 'anzahl')::int = 3),
    'Eintrag im Protokoll');

  -- Zweiter Lauf entfernt nichts mehr
  perform pg_temp.erwarte(public.gaeste_bereinigen(v_verein, array[v_partie, v_offen, v_angem, v_mitgl]) = 0, 'zweiter Lauf: 0');
end $$;

\echo 'gaeste_bereinigen: ok'
rollback;
