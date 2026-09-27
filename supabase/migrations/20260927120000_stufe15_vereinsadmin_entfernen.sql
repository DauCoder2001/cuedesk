-- =============================================================
--  Stufe 15: Vereins-Administrator entfernen
--
--  1. Regel: Der letzte Vereins-Administrator eines Vereins bleibt.
--     Gilt ueberall (Konsole, Benutzer und Rollen, direkte Aenderungen).
--     Ausnahme: das Loeschen eines ganzen Vereins.
--     Neue Vereine duerfen weiter ohne Administrator starten.
--  2. vereinsadmin_entziehen(): der Super-Admin nimmt einem Konto die
--     Rolle Vereins-Administrator; andere Rollen im Verein bleiben.
-- =============================================================

create function public.letzter_vereinsadmin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('cuedesk.verein_loeschen', true) = 'an' then
    return coalesce(new, old);
  end if;
  if old.rolle = 'vereinsadmin'
     and (tg_op = 'DELETE' or new.rolle is distinct from 'vereinsadmin' or new.verein_id is distinct from old.verein_id)
     and not exists (
       select 1 from public.benutzer_rollen r
        where r.verein_id = old.verein_id and r.rolle = 'vereinsadmin'
          and r.benutzer_id <> old.benutzer_id)
  then
    raise exception 'Der letzte Vereins-Administrator eines Vereins kann nicht entfernt werden. Lade zuerst einen neuen ein.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger letzter_vereinsadmin before delete or update on public.benutzer_rollen
  for each row execute function public.letzter_vereinsadmin();

create function public.vereinsadmin_entziehen(p_verein uuid, p_benutzer uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
begin
  if not public.ist_systemadmin() then
    raise exception 'Nur für Super-Admins.';
  end if;
  select email into v_email from public.benutzer where id = p_benutzer;
  delete from public.benutzer_rollen
   where verein_id = p_verein and benutzer_id = p_benutzer and rolle = 'vereinsadmin';
  if not found then
    raise exception 'Dieses Konto ist dort kein Vereins-Administrator.';
  end if;
  perform public.protokollieren('vereinsadmin_entfernt', p_verein, jsonb_build_object('email', v_email));
end;
$$;

revoke execute on function public.letzter_vereinsadmin() from public, anon, authenticated;
revoke execute on function public.vereinsadmin_entziehen(uuid, uuid) from public, anon;
grant execute on function public.vereinsadmin_entziehen(uuid, uuid) to authenticated;
