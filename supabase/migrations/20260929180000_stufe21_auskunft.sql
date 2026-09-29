-- Stufe 21: Auskunft fuer einen einzelnen Spieler (Art. 15 und 20 DSGVO).
--
-- Liefert alles, was CueDesk zu einer Person speichert, als JSON. Der Browser
-- macht daraus eine JSON-Datei und ein PDF (src/auskunft.ts).
--
-- Abrufen duerfen Vereins-Administrator und Sportwart fuer jeden Spieler ihres
-- Vereins und jedes Mitglied fuer sich selbst (ueber die Verknuepfung Konto -
-- Spieler). Das Passwort ist nie enthalten, nur ob eines festgelegt ist. Im
-- Aenderungsprotokoll fehlt, welches Konto eine Aenderung vorgenommen hat;
-- Aenderungen des eigenen Kontos erscheinen nur als Anzahl je Tabelle.

create function public.person_auskunft(p_person uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.personen;
  v_verein public.vereine;
  v_selbst boolean;
  v_konten uuid[];
  v_daten jsonb;
begin
  select * into v_person from public.personen where id = p_person;
  if v_person.id is null then
    raise exception 'Spieler nicht gefunden.';
  end if;
  select * into v_verein from public.vereine where id = v_person.verein_id;
  v_selbst := coalesce(public.ist_eigene_person(p_person), false);
  if not (v_selbst or coalesce(public.hat_rolle(v_person.verein_id, '{vereinsadmin,sportwart}'), false)) then
    raise exception 'Auskunft erhalten der Spieler selbst, der Sportwart und der Vereins-Administrator.';
  end if;

  select coalesce(array_agg(benutzer_id), '{}') into v_konten
    from public.benutzer_personen where person_id = p_person;

  v_daten := jsonb_build_object(
    'erstellt_am', now(),
    'verein', v_verein.name,
    'person', to_jsonb(v_person),
    'vertraulich', (select to_jsonb(i) - 'person_id' - 'verein_id'
                      from public.personen_intern i where i.person_id = p_person),

    'konten', (select coalesce(jsonb_agg(jsonb_build_object(
                 'email', b.email,
                 'anzeigename', b.anzeigename,
                 'erstellt_am', b.erstellt_am,
                 'angemeldet_am', b.angemeldet_am,
                 'passwort_festgelegt', coalesce(u.encrypted_password, '') <> '',
                 'rollen', (select coalesce(jsonb_agg(r.rolle order by r.rolle), '[]'::jsonb)
                              from public.benutzer_rollen r
                             where r.benutzer_id = b.id and r.verein_id = v_person.verein_id))), '[]'::jsonb)
                 from public.benutzer b left join auth.users u on u.id = b.id
                where b.id = any(v_konten)),

    'turniere', (select coalesce(jsonb_agg(jsonb_build_object(
                   'name', t.name, 'datum', t.datum, 'disziplin', t.disziplin, 'modus', t.modus,
                   'status', t.status, 'startnummer', tt.startnummer, 'gruppe', tt.gruppe,
                   'endplatz', tt.endplatz, 'rating_eingefroren', tt.rating_eingefroren,
                   'rating_quelle', tt.rating_quelle) order by t.datum desc), '[]'::jsonb)
                   from public.turnier_teilnehmer tt join public.turniere t on t.id = tt.turnier_id
                  where tt.person_id = p_person),

    'anmeldungen', (select coalesce(jsonb_agg(jsonb_build_object(
                      'turnier', t.name, 'datum', t.datum,
                      'angemeldet_am', a.angemeldet_am, 'abgemeldet_am', a.abgemeldet_am)
                      order by a.angemeldet_am desc), '[]'::jsonb)
                      from public.turnier_anmeldungen a join public.turniere t on t.id = a.turnier_id
                     where a.person_id = p_person),

    'mannschaften', (select coalesce(jsonb_agg(jsonb_build_object(
                       'name', m.name, 'saison', m.saison, 'liga', m.liga, 'staffel', m.staffel,
                       'stammspieler', ms.stammspieler, 'kapitaen', ms.kapitaen,
                       'berechtigt_ab', ms.berechtigt_ab, 'position', ms.position)
                       order by m.saison desc, m.rang), '[]'::jsonb)
                       from public.mannschaft_spieler ms join public.mannschaften m on m.id = ms.mannschaft_id
                      where ms.person_id = p_person),

    'partien', (select coalesce(jsonb_agg(jsonb_build_object(
                  'datum', p.datum,
                  'turnier', t.name,
                  'disziplin', p.disziplin,
                  'phase', p.phase,
                  'gruppe', p.gruppe,
                  'runde', p.runde,
                  'gegner', coalesce(g.anzeigename, trim(g.vorname || ' ' || g.nachname)),
                  'eigene', case when p.spieler_a = p_person then p.ergebnis_a else p.ergebnis_b end,
                  'gegner_ergebnis', case when p.spieler_a = p_person then p.ergebnis_b else p.ergebnis_a end,
                  'vorgabe_eigen', case when p.spieler_a = p_person then p.vorgabe_a else p.vorgabe_b end,
                  'vorgabe_gegner', case when p.spieler_a = p_person then p.vorgabe_b else p.vorgabe_a end,
                  'status', p.status,
                  'rating_werten', p.rating_werten,
                  'aufnahmen_141', case when p.spieler_a = p_person then k.aufnahmen_a else k.aufnahmen_b end,
                  'hoechstserie_141', case when p.spieler_a = p_person then k.hoechstserie_a else k.hoechstserie_b end,
                  'begonnen', p.begonnen,
                  'beendet', p.beendet) order by p.datum desc, p.beendet desc nulls last), '[]'::jsonb)
                  from public.partien p
                  left join public.turniere t on t.id = p.turnier_id
                  left join public.personen g on g.id = case when p.spieler_a = p_person then p.spieler_b else p.spieler_a end
                  left join public.partien_141 k on k.partie_id = p.id
                 where p.spieler_a = p_person or p.spieler_b = p_person),

    'aufnahmen_141', (select coalesce(jsonb_agg(jsonb_build_object(
                        'datum', p.datum, 'lfd_nr', a.lfd_nr, 'baelle', a.baelle, 'punkte', a.punkte,
                        'gesamt', a.gesamt, 'art', a.art, 'markierung', a.markierung, 'zeitpunkt', a.zeitpunkt)
                        order by p.datum, a.partie_id, a.lfd_nr), '[]'::jsonb)
                        from public.aufnahmen_141 a join public.partien p on p.id = a.partie_id
                       where a.spieler = p_person),

    'rating', (select coalesce(jsonb_agg(jsonb_build_object(
                 'stichtag', s.stichtag, 'disziplin', s.disziplin, 'wert', s.wert,
                 'racks', s.racks, 'quelle', s.quelle) order by s.stichtag desc, s.disziplin), '[]'::jsonb)
                 from public.rating_stand s where s.person_id = p_person),

    'aenderungen', (select coalesce(jsonb_agg(jsonb_build_object(
                      'zeitpunkt', a.zeitpunkt, 'tabelle', a.tabelle, 'aktion', a.aktion,
                      'vorher', a.vorher, 'nachher', a.nachher) order by a.zeitpunkt desc), '[]'::jsonb)
                      from public.aenderungen a
                     where a.verein_id = v_person.verein_id
                       and a.tabelle in ('personen', 'personen_intern', 'benutzer_personen', 'einladungen',
                                         'turnier_anmeldungen', 'mannschaft_spieler')
                       and (a.datensatz_id = p_person::text
                            or a.vorher ->> 'person_id' = p_person::text
                            or a.nachher ->> 'person_id' = p_person::text)),

    'aenderungen_durch_konto', (select coalesce(jsonb_object_agg(x.tabelle, x.anzahl), '{}'::jsonb)
                                  from (select a.tabelle, count(*) as anzahl
                                          from public.aenderungen a
                                         where a.verein_id = v_person.verein_id and a.benutzer_id = any(v_konten)
                                         group by a.tabelle) x)
  );

  perform public.protokollieren('auskunft_erstellt', v_person.verein_id,
    jsonb_build_object('person', p_person, 'selbst', v_selbst));
  return v_daten;
end;
$$;

revoke execute on function public.person_auskunft(uuid) from public, anon;
grant execute on function public.person_auskunft(uuid) to authenticated;
