-- Stufe 20: Anonymisieren statt Loeschen (Datenschutzerklaerung, Abschnitt 8).
--
-- Ein Spieler mit Partien, Teilnahmen oder 14.1-Aufnahmen laesst sich nicht
-- loeschen, ohne Rating und Tabellen der Gegner zu verfaelschen. Stattdessen
-- wird der Datensatz geleert: Name wird zum Platzhalter "Ehemaliger Spieler N"
-- (fortlaufend je Verein), alle vertraulichen Angaben, Anmeldungen,
-- Einladungen und die Verknuepfung mit einem Konto verschwinden, ebenso die
-- Eintraege im Aenderungsprotokoll, die Name, Nummern oder Verknuepfung
-- enthielten. Partien, Teilnahmen, Kader und 14.1-Protokoll bleiben am
-- namenlosen Eintrag haengen.
--
-- Verknuepfte Konten verlieren ihre Rollen in diesem Verein. Hat ein Konto
-- danach in keinem Verein mehr eine Rolle und ist kein Super-Admin, wird es
-- geloescht (wie beim Loeschen eines Vereins).
--
-- Nur der Vereins-Administrator darf anonymisieren; es ist nicht umkehrbar.

alter table public.personen add column anonymisiert_am timestamptz;

create function public.person_anonymisieren(p_person uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verein uuid;
  v_anonym timestamptz;
  v_nr int;
  v_name text;
  v_konten uuid[];
begin
  select verein_id, anonymisiert_am into v_verein, v_anonym
    from public.personen where id = p_person for update;
  if v_verein is null then
    raise exception 'Spieler nicht gefunden.';
  end if;
  if not coalesce(public.hat_rolle(v_verein, '{vereinsadmin}'), false) then
    raise exception 'Nur der Vereins-Administrator darf Spieler anonymisieren.';
  end if;
  if v_anonym is not null then
    raise exception 'Der Spieler ist schon anonymisiert.';
  end if;

  select count(*) + 1 into v_nr
    from public.personen where verein_id = v_verein and anonymisiert_am is not null;
  v_name := 'Ehemaliger Spieler ' || v_nr;

  select coalesce(array_agg(benutzer_id), '{}') into v_konten
    from public.benutzer_personen where person_id = p_person;

  update public.personen
     set vorname = 'Ehemaliger Spieler',
         nachname = v_nr::text,
         anzeigename = v_name,
         kuerzel = 'E' || v_nr,
         status = 'ausgetreten',
         name_oeffentlich = false,
         rating_ausgeblendet = true,
         anonymisiert_am = now()
   where id = p_person;

  delete from public.personen_intern     where person_id = p_person;
  delete from public.turnier_anmeldungen where person_id = p_person;
  delete from public.einladungen         where person_id = p_person;
  delete from public.benutzer_personen   where person_id = p_person;

  -- Rollen der verknuepften Konten in diesem Verein enden
  delete from public.benutzer_rechte where verein_id = v_verein and benutzer_id = any(v_konten);
  delete from public.benutzer_rollen where verein_id = v_verein and benutzer_id = any(v_konten);
  delete from auth.users u
   where u.id = any(v_konten)
     and not exists (select 1 from public.benutzer b where b.id = u.id and b.systemadmin)
     and not exists (select 1 from public.benutzer_rollen r where r.benutzer_id = u.id);

  -- Zuletzt das Aenderungsprotokoll, auch die Eintraege, die das
  -- Anonymisieren eben selbst erzeugt hat (sie enthalten den alten Namen)
  delete from public.aenderungen a
   where a.verein_id = v_verein
     and a.tabelle in ('personen', 'personen_intern', 'benutzer_personen', 'einladungen', 'turnier_anmeldungen')
     and (a.datensatz_id = p_person::text
          or a.vorher ->> 'person_id' = p_person::text
          or a.nachher ->> 'person_id' = p_person::text);

  perform public.protokollieren('person_anonymisiert', v_verein,
    jsonb_build_object('person', p_person, 'platzhalter', v_name, 'konten', cardinality(v_konten)));
  return v_name;
end;
$$;

revoke execute on function public.person_anonymisieren(uuid) from public, anon;
grant execute on function public.person_anonymisieren(uuid) to authenticated;
