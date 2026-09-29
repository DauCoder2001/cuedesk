-- Stufe 22: Einwilligungen mit Nachweis.
--
-- 1. Namensanzeige: personen.name_oeffentlich ergibt sich aus dem Verlauf in
--    "einwilligungen" und wird nur noch ueber die Funktion einwilligung_setzen
--    geaendert. Das Mitglied willigt selbst ein (Mein Konto) oder die
--    Vereinsleitung erfasst eine schriftliche Einwilligung. Widerrufen geht
--    auf beiden Wegen.
-- 2. Minderjaehrige: Namensanzeige nur mit Einwilligung der
--    Erziehungsberechtigten (erfasst von der Vereinsleitung), ebenso ein
--    Konto: Einladen oder Verknuepfen eines minderjaehrigen Spielers setzt
--    diese Einwilligung voraus.
-- 3. Bisher gesetzte Haken werden als "uebernommen" (ohne Nachweis)
--    eingetragen und bleiben markiert, bis die Vereinsleitung sie bestaetigt.

create table public.einwilligungen (
  id           uuid primary key default gen_random_uuid(),
  verein_id    uuid not null,
  person_id    uuid not null,
  art          text not null check (art in ('name_oeffentlich', 'konto_minderjaehrig')),
  vorgang      text not null check (vorgang in ('erteilt', 'widerrufen')),
  weg          text not null check (weg in ('selbst', 'schriftlich', 'erziehungsberechtigte', 'uebernommen')),
  fassung      text,                          -- Version des Wortlauts (src/einwilligung.ts), bei "selbst"
  am           timestamptz not null default now(),
  erfasst_von  uuid default auth.uid(),
  foreign key (verein_id, person_id) references public.personen (verein_id, id) on delete cascade
);
create index einwilligungen_person on public.einwilligungen (person_id, art, am);
alter table public.einwilligungen enable row level security;

create policy einwilligungen_lesen on public.einwilligungen for select to authenticated
  using (public.hat_rolle(verein_id, '{vereinsadmin,sportwart}')
         or public.ist_eigene_person(person_id)
         or public.support_freigegeben(verein_id));
revoke all on public.einwilligungen from anon, authenticated;
grant select on public.einwilligungen to authenticated;

-- Gilt die Einwilligung gerade? Der juengste Eintrag entscheidet.
create function public.einwilligung_gilt(p_person uuid, p_art text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select e.vorgang = 'erteilt' from public.einwilligungen e
                    where e.person_id = p_person and e.art = p_art
                    order by e.am desc limit 1), false);
$$;
-- Nur fuer Funktionen und Trigger in der Datenbank, nicht von aussen aufrufbar
revoke execute on function public.einwilligung_gilt(uuid, text) from public, anon, authenticated;

create function public.einwilligung_setzen(
  p_person uuid, p_art text, p_erteilen boolean, p_weg text, p_fassung text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_verein uuid;
  v_minder boolean;
  v_selbst boolean;
  v_leitung boolean;
begin
  select verein_id into v_verein from public.personen where id = p_person and anonymisiert_am is null;
  if v_verein is null then
    raise exception 'Spieler nicht gefunden.';
  end if;
  if p_art not in ('name_oeffentlich', 'konto_minderjaehrig') or p_weg not in ('selbst', 'schriftlich', 'erziehungsberechtigte') then
    raise exception 'Unbekannte Art oder unbekannter Weg der Einwilligung.';
  end if;
  v_selbst := coalesce(public.ist_eigene_person(p_person), false);
  v_leitung := coalesce(public.hat_rolle(v_verein, '{vereinsadmin,sportwart}'), false);
  select coalesce(i.minderjaehrig, false) into v_minder from public.personen_intern i where i.person_id = p_person;
  v_minder := coalesce(v_minder, false);

  if p_weg = 'selbst' then
    if not v_selbst or p_art <> 'name_oeffentlich' then
      raise exception 'Selbst einwilligen kann nur der Spieler über sein eigenes Konto.';
    end if;
    if p_erteilen and v_minder then
      raise exception 'Für Minderjährige erfasst die Vereinsleitung die Einwilligung der Erziehungsberechtigten.';
    end if;
  else
    if not v_leitung then
      raise exception 'Einwilligungen erfasst die Vereinsleitung (Sportwart oder Vereins-Administrator).';
    end if;
    if p_erteilen and (v_minder or p_art = 'konto_minderjaehrig') and p_weg <> 'erziehungsberechtigte' then
      raise exception 'Bei Minderjährigen ist die Einwilligung der Erziehungsberechtigten nötig.';
    end if;
  end if;

  insert into public.einwilligungen (verein_id, person_id, art, vorgang, weg, fassung)
  values (v_verein, p_person, p_art, case when p_erteilen then 'erteilt' else 'widerrufen' end, p_weg,
          case when p_weg = 'selbst' then p_fassung end);

  if p_art = 'name_oeffentlich' then
    perform set_config('cuedesk.einwilligung', 'an', true);
    update public.personen set name_oeffentlich = p_erteilen where id = p_person;
    perform set_config('cuedesk.einwilligung', '', true);
  end if;
end;
$$;
revoke execute on function public.einwilligung_setzen(uuid, text, boolean, text, text) from public, anon;
grant execute on function public.einwilligung_setzen(uuid, text, boolean, text, text) to authenticated;

-- name_oeffentlich nur ueber einwilligung_setzen einschalten; Ausschalten
-- (etwa beim Anonymisieren) bleibt immer moeglich. Neue Spieler starten ohne.
create function public.name_oeffentlich_schuetzen() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('cuedesk.einwilligung', true), '') <> 'an' then
    if tg_op = 'INSERT' then
      new.name_oeffentlich := false;
    elsif new.name_oeffentlich and not old.name_oeffentlich then
      raise exception 'Die Namensanzeige wird über eine Einwilligung gesetzt, nicht von Hand.';
    end if;
  end if;
  return new;
end;
$$;
create trigger name_oeffentlich_schuetzen before insert or update on public.personen
  for each row execute function public.name_oeffentlich_schuetzen();

-- Konto fuer Minderjaehrige nur mit Einwilligung der Erziehungsberechtigten:
-- beim Einladen und beim Verknuepfen durch die Vereinsleitung. Das Annehmen
-- einer Einladung (ohne angemeldetes Konto, auth.uid() leer) prueft nicht
-- noch einmal, geprueft wurde beim Einladen.
create function public.konto_einwilligung_pruefen() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.person_id is not null and auth.uid() is not null
     and exists (select 1 from public.personen_intern i where i.person_id = new.person_id and i.minderjaehrig)
     and not public.einwilligung_gilt(new.person_id, 'konto_minderjaehrig') then
    raise exception 'Der Spieler ist minderjährig. Erfasse zuerst auf der Seite „Spieler“ die Einwilligung der Erziehungsberechtigten zum Konto.';
  end if;
  return new;
end;
$$;
revoke execute on function public.konto_einwilligung_pruefen() from public, anon, authenticated;
create trigger konto_einwilligung before insert or update of person_id on public.einladungen
  for each row execute function public.konto_einwilligung_pruefen();
create trigger konto_einwilligung before insert or update of person_id on public.benutzer_personen
  for each row execute function public.konto_einwilligung_pruefen();

-- Bisherige Haken ohne Nachweis uebernehmen
insert into public.einwilligungen (verein_id, person_id, art, vorgang, weg, erfasst_von)
select verein_id, id, 'name_oeffentlich', 'erteilt', 'uebernommen', null
  from public.personen where name_oeffentlich;
