-- Stufe 23: Zustimmung der Vereine zu Nutzungsbedingungen und Vertrag zur
-- Auftragsverarbeitung (nutzungsbedingungen.html, auftragsverarbeitung.html).
--
-- Ein Vereins-Administrator stimmt fuer den Verein zu; gespeichert werden
-- Fassung, Zeitpunkt und Konto. Die Fassung steht in src/vertraege.ts; wird
-- sie hochgezaehlt, muss der Verein erneut zustimmen. Bis dahin sperrt die
-- Oberflaeche die Verwaltung (Tablets und Live laufen weiter).

create table public.vertragszustimmungen (
  id             uuid primary key default gen_random_uuid(),
  verein_id      uuid not null references public.vereine (id) on delete cascade,
  fassung        text not null,
  zugestimmt_am  timestamptz not null default now(),
  benutzer_id    uuid default auth.uid(),
  unique (verein_id, fassung)
);
alter table public.vertragszustimmungen enable row level security;

-- Alle im Verein lesen, damit die Oberflaeche weiss, ob gesperrt ist;
-- der Systemadmin sieht den Stand in der Konsole.
create policy vertragszustimmungen_lesen on public.vertragszustimmungen for select to authenticated
  using (public.ist_im_verein(verein_id) or public.ist_systemadmin());
revoke all on public.vertragszustimmungen from anon, authenticated;
grant select on public.vertragszustimmungen to authenticated;

create function public.vertrag_zustimmen(p_verein uuid, p_fassung text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.hat_rolle(p_verein, '{vereinsadmin}'), false) then
    raise exception 'Zustimmen kann nur ein Vereins-Administrator.';
  end if;
  if coalesce(trim(p_fassung), '') = '' then
    raise exception 'Fassung fehlt.';
  end if;
  insert into public.vertragszustimmungen (verein_id, fassung, benutzer_id)
  values (p_verein, p_fassung, auth.uid())
  on conflict (verein_id, fassung) do nothing;
  perform public.protokollieren('vertrag_zugestimmt', p_verein, jsonb_build_object('fassung', p_fassung));
end;
$$;
revoke execute on function public.vertrag_zustimmen(uuid, text) from public, anon;
grant execute on function public.vertrag_zustimmen(uuid, text) to authenticated;
