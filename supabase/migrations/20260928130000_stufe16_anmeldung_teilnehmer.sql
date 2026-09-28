-- =============================================================
--  Stufe 16b: Anmeldung macht direkt zum Teilnehmer
--
--  Bis zur Auslosung (Status geplant): Wer sich anmeldet, steht sofort in
--  turnier_teilnehmer, solange die Hoechstzahl nicht erreicht ist; sonst
--  ist er Nachruecker. Wer sich abmeldet, faellt aus den Teilnehmern, und
--  der am laengsten wartende Nachruecker rueckt nach.
--  Die Leitung kann weiter von Hand hinzufuegen und entfernen.
-- =============================================================

create or replace function public.turnier_anmelden(p_turnier uuid, p_an boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.turniere;
  v_person uuid;
  v_schluss timestamptz;
  v_hoechst integer;
  v_platz boolean;
begin
  select * into t from public.turniere where id = p_turnier;
  -- ist_im_verein() liefert ohne Tablet NULL statt false, deshalb coalesce
  if t.id is null or not coalesce(public.ist_im_verein(t.verein_id), false) then
    raise exception 'Turnier nicht gefunden.';
  end if;
  select person_id into v_person from public.benutzer_personen
   where benutzer_id = auth.uid() and verein_id = t.verein_id;
  if v_person is null then
    raise exception 'Dein Konto ist noch mit keinem Spieler verknüpft. Das macht der Vereins-Administrator unter Benutzer und Rollen.';
  end if;
  v_schluss := nullif(t.einstellungen #>> '{ausschreibung,meldeschluss}', '')::timestamptz;
  if t.status <> 'geplant'
     or coalesce((t.einstellungen #>> '{ausschreibung,offen}')::boolean, false) = false
     or (v_schluss is not null and now() > v_schluss) then
    raise exception 'Die Anmeldung zu diesem Turnier ist geschlossen.';
  end if;
  v_hoechst := nullif(t.einstellungen #>> '{ausschreibung,hoechstens}', '')::integer;

  if p_an then
    insert into public.turnier_anmeldungen (turnier_id, person_id, verein_id)
    values (t.id, v_person, t.verein_id)
    on conflict (turnier_id, person_id)
      do update set abgemeldet_am = null, angemeldet_am = now(), angemeldet_von = auth.uid();
    -- Teilnehmer, solange Platz ist
    select v_hoechst is null or count(*) < v_hoechst into v_platz
      from public.turnier_teilnehmer where turnier_id = t.id;
    if v_platz then
      insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id)
      values (t.id, v_person, t.verein_id)
      on conflict do nothing;
    end if;
  else
    update public.turnier_anmeldungen set abgemeldet_am = now()
     where turnier_id = t.id and person_id = v_person and abgemeldet_am is null;
    delete from public.turnier_teilnehmer where turnier_id = t.id and person_id = v_person;
    -- Der am laengsten wartende Nachruecker rueckt nach
    if found and v_hoechst is not null then
      insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id)
      select t.id, a.person_id, t.verein_id
        from public.turnier_anmeldungen a
       where a.turnier_id = t.id and a.abgemeldet_am is null
         and not exists (select 1 from public.turnier_teilnehmer x
                          where x.turnier_id = t.id and x.person_id = a.person_id)
         and (select count(*) from public.turnier_teilnehmer x where x.turnier_id = t.id) < v_hoechst
       order by a.angemeldet_am
       limit 1;
    end if;
  end if;
end;
$$;

-- Bestehende Anmeldungen nachziehen (Turniere in Vorbereitung ohne Hoechstzahl)
insert into public.turnier_teilnehmer (turnier_id, person_id, verein_id)
select a.turnier_id, a.person_id, a.verein_id
  from public.turnier_anmeldungen a
  join public.turniere t on t.id = a.turnier_id
 where a.abgemeldet_am is null and t.status = 'geplant'
   and nullif(t.einstellungen #>> '{ausschreibung,hoechstens}', '') is null
on conflict do nothing;
