-- Stufe 30: Doppel (Spaß-Liga, Doppel-Begegnung)
--
-- Eine Doppel-Partie hat je Seite zwei Spieler: spieler_a und partner_a
-- gegen spieler_b und partner_b. Bei Einzelpartien bleiben die Partner leer.
-- Gespielt werden Doppel nur in der Doppel-Begegnung eines Spaß-Liga-
-- Spieltags (8-, 9- und 10-Ball, kein 14.1).
--
-- Doppel zaehlen nie fuer das Vereins-Rating: Welches Rack welcher der
-- beiden Spieler geholt hat, laesst sich nicht sagen. Das sichert hier eine
-- Pruefregel ab; die View rating_partien braucht deshalb keine Aenderung.
--
-- Die Auskunft (Art. 15/20 DSGVO) nennt Doppel-Partien auch fuer die
-- Partner, mit Partner und beiden Gegnern.

alter table public.partien
  add column partner_a uuid,
  add column partner_b uuid,
  add constraint partien_partner_a_fk foreign key (verein_id, partner_a)
    references public.personen (verein_id, id) on delete restrict,
  add constraint partien_partner_b_fk foreign key (verein_id, partner_b)
    references public.personen (verein_id, id) on delete restrict,
  -- entweder Einzel (beide leer) oder Doppel (beide gesetzt)
  add constraint partien_doppel_vollstaendig check ((partner_a is null) = (partner_b is null)),
  -- vier verschiedene Spieler
  add constraint partien_doppel_verschieden check (
    partner_a is null or (
      partner_a <> spieler_a and partner_a <> spieler_b and partner_a <> partner_b
      and partner_b <> spieler_a and partner_b <> spieler_b)),
  -- kein 14.1 im Doppel (das Protokoll kennt je Seite nur einen Spieler)
  add constraint partien_doppel_ohne_141 check (partner_a is null or disziplin <> '14-1'),
  -- nie fuer das Rating
  add constraint partien_doppel_ohne_rating check (partner_a is null or not rating_werten);

create index partien_partner_a on public.partien (partner_a);
create index partien_partner_b on public.partien (partner_b);

comment on column public.partien.partner_a is 'Doppel: zweiter Spieler der Seite A (sonst leer)';
comment on column public.partien.partner_b is 'Doppel: zweiter Spieler der Seite B (sonst leer)';

-- ---------- Auskunft: Doppel-Partien mit Partner und beiden Gegnern ----------
-- Unveraendert bis auf den Abschnitt 'partien'.

create or replace function public.person_auskunft(p_person uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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

    -- Eigene Seite ist A, wenn die Person dort Spieler oder Partner ist
    'partien', (select coalesce(jsonb_agg(jsonb_build_object(
                  'datum', p.datum,
                  'turnier', t.name,
                  'disziplin', p.disziplin,
                  'phase', p.phase,
                  'gruppe', p.gruppe,
                  'runde', p.runde,
                  'doppel', p.partner_a is not null,
                  'partner', case when p.partner_a is null then null
                                  else coalesce(pa.anzeigename, trim(pa.vorname || ' ' || pa.nachname)) end,
                  'gegner', coalesce(g.anzeigename, trim(g.vorname || ' ' || g.nachname))
                            || coalesce(' / ' || coalesce(g2.anzeigename, trim(g2.vorname || ' ' || g2.nachname)), ''),
                  'eigene', case when x.seite_a then p.ergebnis_a else p.ergebnis_b end,
                  'gegner_ergebnis', case when x.seite_a then p.ergebnis_b else p.ergebnis_a end,
                  'vorgabe_eigen', case when x.seite_a then p.vorgabe_a else p.vorgabe_b end,
                  'vorgabe_gegner', case when x.seite_a then p.vorgabe_b else p.vorgabe_a end,
                  'status', p.status,
                  'rating_werten', p.rating_werten,
                  'aufnahmen_141', case when x.seite_a then k.aufnahmen_a else k.aufnahmen_b end,
                  'hoechstserie_141', case when x.seite_a then k.hoechstserie_a else k.hoechstserie_b end,
                  'begonnen', p.begonnen,
                  'beendet', p.beendet) order by p.datum desc, p.beendet desc nulls last), '[]'::jsonb)
                  from public.partien p
                  cross join lateral (select p_person in (p.spieler_a, p.partner_a) as seite_a) x
                  left join public.turniere t on t.id = p.turnier_id
                  -- Partner: der andere Spieler der eigenen Seite
                  left join public.personen pa on pa.id = case
                    when p.spieler_a = p_person then p.partner_a
                    when p.partner_a = p_person then p.spieler_a
                    when p.spieler_b = p_person then p.partner_b
                    else p.spieler_b end
                  left join public.personen g on g.id = case when x.seite_a then p.spieler_b else p.spieler_a end
                  left join public.personen g2 on g2.id = case when x.seite_a then p.partner_b else p.partner_a end
                  left join public.partien_141 k on k.partie_id = p.id
                 where p_person in (p.spieler_a, p.spieler_b, p.partner_a, p.partner_b)),

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
