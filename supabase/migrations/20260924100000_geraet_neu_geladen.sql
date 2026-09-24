-- =============================================================
--  CueDesk: Ein Tablet quittiert das Neuladen selbst
--
--  Seine eigene Zeile in geraete darf ein Tablet nicht aendern (das duerfen
--  nur Vereins-Admin und Turnierleitung), deshalb diese kleine Funktion -
--  genau wie bei geraet_meldet_sich().
-- =============================================================

create function public.geraet_neu_geladen() returns void
language sql security definer set search_path = ''
as $$
  update public.geraete set neu_laden_am = null where auth_id = auth.uid();
$$;

revoke execute on function public.geraet_neu_geladen() from public, anon;
grant execute on function public.geraet_neu_geladen() to authenticated;
