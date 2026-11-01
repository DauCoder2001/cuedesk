-- Liga: Rueckrunde in derselben Reihenfolge wie die Hinrunde (01.11.2026)
--
-- Bisher spielte die Rueckrunde 14.1, 10-, 9-, 8-Ball, jetzt wie die Hinrunde
-- 14.1, 8-, 9-, 10-Ball (src/liga.ts). Begegnungen, deren Rueckrunde schon
-- Partien in der alten Reihenfolge hat, behalten sie: Sie bekommen in
-- einstellungen.liga den Merker rueckGedreht. Erkannt werden sie an der
-- 2. Partie der Rueckrunde, die dort 10-Ball war. Doppel-Begegnungen haben
-- einen eigenen Plan und bleiben unberuehrt.

update public.turniere t
set einstellungen = jsonb_set(t.einstellungen, '{liga,rueckGedreht}', 'true'::jsonb)
where t.modus = 'liga'
  and t.einstellungen ? 'liga'
  and coalesce(t.einstellungen #>> '{liga,art}', '') <> 'doppel'
  and exists (select 1 from public.partien p
              where p.turnier_id = t.id and p.runde = 2 and p.paarung = 2 and p.disziplin = '10-ball');
