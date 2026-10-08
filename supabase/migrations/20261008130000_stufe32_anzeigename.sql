-- Stufe 32 (Nachtrag): Anzeigename auf dem oeffentlichen Live-Link
--
-- Mit nachgewiesener Einwilligung zeigt der Link den Anzeigenamen ohne
-- Vereinszusatz ("Kura (Bassum)" -> "Kura"), wie am Tablet; ohne
-- Anzeigenamen weiter "Vorname N.". Ohne Einwilligung bleibt es beim Kuerzel.
-- oeffentlicher_name bekommt dafuer den Anzeigenamen als weiteren Wert.

drop function public.oeffentlicher_name(text, text, text, boolean);

create function public.oeffentlicher_name(p_vorname text, p_nachname text, p_kuerzel text, p_anzeigename text, p_oeffentlich boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_oeffentlich then
      coalesce(
        nullif(btrim(regexp_replace(coalesce(p_anzeigename, ''), '\s*\([^()]*\)\s*$', '')), ''),
        case when coalesce(btrim(p_nachname), '') = '' then btrim(p_vorname)
             else btrim(p_vorname) || ' ' || left(btrim(p_nachname), 1) || '.' end
      )
    else coalesce(
      nullif(btrim(p_kuerzel), ''),
      upper(left(btrim(p_vorname), 1) || coalesce(nullif(left(btrim(p_nachname), 1), ''), substr(btrim(p_vorname), 2, 1), ''))
    )
  end;
$$;

revoke execute on function public.oeffentlicher_name(text, text, text, text, boolean) from public, anon, authenticated;

-- Alles, was die oeffentliche Zuschauerseite braucht, als ein JSON.
-- null, wenn der Schluessel unbekannt oder abgelaufen ist oder der Verein ruht.
create or replace function public.oeffentliche_ansicht(p_schluessel text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l       public.oeffentliche_links;
  v_name  text;
  v_haupt public.turniere;
  v_ids   uuid[];
  v_live  boolean;
begin
  if p_schluessel is null or length(p_schluessel) < 32 then
    return null;
  end if;

  select * into l from public.oeffentliche_links
   where schluessel = p_schluessel and gueltig_bis > now();
  if not found then
    return null;
  end if;

  select v.name into v_name from public.vereine v where v.id = l.verein_id and v.aktiv;
  if not found then
    return null;
  end if;

  -- Das freigegebene Turnier, beim Liga-Spieltag mit 2. Begegnung und Doppel
  select * into v_haupt from public.turniere where id = l.turnier_id;
  v_ids := array(
    select t.id from public.turniere t
     where t.verein_id = l.verein_id
       and (t.id = v_haupt.id
            or t.id::text = v_haupt.einstellungen -> 'liga' ->> 'partner'
            or t.id::text = v_haupt.einstellungen -> 'liga' ->> 'doppel')
  );

  -- Tischstaende nur, solange eines davon mit Live-Uebertragung laeuft
  v_live := exists (
    select 1 from public.turniere t
     where t.id = any (v_ids) and t.status = 'laeuft'
       and coalesce(t.einstellungen ->> 'live', 'true') <> 'false'
  );

  return (
    with
    tp as (
      select p.* from public.partien p where p.turnier_id = any (v_ids)
    ),
    beteiligt as (
      select x.id from (
        select spieler_a as id from tp
        union select spieler_b from tp
        union select partner_a from tp
        union select partner_b from tp
        union select tt.person_id from public.turnier_teilnehmer tt where tt.turnier_id = any (v_ids)
      ) x where x.id is not null
    ),
    pers as (
      select pe.id,
             md5(l.schluessel || pe.id::text) as pseudo,
             public.oeffentlicher_name(pe.vorname, pe.nachname, pe.kuerzel, pe.anzeigename,
                                    pe.name_oeffentlich and public.namensanzeige_nachgewiesen(pe.id)) as oeffentlich,
             public.name_vergleich(coalesce(nullif(btrim(pe.anzeigename), ''), btrim(pe.vorname || ' ' || pe.nachname))) as intern
        from public.personen pe join beteiligt b on b.id = pe.id
    ),
    seiten as (
      -- Je Partie die Namen beider Seiten: intern (wie am Tablet) und oeffentlich
      select tp.id,
             concat_ws(' / ', a.intern, pa.intern) as intern_a,
             concat_ws(' / ', b.intern, pb.intern) as intern_b,
             concat_ws(' / ', a.oeffentlich, pa.oeffentlich) as name_a,
             concat_ws(' / ', b.oeffentlich, pb.oeffentlich) as name_b
        from tp
        left join pers a  on a.id  = tp.spieler_a
        left join pers pa on pa.id = tp.partner_a
        left join pers b  on b.id  = tp.spieler_b
        left join pers pb on pb.id = tp.partner_b
    ),
    staende as (
      select ls.tisch_id, ls.aktualisiert, ls.zustand, s.*
        from public.live_stand ls
        join seiten s on s.id::text = ls.zustand ->> 'tournamentMatchId'
       where v_live and ls.verein_id = l.verein_id
    )
    select jsonb_build_object(
      'verein', v_name,
      'gueltig_bis', l.gueltig_bis,
      'turniere', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'datum', t.datum, 'disziplin', t.disziplin, 'modus', t.modus,
          'status', t.status, 'erstellt_am', t.erstellt_am, 'beendet_am', t.beendet_am,
          'einstellungen', jsonb_strip_nulls(jsonb_build_object(
            'gruppenzahl', t.einstellungen -> 'gruppenzahl',
            'handReihenfolge', t.einstellungen -> 'handReihenfolge',
            'live', t.einstellungen -> 'live',
            'liga', case when t.einstellungen ? 'liga' then jsonb_strip_nulls(jsonb_build_object(
              'begegnung', t.einstellungen -> 'liga' -> 'begegnung',
              'partner',   t.einstellungen -> 'liga' -> 'partner',
              'heim',      t.einstellungen -> 'liga' -> 'heim',
              'eigene',    t.einstellungen -> 'liga' -> 'eigene',
              'gegner',    t.einstellungen -> 'liga' -> 'gegner',
              'art',       t.einstellungen -> 'liga' -> 'art',
              'haupt',     t.einstellungen -> 'liga' -> 'haupt',
              'doppel',    t.einstellungen -> 'liga' -> 'doppel'
            )) end
          ))
        ))
        from public.turniere t where t.id = any (v_ids)
      ), '[]'::jsonb),
      'partien', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', tp.id, 'turnier_id', tp.turnier_id, 'disziplin', tp.disziplin,
          'phase', tp.phase, 'gruppe', tp.gruppe, 'runde', tp.runde, 'paarung', tp.paarung, 'tisch_id', tp.tisch_id,
          'spieler_a', (select pseudo from pers where pers.id = tp.spieler_a),
          'spieler_b', (select pseudo from pers where pers.id = tp.spieler_b),
          'partner_a', (select pseudo from pers where pers.id = tp.partner_a),
          'partner_b', (select pseudo from pers where pers.id = tp.partner_b),
          'doppel', tp.doppel, 'race_to', tp.race_to, 'vorgabe_a', tp.vorgabe_a, 'vorgabe_b', tp.vorgabe_b,
          'ergebnis_a', tp.ergebnis_a, 'ergebnis_b', tp.ergebnis_b, 'status', tp.status,
          'begonnen', tp.begonnen, 'beendet', tp.beendet, 'erstellt_am', tp.erstellt_am
        ))
        from tp
      ), '[]'::jsonb),
      'teilnehmer', coalesce((
        select jsonb_agg(jsonb_build_object(
          'turnier_id', tt.turnier_id, 'person_id', pers.pseudo, 'startnummer', tt.startnummer, 'gruppe', tt.gruppe
        ))
        from public.turnier_teilnehmer tt join pers on pers.id = tt.person_id
        where tt.turnier_id = any (v_ids)
      ), '[]'::jsonb),
      'namen', coalesce((select jsonb_object_agg(pseudo, oeffentlich) from pers), '{}'::jsonb),
      'tische', coalesce((
        select jsonb_agg(jsonb_build_object('id', ti.id, 'nummer', ti.nummer, 'bezeichnung', ti.bezeichnung) order by ti.nummer)
        from public.tische ti where ti.verein_id = l.verein_id and ti.aktiv
      ), '[]'::jsonb),
      -- Nur Staende von Partien dieses Turniers; nur die Felder fuer die Kachel,
      -- Namen oeffentlich (Seiten nach dem Namen zugeordnet, wie im Spielplan)
      'staende', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tisch_id', st.tisch_id,
          'aktualisiert', st.aktualisiert,
          'zustand', (
            select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
              from jsonb_each(st.zustand) e
             where e.key = any (array['gameType', 's1', 's2', 'inn1', 'inn2', 'turn', 'target', 'targetInn', 'locked',
                                      'score1', 'score2', 'raceTo', 'nextBreak', 'startedAt', 'tournamentMatchId', 'discipline'])
          ) || jsonb_build_object(
            'log', case when jsonb_typeof(st.zustand -> 'log') = 'array' and jsonb_array_length(st.zustand -> 'log') > 0
                        then '[0]'::jsonb else '[]'::jsonb end,
            'player1', case public.name_vergleich(st.zustand ->> 'player1')
                         when st.intern_a then st.name_a when st.intern_b then st.name_b else 'Spieler Rot' end,
            'player2', case public.name_vergleich(st.zustand ->> 'player2')
                         when st.intern_b then st.name_b when st.intern_a then st.name_a else 'Spieler Blau' end
          )
        ))
        from staende st
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.oeffentliche_ansicht(text) from public;
grant execute on function public.oeffentliche_ansicht(text) to anon, authenticated;
