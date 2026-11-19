-- Spieler zusammenfuehren (Spieler -> "Doppelten Eintrag übernehmen"):
-- Partien, Verbandsnummern und die Verweise in den Turnier-Einstellungen
-- gehen auf den bleibenden Eintrag ueber; gemeinsame Turniere werden abgelehnt.
\set ON_ERROR_STOP 1
begin;
\ir _vorbereitung.sql

do $$
declare
  v_verein uuid := pg_temp.id('verein');
  v_bleibt uuid;
  v_weg    uuid;
  v_gegner uuid;
  v_c      uuid;
  v_d      uuid;
  v_dko    uuid;
  v_liga   uuid;
  v_t      uuid;
  v_erg    jsonb;
begin
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Max', 'Muster', 'gast') returning id into v_bleibt;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Max', 'Muster', 'gast') returning id into v_weg;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Gegen', 'Spieler', 'mitglied') returning id into v_gegner;
  insert into public.personen_intern (person_id, verein_id, dbu_nummer, passnummer) values (v_weg, v_verein, '999002', 'P-1');

  -- Doppel-KO mit dem aufzuloesenden Eintrag in der Setzliste
  insert into public.turniere (verein_id, name, datum, modus, status, einstellungen)
  values (v_verein, 'Probe Doppel-KO', current_date, 'doppel-ko', 'laeuft',
          jsonb_build_object('dko', jsonb_build_object('setzliste', jsonb_build_array(v_gegner, v_weg))))
  returning id into v_dko;
  insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id) values (v_dko, v_weg, v_verein), (v_dko, v_gegner, v_verein);
  insert into public.partien (verein_id, turnier_id, datum, spieler_a, spieler_b, status)
  values (v_verein, v_dko, current_date, v_weg, v_gegner, 'geplant');

  -- Liga-Spieltag mit beiden Eintraegen im Gegner-Kader
  insert into public.turniere (verein_id, name, datum, modus, status, einstellungen)
  values (v_verein, 'Probe Spieltag', current_date, 'liga', 'geplant',
          jsonb_build_object('liga', jsonb_build_object('gegner', 'Probe Gegner', 'gegnerKader', jsonb_build_array(v_bleibt, v_gegner, v_weg))))
  returning id into v_liga;

  perform pg_temp.als('admin');
  v_erg := public.personen_zusammenfuehren(v_bleibt, v_weg);
  perform pg_temp.erwarte((v_erg ->> 'partien')::int = 1 and (v_erg ->> 'turniere')::int = 1, 'Ergebnis 1 Turnier, 1 Partie, ist ' || v_erg::text);
  perform pg_temp.erwarte(not exists (select 1 from public.personen where id = v_weg), 'aufgeloester Eintrag ist weg');
  perform pg_temp.erwarte(exists (select 1 from public.partien where turnier_id = v_dko and spieler_a = v_bleibt), 'Partie gehoert dem bleibenden');
  perform pg_temp.erwarte(exists (select 1 from public.turnier_teilnehmer where turnier_id = v_dko and person_id = v_bleibt), 'Teilnahme gehoert dem bleibenden');
  perform pg_temp.erwarte(
    (select einstellungen -> 'dko' -> 'setzliste' from public.turniere where id = v_dko) = jsonb_build_array(v_gegner, v_bleibt),
    'Setzliste zeigt auf den bleibenden, an derselben Stelle');
  perform pg_temp.erwarte(
    (select einstellungen -> 'liga' -> 'gegnerKader' from public.turniere where id = v_liga) = jsonb_build_array(v_bleibt, v_gegner),
    'Gegner-Kader ohne Dopplung, Reihenfolge erhalten');
  perform pg_temp.erwarte(
    not exists (select 1 from public.turniere where verein_id = v_verein and einstellungen::text like '%' || v_weg::text || '%'),
    'kein Verweis mehr auf den aufgeloesten Eintrag');
  perform pg_temp.erwarte(
    (select dbu_nummer = '999002' and passnummer = 'P-1' from public.personen_intern where person_id = v_bleibt),
    'Verbandsnummern sind uebernommen');

  -- Beide im selben Turnier: abgelehnt, nichts geaendert
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Doppelt', 'Eins', 'gast') returning id into v_c;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Doppelt', 'Zwei', 'gast') returning id into v_d;
  insert into public.turniere (verein_id, name, datum) values (v_verein, 'Probe gemeinsam', current_date) returning id into v_t;
  insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id) values (v_t, v_c, v_verein), (v_t, v_d, v_verein);
  perform pg_temp.erwarte_fehler(format('select public.personen_zusammenfuehren(%L, %L)', v_c, v_d),
    'Beide stehen im selben Turnier', 'gemeinsames Turnier wird abgelehnt');
  perform pg_temp.erwarte((select count(*) from public.personen where id in (v_c, v_d)) = 2, 'bei Ablehnung bleiben beide');
end $$;

\echo 'zusammenfuehren: ok'
rollback;
