-- Vereins-Export vervollstaendigen (Entscheidung 13.10.2026)
--
-- verein_export liess bisher drei Tabellen mit Vereinsdaten aus:
--   einwilligungen        Verlauf der Einwilligungen mit Weg und Fassung
--                         (Nachweis nach Art. 7 Abs. 1 DSGVO)
--   vertragszustimmungen  Zustimmung des Vereins zu Nutzungsbedingungen und AVV
--   turnier_anmeldungen   Online-Anmeldungen zu Turnieren
-- Sie kommen jetzt mit. Das Format bleibt "cuedesk-export" Version 1: es
-- kommen nur Schluessel dazu, aeltere Leser stoeren sich nicht daran.
--
-- Bewusst weiter nicht im Export: Aenderungsprotokoll, Tischstaende
-- (live_stand), Systemprotokoll, Support-Freigaben, Schutzwort (nur der Hash,
-- wertlos ausserhalb der Datenbank), oeffentliche Links (Zugangsschluessel)
-- und der Turnier-Chat (kurzlebig, je Turnier).

create or replace function public.verein_export(p_verein uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_verein public.vereine;
  v_daten  jsonb := '{}'::jsonb;
  v_teil   jsonb;
  t        text;
begin
  select * into v_verein from public.vereine where id = p_verein;
  if v_verein.id is null then
    raise exception 'Verein nicht gefunden.';
  end if;
  if not (public.hat_rolle(p_verein, '{vereinsadmin}')
          or (public.ist_systemadmin() and not v_verein.aktiv)) then
    raise exception 'Exportieren darf der Vereins-Administrator, der Super-Admin nur bei einem gesperrten Verein.';
  end if;

  -- Alles, was an verein_id haengt - ohne Aenderungsprotokoll und Tischstaende.
  foreach t in array array[
    'personen', 'personen_intern', 'tische', 'serien', 'turniere', 'turnier_teilnehmer',
    'partien', 'partien_141', 'aufnahmen_141', 'rating_einstellungen', 'rating_stand',
    'mannschaften', 'mannschaft_spieler', 'benutzer_rechte', 'benutzer_personen', 'einladungen',
    'einwilligungen', 'vertragszustimmungen', 'turnier_anmeldungen'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.verein_id = $1', t)
      into v_teil using p_verein;
    v_daten := v_daten || jsonb_build_object(t, v_teil);
  end loop;

  -- Konten nur mit E-Mail, Name und Rollen im Verein
  v_daten := v_daten || jsonb_build_object('konten', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', b.email, 'anzeigename', b.anzeigename,
             'rollen', (select jsonb_agg(r.rolle order by r.rolle) from public.benutzer_rollen r
                         where r.benutzer_id = b.id and r.verein_id = p_verein))), '[]'::jsonb)
      from public.benutzer b
     where exists (select 1 from public.benutzer_rollen r where r.benutzer_id = b.id and r.verein_id = p_verein)));

  -- Tablets ohne ihre Anmeldekennung
  v_daten := v_daten || jsonb_build_object('geraete', (
    select coalesce(jsonb_agg(to_jsonb(g) - 'auth_id'), '[]'::jsonb)
      from public.geraete g where g.verein_id = p_verein));

  update public.vereine set export_am = now() where id = p_verein;
  perform public.protokollieren('verein_exportiert', p_verein, '{}'::jsonb);

  return jsonb_build_object(
    'format', 'cuedesk-export',
    'version', 1,
    'erstellt', now(),
    'verein', to_jsonb(v_verein) - 'export_am' - 'loeschen_ab',
    'daten', v_daten
  );
end;
$$;
