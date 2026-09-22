-- =============================================================
--  CueDesk, Stufe 5: Verlauf fuer die Turnierleitung
--
--  Turnierleitung und Sportwart duerfen den Verlauf der Partien, Turniere
--  und Teilnehmer ihres Vereins lesen (Korrekturen, Wiederherstellen). Alles
--  uebrige im Aenderungsprotokoll bleibt beim Vereins-Administrator.
-- =============================================================

drop policy aenderungen_lesen on public.aenderungen;
create policy aenderungen_lesen on public.aenderungen for select to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin}')
    or public.ist_systemadmin()
    or (tabelle in ('partien', 'turniere', 'turnier_teilnehmer')
        and public.hat_rolle(verein_id, '{sportwart,turnierleiter}'))
  );

-- turnier_teilnehmer hat keine eigene ID. Im Protokoll steht deshalb
-- "turnier_id:person_id" als Datensatz-Kennung; alle anderen Tabellen
-- bleiben wie bisher.
create or replace function public.aenderung_protokollieren() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_alt jsonb;
  v_neu jsonb;
  v_satz jsonb;
begin
  if tg_op <> 'INSERT' then v_alt := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_neu := to_jsonb(new); end if;
  v_satz := coalesce(v_neu, v_alt);
  insert into public.aenderungen (benutzer_id, verein_id, tabelle, datensatz_id, aktion, vorher, nachher)
  values (
    auth.uid(),
    case when tg_table_name = 'vereine' then (v_satz ->> 'id')::uuid else (v_satz ->> 'verein_id')::uuid end,
    tg_table_name,
    case
      when tg_table_name = 'turnier_teilnehmer' then (v_satz ->> 'turnier_id') || ':' || (v_satz ->> 'person_id')
      else coalesce(v_satz ->> 'id', v_satz ->> 'benutzer_id')
    end,
    lower(tg_op),
    v_alt,
    v_neu
  );
  return coalesce(new, old);
end;
$$;

create trigger protokoll after insert or update or delete on public.turnier_teilnehmer
  for each row execute function public.aenderung_protokollieren();
