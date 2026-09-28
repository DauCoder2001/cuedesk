-- =============================================================
--  Stufe 16: Anmeldung zu Turnieren
--
--  Mitglieder mit Konto melden sich selbst an oder ab, solange die
--  Ausschreibung (turniere.einstellungen.ausschreibung) offen ist und der
--  Meldeschluss nicht vorbei ist. Die Leitung darf immer eintragen.
--  Abmelden setzt abgemeldet_am, damit die Leitung es sieht.
-- =============================================================

create table public.turnier_anmeldungen (
  turnier_id     uuid not null,
  person_id      uuid not null,
  verein_id      uuid not null,
  angemeldet_am  timestamptz not null default now(),
  abgemeldet_am  timestamptz,
  angemeldet_von uuid default auth.uid(),
  primary key (turnier_id, person_id),
  foreign key (verein_id, turnier_id) references public.turniere (verein_id, id) on delete cascade,
  foreign key (verein_id, person_id)  references public.personen (verein_id, id) on delete cascade
);
create index turnier_anmeldungen_verein on public.turnier_anmeldungen (verein_id);
alter table public.turnier_anmeldungen enable row level security;

create policy anmeldungen_lesen on public.turnier_anmeldungen for select to authenticated
  using (public.ist_im_verein(verein_id) or public.support_freigegeben(verein_id));
create policy anmeldungen_leitung on public.turnier_anmeldungen for all to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'))
  with check (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));

grant select, insert, update, delete on public.turnier_anmeldungen to authenticated;
grant all on public.turnier_anmeldungen to service_role;

create trigger protokoll after insert or update or delete on public.turnier_anmeldungen
  for each row execute function public.aenderung_protokollieren();

-- Selbst an- oder abmelden (p_an = true: anmelden)
create function public.turnier_anmelden(p_turnier uuid, p_an boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.turniere;
  v_person uuid;
  v_schluss timestamptz;
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
  if p_an then
    insert into public.turnier_anmeldungen (turnier_id, person_id, verein_id)
    values (t.id, v_person, t.verein_id)
    on conflict (turnier_id, person_id)
      do update set abgemeldet_am = null, angemeldet_am = now(), angemeldet_von = auth.uid();
  else
    update public.turnier_anmeldungen set abgemeldet_am = now()
     where turnier_id = t.id and person_id = v_person and abgemeldet_am is null;
  end if;
end;
$$;

revoke execute on function public.turnier_anmelden(uuid, boolean) from public, anon;
grant execute on function public.turnier_anmelden(uuid, boolean) to authenticated;
