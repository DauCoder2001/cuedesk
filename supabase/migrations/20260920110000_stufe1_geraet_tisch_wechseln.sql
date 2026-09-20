-- Ein Geraet darf seinen eigenen Tisch wechseln (nur innerhalb seines Vereins).
-- Damit muss am Spieltag niemand ans Notebook, wenn ein Tablet den Tisch wechselt.
create function public.geraet_tisch_setzen(p_tisch uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_verein uuid;
begin
  select verein_id into v_verein from public.geraete where auth_id = auth.uid() and aktiv;
  if v_verein is null then
    raise exception 'Geraet ist nicht gekoppelt';
  end if;
  if p_tisch is not null and not exists (
    select 1 from public.tische t where t.id = p_tisch and t.verein_id = v_verein and t.aktiv
  ) then
    raise exception 'Tisch gehoert nicht zu diesem Verein';
  end if;
  update public.geraete
     set tisch_id = p_tisch, zuletzt_gesehen = now()
   where auth_id = auth.uid();
end;
$$;
revoke execute on function public.geraet_tisch_setzen(uuid) from public, anon;
grant execute on function public.geraet_tisch_setzen(uuid) to authenticated;
