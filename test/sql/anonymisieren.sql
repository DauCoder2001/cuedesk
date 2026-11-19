-- Spieler anonymisieren: Name und vertrauliche Angaben verschwinden, die
-- Ergebnisse bleiben; ein zweites Mal wird abgelehnt.
\set ON_ERROR_STOP 1
begin;
\ir _vorbereitung.sql

do $$
declare
  v_verein uuid := pg_temp.id('verein');
  v_p      uuid;
  v_gegner uuid;
  v_t      uuid;
  v_name   text;
begin
  insert into public.personen (verein_id, vorname, nachname, anzeigename, status) values (v_verein, 'Erika', 'Probe', 'Erika P.', 'mitglied') returning id into v_p;
  insert into public.personen (verein_id, vorname, nachname, status) values (v_verein, 'Gegen', 'Spieler', 'mitglied') returning id into v_gegner;
  insert into public.personen_intern (person_id, verein_id, notiz, dbu_nummer) values (v_p, v_verein, 'vertraulich', '999003');
  insert into public.turniere (verein_id, name, datum, status) values (v_verein, 'Probe Turnier', current_date, 'beendet') returning id into v_t;
  insert into public.partien (verein_id, turnier_id, datum, spieler_a, spieler_b, ergebnis_a, ergebnis_b, status)
  values (v_verein, v_t, current_date, v_p, v_gegner, 3, 2, 'beendet');
  insert into public.turnier_anmeldungen (turnier_id, person_id, verein_id) values (v_t, v_p, v_verein);

  perform pg_temp.als('admin');
  v_name := public.person_anonymisieren(v_p);
  perform pg_temp.erwarte(v_name like 'Ehemaliger Spieler %', 'Platzhalter-Name, ist ' || coalesce(v_name, 'null'));
  perform pg_temp.erwarte(
    (select vorname = 'Ehemaliger Spieler' and status = 'ausgetreten' and anonymisiert_am is not null and anzeigename = v_name
       from public.personen where id = v_p),
    'Name ersetzt, Status ausgetreten, Zeitpunkt gesetzt');
  perform pg_temp.erwarte(not exists (select 1 from public.personen where verein_id = v_verein and (vorname = 'Erika' or anzeigename = 'Erika P.')),
    'alter Name ist nirgends mehr');
  perform pg_temp.erwarte(not exists (select 1 from public.personen_intern where person_id = v_p), 'vertrauliche Angaben geloescht');
  perform pg_temp.erwarte(not exists (select 1 from public.turnier_anmeldungen where person_id = v_p), 'Anmeldung geloescht');
  perform pg_temp.erwarte(exists (select 1 from public.partien where spieler_a = v_p and ergebnis_a = 3), 'Ergebnis bleibt erhalten');

  perform pg_temp.erwarte_fehler(format('select public.person_anonymisieren(%L)', v_p), 'schon anonymisiert', 'zweites Anonymisieren wird abgelehnt');
end $$;

\echo 'anonymisieren: ok'
rollback;
