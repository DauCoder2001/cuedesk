-- Spieler zusammenfuehren (Entscheidung 14.10.2026)
--
-- Zwei Eintraege derselben Person (z. B. "Vino" aus einem Import und
-- "Viktor S.") werden zu einem: alle Verweise auf p_weg gehen auf
-- p_behalten ueber, danach wird p_weg geloescht. Alles in einer Transaktion -
-- entweder vollstaendig oder gar nicht.
--
-- Abgelehnt wird, wenn beide im selben Turnier oder in derselben Partie
-- stehen (sonst spielte jemand gegen sich selbst) oder wenn beide mit
-- verschiedenen Konten verknuepft sind. Nur der Vereins-Administrator; das
-- Schutzwort fragt die Anwendung vorher ab (wie beim Loeschen von Turnieren).
--
-- Vertrauliche Angaben: die des bleibenden Eintrags gewinnen, leere Felder
-- werden aus dem doppelten ergaenzt. Einwilligungen ziehen mit um; die
-- Namensanzeige folgt danach dem juengsten Eintrag "name_oeffentlich". Der
-- Rating-Stand des doppelten Eintrags faellt weg (neu berechnen).

create function public.personen_zusammenfuehren(p_behalten uuid, p_weg uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_verein   uuid;
  v_b        public.personen;
  v_w        public.personen;
  v_konflikt text;
  v_turniere int;
  v_partien  int;
  v_letzte   text;
begin
  select * into v_b from public.personen where id = p_behalten;
  select * into v_w from public.personen where id = p_weg;
  if v_b.id is null or v_w.id is null then
    raise exception 'Spieler nicht gefunden.';
  end if;
  if v_b.id = v_w.id then
    raise exception 'Das ist derselbe Spieler.';
  end if;
  if v_b.verein_id <> v_w.verein_id then
    raise exception 'Die Spieler gehören zu verschiedenen Vereinen.';
  end if;
  v_verein := v_b.verein_id;
  if not public.hat_rolle(v_verein, '{vereinsadmin}') then
    raise exception 'Zusammenführen darf nur der Vereins-Administrator.';
  end if;
  if v_b.anonymisiert_am is not null or v_w.anonymisiert_am is not null then
    raise exception 'Anonymisierte Spieler lassen sich nicht zusammenführen.';
  end if;

  -- Gemeinsames Turnier?
  select string_agg(t.name || ' (' || to_char(t.datum, 'DD.MM.YYYY') || ')', ', ' order by t.datum)
    into v_konflikt
    from public.turniere t
   where exists (select 1 from public.turnier_teilnehmer x where x.turnier_id = t.id and x.person_id = p_behalten)
     and exists (select 1 from public.turnier_teilnehmer x where x.turnier_id = t.id and x.person_id = p_weg);
  if v_konflikt is not null then
    raise exception 'Beide stehen im selben Turnier: %. Dort zuerst einen von beiden ersetzen.', v_konflikt;
  end if;
  -- Gemeinsame Partie (auch Liga, Doppel, Einzelspiel)?
  if exists (
    select 1 from public.partien p
     where p.verein_id = v_verein
       and p_behalten in (p.spieler_a, p.spieler_b, p.partner_a, p.partner_b)
       and p_weg in (p.spieler_a, p.spieler_b, p.partner_a, p.partner_b)
  ) then
    raise exception 'Beide stehen in derselben Partie. Zusammenführen ist dann nicht möglich.';
  end if;
  -- Zwei verschiedene Konten?
  if exists (select 1 from public.benutzer_personen where person_id = p_behalten)
     and exists (select 1 from public.benutzer_personen where person_id = p_weg) then
    raise exception 'Beide Spieler sind mit einem Konto verknüpft. Zuerst eine Verknüpfung unter Konten und Rollen lösen.';
  end if;

  select count(*) into v_turniere from public.turnier_teilnehmer where person_id = p_weg;
  select count(*) into v_partien from public.partien
   where p_weg in (spieler_a, spieler_b, partner_a, partner_b);

  -- Turniere und Partien
  update public.turnier_teilnehmer set person_id = p_behalten where person_id = p_weg;
  update public.partien set spieler_a = p_behalten where spieler_a = p_weg;
  update public.partien set spieler_b = p_behalten where spieler_b = p_weg;
  update public.partien set partner_a = p_behalten where partner_a = p_weg;
  update public.partien set partner_b = p_behalten where partner_b = p_weg;
  update public.aufnahmen_141 set spieler = p_behalten where spieler = p_weg;

  -- Anmeldungen und Kader: doppelte Zeilen fallen weg
  delete from public.turnier_anmeldungen a
   where a.person_id = p_weg
     and exists (select 1 from public.turnier_anmeldungen b where b.turnier_id = a.turnier_id and b.person_id = p_behalten);
  update public.turnier_anmeldungen set person_id = p_behalten where person_id = p_weg;
  delete from public.mannschaft_spieler a
   where a.person_id = p_weg
     and exists (select 1 from public.mannschaft_spieler b where b.mannschaft_id = a.mannschaft_id and b.person_id = p_behalten);
  update public.mannschaft_spieler set person_id = p_behalten where person_id = p_weg;

  -- Konto-Verknuepfung und Einladungen
  update public.benutzer_personen set person_id = p_behalten where person_id = p_weg;
  update public.einladungen set person_id = p_behalten where person_id = p_weg;

  -- Vertrauliche Angaben: bleibender Eintrag gewinnt, Luecken aus dem doppelten
  if exists (select 1 from public.personen_intern where person_id = p_behalten) then
    update public.personen_intern b
       set eintritt         = coalesce(b.eintritt, w.eintritt),
           austritt         = coalesce(b.austritt, w.austritt),
           minderjaehrig    = b.minderjaehrig or w.minderjaehrig,
           rating_startwert = coalesce(b.rating_startwert, w.rating_startwert),
           notiz            = coalesce(nullif(b.notiz, ''), w.notiz),
           passnummer       = coalesce(nullif(b.passnummer, ''), w.passnummer),
           dbu_nummer       = coalesce(nullif(b.dbu_nummer, ''), w.dbu_nummer)
      from public.personen_intern w
     where b.person_id = p_behalten and w.person_id = p_weg;
    delete from public.personen_intern where person_id = p_weg;
  else
    update public.personen_intern set person_id = p_behalten where person_id = p_weg;
  end if;

  -- Einwilligungen ziehen um; Namensanzeige folgt dem juengsten Eintrag
  update public.einwilligungen set person_id = p_behalten where person_id = p_weg;
  select e.vorgang into v_letzte
    from public.einwilligungen e
   where e.person_id = p_behalten and e.art = 'name_oeffentlich'
   order by e.am desc limit 1;
  if v_letzte is not null then
    perform set_config('cuedesk.einwilligung', 'an', true);
    update public.personen set name_oeffentlich = (v_letzte = 'erteilt') where id = p_behalten;
    perform set_config('cuedesk.einwilligung', '', true);
  end if;

  -- Rating-Stand des doppelten Eintrags faellt mit ihm weg (Kaskade)
  delete from public.personen where id = p_weg;

  perform public.protokollieren('spieler_zusammengefuehrt', v_verein, jsonb_build_object(
    'behalten', trim(v_b.vorname || ' ' || v_b.nachname),
    'aufgeloest', trim(v_w.vorname || ' ' || v_w.nachname),
    'turniere', v_turniere, 'partien', v_partien));

  return jsonb_build_object('turniere', v_turniere, 'partien', v_partien);
end;
$$;

revoke execute on function public.personen_zusammenfuehren(uuid, uuid) from public, anon;
grant execute on function public.personen_zusammenfuehren(uuid, uuid) to authenticated;
