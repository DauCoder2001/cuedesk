-- Stufe 29: Chat nur mit Live-Uebertragung.
-- Ein Turnier mit "Live aus" hat keinen Chat. Die Einstellung einstellungen.chat
-- bleibt dabei erhalten: Nach "Live an" ist der Chat wieder so, wie er war.
-- chat_schreiben wie in Stufe 24, dazu die Pruefung auf einstellungen.live
-- (fehlt = an, wie in Stufe 25).

create or replace function public.chat_schreiben(p_turnier uuid, p_text text) returns void
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
  if not coalesce((v_turnier.einstellungen ->> 'live')::boolean, true) then
    raise exception 'Ohne Live-Übertragung gibt es keinen Chat.';
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
