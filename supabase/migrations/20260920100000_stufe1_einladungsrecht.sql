-- =============================================================
--  CueDesk, Stufe 1: Recht zum Einladen
--
--  Einladen duerfen: Vereins-Administrator, Sportwart und jedes
--  Konto, dem der Vereins-Administrator den Schalter gesetzt hat
--  (Vorstandsmitglieder und andere ausgewaehlte Personen).
--  Wer nur den Schalter hat, darf ausschliesslich mit der Rolle
--  "mitglied" einladen.
-- =============================================================

create table public.benutzer_rechte (
  benutzer_id    uuid not null references public.benutzer (id) on delete cascade,
  verein_id      uuid not null references public.vereine (id) on delete restrict,
  darf_einladen  boolean not null default false,
  primary key (benutzer_id, verein_id)
);

alter table public.benutzer_rechte enable row level security;
grant select, insert, update, delete on public.benutzer_rechte to authenticated;

create trigger protokoll after insert or update or delete on public.benutzer_rechte
  for each row execute function public.aenderung_protokollieren();

create policy rechte_lesen on public.benutzer_rechte for select to authenticated
  using (benutzer_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());
create policy rechte_schreiben on public.benutzer_rechte for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin())
  with check (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());

create function public.darf_einladen(p_verein uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.hat_rolle(p_verein, '{vereinsadmin,sportwart}')
      or exists (
        select 1
        from public.benutzer_rechte r
        join public.benutzer b on b.id = r.benutzer_id
        where r.benutzer_id = auth.uid() and b.aktiv
          and r.verein_id = p_verein and r.darf_einladen
      );
$$;
revoke execute on function public.darf_einladen(uuid) from public, anon;
grant execute on function public.darf_einladen(uuid) to authenticated;

-- Einladungen: lesen und anlegen darf jeder mit Einladungsrecht,
-- aber nur der Vereins-Administrator vergibt andere Rollen als "mitglied".
drop policy einladungen_admin on public.einladungen;

create policy einladungen_lesen on public.einladungen for select to authenticated
  using (public.darf_einladen(verein_id) or public.ist_systemadmin());

create policy einladungen_anlegen on public.einladungen for insert to authenticated
  with check (
    public.hat_rolle(verein_id, '{vereinsadmin}')
    or public.ist_systemadmin()
    or (public.darf_einladen(verein_id) and rollen <@ '{mitglied}'::public.rolle[])
  );

create policy einladungen_aendern on public.einladungen for update to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin())
  with check (public.hat_rolle(verein_id, '{vereinsadmin}') or public.ist_systemadmin());

-- Zuruecknehmen darf auch, wer die Einladung anlegen durfte, solange sie offen ist.
create policy einladungen_loeschen on public.einladungen for delete to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin}')
    or public.ist_systemadmin()
    or (public.darf_einladen(verein_id) and angenommen_am is null and rollen <@ '{mitglied}'::public.rolle[])
  );

-- Wer einladen darf, darf dabei auch eine neue Person anlegen.
create policy personen_anlegen on public.personen for insert to authenticated
  with check (public.darf_einladen(verein_id));

-- Niemand entzieht sich selbst die Rolle Vereins-Administrator.
create function public.admin_selbstsperre() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.rolle = 'vereinsadmin' and old.benutzer_id = auth.uid() then
    raise exception 'Die Rolle Vereins-Administrator kann man sich nicht selbst entziehen.';
  end if;
  return old;
end;
$$;
revoke execute on function public.admin_selbstsperre() from public, anon, authenticated;

create trigger admin_selbstsperre before delete on public.benutzer_rollen
  for each row execute function public.admin_selbstsperre();
