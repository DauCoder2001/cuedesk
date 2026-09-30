-- Stufe 24: Chat je Turnier fuer die Zuschauerseite.
--
-- - Nur angemeldete Mitglieder des Vereins lesen und schreiben (keine Tablets).
-- - Schreiben nur, wenn der Verein den Chat eingeschaltet hat
--   (vereine.einstellungen.chat, Seite "System"), das Turnier ihn vorsieht
--   (turniere.einstellungen.chat, beim Anlegen gewaehlt) und das Turnier
--   laeuft. Beim Liga-Spieltag gehoert der Chat zur 1. Begegnung und ist
--   offen, solange eine der beiden Begegnungen laeuft.
-- - Text 1 bis 300 Zeichen. Der Name des Schreibenden wird beim Schreiben
--   festgehalten, weil Mitglieder die Konten anderer nicht lesen duerfen.
-- - Loeschen: eigene Beitraege, dazu Vereins-Admin, Sportwart, Turnierleiter.
-- - Aufbewahrung: 1 Tag nach Turnierende (neue Spalte turniere.beendet_am),
--   geloescht vom naechtlichen Lauf fristen_loeschen.

-- ---------- Turnierende festhalten ----------
alter table public.turniere add column beendet_am timestamptz;
update public.turniere set beendet_am = now() where status in ('beendet', 'abgebrochen');

create function public.turnier_beendet_am() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status in ('beendet', 'abgebrochen') and old.status not in ('beendet', 'abgebrochen') then
    new.beendet_am := now();
  elsif new.status not in ('beendet', 'abgebrochen') then
    new.beendet_am := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.turnier_beendet_am() from public, anon, authenticated;
create trigger turnier_beendet_am before update of status on public.turniere
  for each row execute function public.turnier_beendet_am();

-- ---------- Beitraege ----------
create table public.chat_beitraege (
  id           uuid primary key default gen_random_uuid(),
  verein_id    uuid not null references public.vereine (id) on delete cascade,
  turnier_id   uuid not null references public.turniere (id) on delete cascade,
  benutzer_id  uuid default auth.uid(),
  name         text not null,
  text         text not null check (char_length(text) between 1 and 300),
  erstellt_am  timestamptz not null default now()
);
create index chat_beitraege_turnier on public.chat_beitraege (turnier_id, erstellt_am);
alter table public.chat_beitraege enable row level security;

create policy chat_lesen on public.chat_beitraege for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter,mitglied}'));
create policy chat_loeschen on public.chat_beitraege for delete to authenticated
  using (benutzer_id = auth.uid() or public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}'));
revoke all on public.chat_beitraege from anon, authenticated;
grant select, delete on public.chat_beitraege to authenticated;

alter publication supabase_realtime add table public.chat_beitraege;

-- Schreiben nur ueber diese Funktion; sie prueft Schalter, Status und Rolle
create function public.chat_schreiben(p_turnier uuid, p_text text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_turnier public.turniere;
  v_verein  public.vereine;
  v_partner uuid;
  v_offen   boolean;
  v_name    text;
  v_text    text := trim(coalesce(p_text, ''));
begin
  select * into v_turnier from public.turniere where id = p_turnier;
  if v_turnier.id is null then
    raise exception 'Turnier nicht gefunden.';
  end if;
  if not coalesce(public.hat_rolle(v_turnier.verein_id, '{vereinsadmin,sportwart,turnierleiter,mitglied}'), false) then
    raise exception 'Schreiben können nur Mitglieder des Vereins.';
  end if;
  select * into v_verein from public.vereine where id = v_turnier.verein_id;
  if not coalesce((v_verein.einstellungen ->> 'chat')::boolean, false) then
    raise exception 'Der Chat ist für diesen Verein ausgeschaltet.';
  end if;
  if not coalesce((v_turnier.einstellungen ->> 'chat')::boolean, false) then
    raise exception 'Für dieses Turnier gibt es keinen Chat.';
  end if;
  v_partner := nullif(v_turnier.einstellungen -> 'liga' ->> 'partner', '')::uuid;
  v_offen := v_turnier.status = 'laeuft'
    or exists (select 1 from public.turniere t where t.id = v_partner and t.status = 'laeuft');
  if not v_offen then
    raise exception 'Der Chat ist nur offen, solange das Turnier läuft.';
  end if;
  if char_length(v_text) not between 1 and 300 then
    raise exception 'Ein Beitrag hat 1 bis 300 Zeichen.';
  end if;
  -- Name: verknuepfter Spieler im Verein, sonst Anzeigename des Kontos
  select coalesce(nullif(p.anzeigename, ''), trim(p.vorname || ' ' || p.nachname)) into v_name
    from public.benutzer_personen bp join public.personen p on p.id = bp.person_id
   where bp.benutzer_id = auth.uid() and bp.verein_id = v_turnier.verein_id
   limit 1;
  if coalesce(v_name, '') = '' then
    select nullif(b.anzeigename, '') into v_name from public.benutzer b where b.id = auth.uid();
  end if;
  insert into public.chat_beitraege (verein_id, turnier_id, benutzer_id, name, text)
  values (v_turnier.verein_id, v_turnier.id, auth.uid(), coalesce(v_name, 'Mitglied'), v_text);
end;
$$;
revoke execute on function public.chat_schreiben(uuid, text) from public, anon;
grant execute on function public.chat_schreiben(uuid, text) to authenticated;

-- ---------- Aufbewahrung: 1 Tag nach Turnierende ----------
create or replace function public.fristen_loeschen() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.kontakt_nachrichten where eingegangen_am < now() - interval '90 days';
  delete from public.aenderungen where zeitpunkt < now() - interval '2 years';
  delete from public.system_protokoll where zeit < now() - interval '2 years';
  delete from public.system_ereignisse where zeit < now() - interval '1 year';
  -- Chat: Turnier seit mehr als einem Tag zu Ende; beim Liga-Spieltag auch
  -- die andere Begegnung
  delete from public.chat_beitraege c
   using public.turniere t
   where t.id = c.turnier_id
     and t.beendet_am < now() - interval '1 day'
     and not exists (
       select 1 from public.turniere p
        where p.id::text = t.einstellungen -> 'liga' ->> 'partner'
          and (p.beendet_am is null or p.beendet_am >= now() - interval '1 day'));
$$;
revoke execute on function public.fristen_loeschen() from public, anon, authenticated;
