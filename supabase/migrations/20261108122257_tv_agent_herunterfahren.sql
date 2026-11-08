-- =============================================================
--  CueDesk: TV-Geraet aus der Anwendung herunterfahren
--
--  Die Turnierleitung setzt eine Bitte in geraete.herunterfahren_am. Ein
--  kleiner Dienst auf dem TV-Geraet (Agent) fragt alle 30 Sekunden nach und
--  faehrt das Geraet herunter. Die Webseite selbst darf das nicht.
--
--  Der Agent meldet sich nicht an, sondern zeigt einen festen Schluessel;
--  gespeichert ist nur dessen Pruefsumme. Das Lebenszeichen liegt in einer
--  eigenen Tabelle, auf geraete erzeugte es alle 30 Sekunden einen Eintrag
--  im Aenderungsprotokoll.
-- =============================================================

alter table public.geraete add column herunterfahren_am timestamptz;

create table public.geraete_agent (
  geraet_id        uuid primary key references public.geraete(id) on delete cascade,
  schluessel_hash  text not null unique,
  zuletzt_gemeldet timestamptz,
  erstellt_am      timestamptz not null default now()
);

-- Keine Policy und kein Grant: Zugriff nur ueber die Funktionen unten
alter table public.geraete_agent enable row level security;
revoke all on public.geraete_agent from anon, authenticated;

-- Der Agent fragt nach (ohne Anmeldung, nur mit seinem Schluessel).
-- Eine Bitte gilt fuenf Minuten; aeltere verfallen, damit ein Geraet, das
-- gerade aus war, beim Einschalten nicht gleich wieder herunterfaehrt.
create function public.agent_abfragen(p_schluessel text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_geraet uuid;
  v_bitte  timestamptz;
begin
  update public.geraete_agent set zuletzt_gemeldet = now()
   where schluessel_hash = encode(sha256(convert_to(p_schluessel, 'UTF8')), 'hex')
   returning geraet_id into v_geraet;
  if v_geraet is null then
    return false;
  end if;
  select herunterfahren_am into v_bitte from public.geraete
   where id = v_geraet and aktiv
   for update;
  if v_bitte is null then
    return false;
  end if;
  update public.geraete set herunterfahren_am = null where id = v_geraet;
  return v_bitte > now() - interval '5 minutes';
end;
$$;

-- Bitte an alle Fernseher des Vereins, deren Agent gerade erreichbar ist.
-- Die Anzahl zeigt der Turnierleitung, ob der Befehl jemanden erreicht.
create function public.tv_herunterfahren(p_verein uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin,turnierleiter}') then
    raise exception 'Keine Berechtigung';
  end if;
  update public.geraete g set herunterfahren_am = now()
    from public.geraete_agent a
   where a.geraet_id = g.id
     and g.verein_id = p_verein
     and g.aktiv
     and g.tisch_id is null
     and a.zuletzt_gemeldet > now() - interval '2 minutes';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- Welche Fernseher haben einen Agenten? Danach richtet sich der Knopf.
create function public.tv_agenten(p_verein uuid)
returns table (geraet_id uuid, zuletzt_gemeldet timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.geraet_id, a.zuletzt_gemeldet
    from public.geraete_agent a
    join public.geraete g on g.id = a.geraet_id
   where g.verein_id = p_verein
     and g.aktiv
     and g.tisch_id is null
     and public.hat_rolle(p_verein, '{vereinsadmin,turnierleiter}');
$$;

-- Erzeugt den Schluessel fuer den Agenten. Er wird nur dieses eine Mal
-- im Klartext zurueckgegeben; ein neuer ersetzt den alten.
create function public.agent_schluessel_erzeugen(p_geraet uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_verein     uuid;
  v_tisch      uuid;
  v_schluessel text;
begin
  select verein_id, tisch_id into v_verein, v_tisch
    from public.geraete where id = p_geraet and aktiv;
  if v_verein is null or not public.hat_rolle(v_verein, '{vereinsadmin}') then
    raise exception 'Keine Berechtigung';
  end if;
  if v_tisch is not null then
    raise exception 'Ein Agent ist nur für Fernseher vorgesehen';
  end if;
  v_schluessel := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.geraete_agent (geraet_id, schluessel_hash)
    values (p_geraet, encode(sha256(convert_to(v_schluessel, 'UTF8')), 'hex'))
    on conflict (geraet_id) do update
      set schluessel_hash = excluded.schluessel_hash,
          zuletzt_gemeldet = null,
          erstellt_am = now();
  return v_schluessel;
end;
$$;

revoke execute on function public.agent_abfragen(text) from public;
revoke execute on function public.tv_herunterfahren(uuid) from public, anon;
revoke execute on function public.tv_agenten(uuid) from public, anon;
revoke execute on function public.agent_schluessel_erzeugen(uuid) from public, anon;

grant execute on function public.agent_abfragen(text) to anon;
grant execute on function public.tv_herunterfahren(uuid) to authenticated;
grant execute on function public.tv_agenten(uuid) to authenticated;
grant execute on function public.agent_schluessel_erzeugen(uuid) to authenticated;
