-- Liga-Spieltage zaehlen fuer das Vereins-Rating, auch gegen Gaeste.
--
-- Bisher blieben Partien mit Gastbeteiligung grundsaetzlich aussen vor. In der
-- Liga sind die Gegner aber immer Gaeste, und ihre Staerke soll in das Rating
-- der eigenen Spieler einfliessen. Deshalb zaehlen Partien einer Begegnung,
-- solange beide Schalter "werten" gesetzt sind (Begegnung und Einzelpartie).
--
-- Gaeste erscheinen weiterhin in keiner Rangliste: Die Rating-Funktion blendet
-- sie aus, ihre Partien zaehlen aber fuer die Gegner.

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
    and (t.modus = 'liga' or (a.status <> 'gast' and b.status <> 'gast'));
