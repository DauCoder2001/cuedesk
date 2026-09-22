-- =============================================================
--  CueDesk, Stufe 5: Turnierleiter legen Gaeste an
--
--  Turnierleiter duerfen Gaeste anlegen (nur Status 'gast'), damit sie Gaeste
--  ins Turnier aufnehmen koennen. Mitglieder pflegen weiter Admin und Sportwart.
-- =============================================================

create policy personen_gast_turnierleitung on public.personen for insert to authenticated
  with check (status = 'gast' and public.hat_rolle(verein_id, '{turnierleiter}'));
