-- =============================================================
--  Stufe 10: Seite "System" fuer den Vereins-Administrator
--
--  1. vereine.einstellungen: Vorgaben fuer neue Turniere und Liga-
--     Spieltage, Saisonbeginn. Nichts Geheimes - vereine ist fuer die
--     Vereinsauswahl ohne Anmeldung lesbar. Name, Kuerzel und Logo
--     (logo_url) gibt es schon; aendern darf sie der Vereins-Admin
--     bereits heute (Richtlinie vereine_aendern).
--
--  2. verein_schutzwort: das Wort fuer "Tablet neu laden" und
--     "Aufstellung zeigen". Niemand liest es direkt: Die Tabelle hat
--     keine Richtlinien, gesetzt und geprueft wird nur ueber die beiden
--     Funktionen. Ohne Eintrag gilt wie bisher "8-ball".
-- =============================================================

alter table public.vereine
  add column einstellungen jsonb not null default '{}'::jsonb;

create table public.verein_schutzwort (
  verein_id    uuid primary key references public.vereine (id) on delete cascade,
  wort         text not null check (length(btrim(wort)) between 3 and 40),
  geaendert_am timestamptz not null default now()
);
alter table public.verein_schutzwort enable row level security;

-- Stimmt das eingegebene Wort? Fragen darf jedes Vereinsmitglied mit Rolle.
create function public.schutzwort_stimmt(p_verein uuid, p_wort text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.hat_rolle(p_verein, '{vereinsadmin,sportwart,turnierleiter,mitglied}')
     and lower(btrim(p_wort)) = coalesce(
           (select lower(btrim(s.wort)) from public.verein_schutzwort s where s.verein_id = p_verein),
           '8-ball');
$$;

-- Neues Wort setzen: nur der Vereins-Administrator
create function public.schutzwort_setzen(p_verein uuid, p_wort text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
    raise exception 'Das Schutzwort darf nur der Vereins-Administrator ändern.';
  end if;
  insert into public.verein_schutzwort (verein_id, wort)
  values (p_verein, btrim(p_wort))
  on conflict (verein_id) do update set wort = excluded.wort, geaendert_am = now();
end;
$$;

revoke execute on function public.schutzwort_stimmt(uuid, text) from public, anon;
revoke execute on function public.schutzwort_setzen(uuid, text) from public, anon;
grant execute on function public.schutzwort_stimmt(uuid, text) to authenticated;
grant execute on function public.schutzwort_setzen(uuid, text) to authenticated;
