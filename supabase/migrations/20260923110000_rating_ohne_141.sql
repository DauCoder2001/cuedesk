-- 14.1 zaehlt nicht fuer das Vereins-Rating.
--
-- Das Rating rechnet in Racks. Eine 14.1-Partie liefert dagegen Punkte
-- (in der Liga bis zu 85 je Partie) und wuerde deshalb so schwer wiegen wie
-- ein ganzer Turniertag Pool. Bisher fiel das nicht auf, weil 14.1 nur als
-- Einzelspiel gespielt wurde und Einzelspiele ohnehin nicht zaehlen. Mit den
-- Liga-Spieltagen kommen 14.1-Partien in Begegnungen dazu.
--
-- Die 14.1-Statistik und die Bestenliste bleiben unberuehrt, sie rechnen mit
-- dem Aufnahme-Protokoll.

create or replace view public.rating_partien with (security_invoker = true) as
  select p.id, p.verein_id, p.turnier_id, p.disziplin, p.datum,
         p.spieler_a, p.spieler_b,
         greatest(coalesce(p.ergebnis_a, 0) - p.vorgabe_a, 0) as racks_a,
         greatest(coalesce(p.ergebnis_b, 0) - p.vorgabe_b, 0) as racks_b
  from public.partien p
  join public.turniere t on t.id = p.turnier_id
  join public.personen a on a.id = p.spieler_a
  join public.personen b on b.id = p.spieler_b
  where p.status = 'beendet'
    and p.rating_werten
    and t.rating_werten
    and p.disziplin <> '14-1'
    and (t.modus = 'liga' or (a.status <> 'gast' and b.status <> 'gast'));
