-- Liegengebliebene Tischstaende nach 48 Stunden entfernen (Entscheidung 21.11.2026)
--
-- Jedes Tablet schreibt seinen Spielstand in live_stand. Wird ein Spiel nicht
-- zu Ende gespeichert (Tablet aus, Spiel abgebrochen, freies Training), blieb
-- der letzte Stand bisher unbegrenzt liegen und erschien in der
-- Live-Uebersicht als "nicht gespeichert". Aufgeraeumt wurde nur von Hand in
-- der Konsole (14 Tage).
--
-- Jetzt entfernt ein naechtlicher Lauf (03:45 UTC, wie fristen_loeschen) jeden
-- Stand, der seit 48 Stunden nicht geaendert wurde - mit oder ohne Turnier.
-- Laufende Spiele sind nie betroffen: Jeder Punkt erneuert den Stand. Die
-- Turnierleitung hat damit zwei Tage, ein liegengebliebenes Ergebnis noch zu
-- speichern; die Live-Uebersicht nennt die Nacht, in der es entfernt wird
-- (src/live.ts, entferntAm). Das Aufraeumen in der Konsole nutzt dieselbe Frist.

create function public.tischstaende_loeschen() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.live_stand where aktualisiert < now() - interval '48 hours';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke execute on function public.tischstaende_loeschen() from public, anon, authenticated;

select cron.schedule('tischstaende-loeschen', '45 3 * * *', 'select public.tischstaende_loeschen()');

-- Konsole -> Aufraeumen: dieselbe Frist (vorher 14 Tage)
create or replace function public.aufraeumen_intern(p_ausfuehren boolean, p_arten text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v   jsonb := '{}'::jsonb;
  n   integer;
begin
  -- Kopplungscodes gelten 15 Minuten
  if p_ausfuehren and 'kopplungen' = any(p_arten) then
    delete from public.kopplungen where erstellt_am < now() - interval '15 minutes';
  end if;
  select count(*) into n from public.kopplungen where erstellt_am < now() - interval '15 minutes';
  v := v || jsonb_build_object('kopplungen', n);

  -- Tablet-Anmeldungen ohne Geraet (entfernte Tablets, abgebrochene Kopplungen)
  if p_ausfuehren and 'tablet_konten' = any(p_arten) then
    delete from auth.users u
     where u.is_anonymous and u.created_at < now() - interval '1 day'
       and not exists (select 1 from public.geraete g where g.auth_id = u.id);
  end if;
  select count(*) into n from auth.users u
   where u.is_anonymous and u.created_at < now() - interval '1 day'
     and not exists (select 1 from public.geraete g where g.auth_id = u.id);
  v := v || jsonb_build_object('tablet_konten', n);

  -- Tablets, die sich seit 90 Tagen nicht gemeldet haben
  if p_ausfuehren and 'tablets_alt' = any(p_arten) then
    delete from auth.users u using public.geraete g
     where g.auth_id = u.id and coalesce(g.zuletzt_gesehen, g.erstellt_am) < now() - interval '90 days';
    delete from public.geraete g where coalesce(g.zuletzt_gesehen, g.erstellt_am) < now() - interval '90 days';
  end if;
  select count(*) into n from public.geraete g
   where coalesce(g.zuletzt_gesehen, g.erstellt_am) < now() - interval '90 days';
  v := v || jsonb_build_object('tablets_alt', n);

  -- Einladungen, die 30 Tage niemand angenommen hat
  if p_ausfuehren and 'einladungen' = any(p_arten) then
    delete from public.einladungen where angenommen_am is null and erstellt_am < now() - interval '30 days';
  end if;
  select count(*) into n from public.einladungen where angenommen_am is null and erstellt_am < now() - interval '30 days';
  v := v || jsonb_build_object('einladungen', n);

  -- Tischstaende, die seit 48 Stunden niemand geaendert hat (wie tischstaende_loeschen)
  if p_ausfuehren and 'tischstaende' = any(p_arten) then
    delete from public.live_stand where aktualisiert < now() - interval '48 hours';
  end if;
  select count(*) into n from public.live_stand where aktualisiert < now() - interval '48 hours';
  v := v || jsonb_build_object('tischstaende', n);

  -- Aenderungsprotokoll aelter als zwei Jahre
  if p_ausfuehren and 'aenderungen' = any(p_arten) then
    delete from public.aenderungen where zeitpunkt < now() - interval '2 years';
  end if;
  select count(*) into n from public.aenderungen where zeitpunkt < now() - interval '2 years';
  v := v || jsonb_build_object('aenderungen', n);

  -- Aenderungsprotokoll von Vereinen, die es nicht mehr gibt
  if p_ausfuehren and 'aenderungen_verwaist' = any(p_arten) then
    delete from public.aenderungen a
     where a.verein_id is not null
       and not exists (select 1 from public.vereine v where v.id = a.verein_id);
  end if;
  select count(*) into n from public.aenderungen a
   where a.verein_id is not null
     and not exists (select 1 from public.vereine v where v.id = a.verein_id);
  v := v || jsonb_build_object('aenderungen_verwaist', n);

  -- Rueckmeldungen der Sicherung aelter als ein Jahr
  if p_ausfuehren and 'ereignisse' = any(p_arten) then
    delete from public.system_ereignisse where zeit < now() - interval '1 year';
  end if;
  select count(*) into n from public.system_ereignisse where zeit < now() - interval '1 year';
  v := v || jsonb_build_object('ereignisse', n);

  return v;
end;
$function$;
