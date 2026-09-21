-- =============================================================
--  CueDesk, Stufe 3: vollstaendiges Protokoll der eigenen Partien
--
--  Mitglieder sehen das vollstaendige Protokoll der Partien, die sie selbst
--  gespielt haben (auch die Aufnahmen des Gegners). Fremde Partien bleiben
--  verborgen.
-- =============================================================

drop policy a141_lesen on public.aufnahmen_141;
create policy a141_lesen on public.aufnahmen_141 for select to authenticated
  using (
    public.hat_rolle(verein_id, '{vereinsadmin,sportwart,turnierleiter}')
    or public.ist_systemadmin()
    or exists (
      select 1 from public.partien p
      where p.id = partie_id
        and (public.ist_eigene_person(p.spieler_a) or public.ist_eigene_person(p.spieler_b))
    )
  );
