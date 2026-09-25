-- =============================================================
--  Nachtrag zu Stufe 13: Demo zuruecksetzen
--  Der Status der Demo-Spieler braucht eine Typumwandlung; weniger
--  Ueberraschungssiege, damit die Tabelle glaubwuerdig aussieht.
-- =============================================================

-- Inhalte eines Test-Vereins weg, Beispieldaten neu. Konten, Rollen,
-- Tablets, Tische und Einstellungen bleiben; Personen mit Konto auch.
create or replace function public.demo_zuruecksetzen(p_verein uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_personen uuid[] := '{}';
  v_id       uuid;
  v_turnier  uuid;
  v_tische   uuid[];
  v_vor      text[] := array['Anna','Bernd','Carla','Dirk','Elke','Frank','Greta','Hauke','Ines','Jens','Kerstin','Lars'];
  v_nach     text[] := array['Albers','Brandt','Claussen','Dierks','Ehlers','Fricke','Garbers','Hollmann','Imken','Janssen','Kruse','Lüdemann'];
  v_start    int[]  := array[720, 690, 660, 640, 610, 590, 560, 540, 520, 500, 470, 450];
  i int; r int; k int;
  a int; b int; n int := 6;
  v_kreis int[];
  v_sieger int; v_rest int;
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur für Super-Admins.';
  end if;
  if not exists (select 1 from public.vereine where id = p_verein and ist_test) then
    raise exception 'Demo zurücksetzen geht nur bei Test-Vereinen.';
  end if;

  delete from public.live_stand          where verein_id = p_verein;
  delete from public.aufnahmen_141       where verein_id = p_verein;
  delete from public.partien_141         where verein_id = p_verein;
  delete from public.partien             where verein_id = p_verein;
  delete from public.turnier_teilnehmer  where verein_id = p_verein;
  delete from public.turniere            where verein_id = p_verein;
  delete from public.serien              where verein_id = p_verein;
  delete from public.mannschaft_spieler  where verein_id = p_verein;
  delete from public.mannschaften        where verein_id = p_verein;
  delete from public.rating_stand        where verein_id = p_verein;
  delete from public.einladungen         where verein_id = p_verein and angenommen_am is null;
  delete from public.personen p
   where p.verein_id = p_verein
     and not exists (select 1 from public.benutzer_personen bp where bp.person_id = p.id);
  delete from public.aenderungen where verein_id = p_verein;

  -- 12 erfundene Spieler, die letzten zwei als Gaeste
  for i in 1..12 loop
    insert into public.personen (verein_id, vorname, nachname, status, name_oeffentlich)
    values (p_verein, v_vor[i], v_nach[i], (case when i > 10 then 'gast' else 'mitglied' end)::public.personen_status, true)
    returning id into v_id;
    insert into public.personen_intern (person_id, verein_id, eintritt, rating_startwert)
    values (v_id, p_verein, current_date - (i * 97), v_start[i]);
    v_personen := v_personen || v_id;
  end loop;

  -- Tische nur, wenn es noch keine gibt
  if not exists (select 1 from public.tische where verein_id = p_verein) then
    insert into public.tische (verein_id, nummer, bezeichnung)
    select p_verein, x, 'Tisch ' || x from generate_series(1, 4) x;
  end if;
  select array_agg(id order by nummer) into v_tische from public.tische where verein_id = p_verein;

  -- Beendetes 8-Ball-Turnier: 6 Spieler, jeder gegen jeden, Race to 4
  insert into public.turniere (verein_id, name, datum, disziplin, modus, status, rating_werten,
                               eingefroren_am, teilnehmerzahl, einstellungen)
  values (p_verein, 'Demo-Turnier 8-Ball', current_date - 14, '8-ball', 'einzelgruppe', 'beendet', true,
          now() - interval '14 days', n,
          '{"raceTo": 4, "vorgabe": {"aktiv": false, "staerke": 75, "obergrenze": 0}}'::jsonb)
  returning id into v_turnier;
  for i in 1..n loop
    insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id, startnummer,
                                           rating_eingefroren, rating_quelle)
    values (v_turnier, v_personen[i], p_verein, i, v_start[i], 'startwert');
  end loop;

  -- Rundenplan nach dem Kreisverfahren; meist gewinnt der Staerkere,
  -- 3 der 15 Spiele sind Ueberraschungen.
  v_kreis := array[1, 2, 3, 4, 5, 6];
  for r in 1..n - 1 loop
    for k in 1..n / 2 loop
      a := v_kreis[k];
      b := v_kreis[n + 1 - k];
      v_sieger := case when (a + 2 * b + r) % 5 = 0 then greatest(a, b) else least(a, b) end;
      v_rest := (a * 7 + b * 3 + r) % 4;
      insert into public.partien (verein_id, turnier_id, disziplin, datum, phase, runde, paarung, tisch_id,
                                  spieler_a, spieler_b, race_to, ergebnis_a, ergebnis_b, status,
                                  rating_werten, begonnen, beendet)
      values (p_verein, v_turnier, '8-ball', current_date - 14, 'gruppe', r, k, v_tische[1 + (k - 1) % cardinality(v_tische)],
              v_personen[a], v_personen[b], 4,
              case when v_sieger = a then 4 else v_rest end,
              case when v_sieger = b then 4 else v_rest end,
              'beendet', true,
              (current_date - 14) + time '19:00' + (r * interval '40 minutes'),
              (current_date - 14) + time '19:30' + (r * interval '40 minutes'));
    end loop;
    -- Kreis drehen, der erste bleibt stehen
    v_kreis := array[v_kreis[1], v_kreis[n]] || v_kreis[2:n - 1];
  end loop;

  -- Endplaetze nach Siegen, dann Spieldifferenz
  update public.turnier_teilnehmer t set endplatz = s.platz
    from (
      select x.person_id, row_number() over (order by sum(x.sieg) desc, sum(x.diff) desc) as platz
        from (
          select spieler_a as person_id, (ergebnis_a > ergebnis_b)::int as sieg, ergebnis_a - ergebnis_b as diff
            from public.partien where turnier_id = v_turnier
          union all
          select spieler_b, (ergebnis_b > ergebnis_a)::int, ergebnis_b - ergebnis_a
            from public.partien where turnier_id = v_turnier
        ) x group by x.person_id
    ) s
   where t.turnier_id = v_turnier and t.person_id = s.person_id;

  -- Geplantes 9-Ball-Turnier zum Ausprobieren, 8 Anmeldungen
  insert into public.turniere (verein_id, name, datum, disziplin, modus, status, einstellungen)
  values (p_verein, 'Demo-Turnier 9-Ball', current_date + 7, '9-ball', 'einzelgruppe', 'geplant',
          '{"raceTo": 5, "vorgabe": {"aktiv": true, "staerke": 75, "obergrenze": 0}}'::jsonb)
  returning id into v_turnier;
  for i in 3..10 loop
    insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id)
    values (v_turnier, v_personen[i], p_verein);
  end loop;

  perform public.protokollieren('demo_zurueckgesetzt', p_verein, '{}'::jsonb);
end;
$$;
