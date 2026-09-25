-- =============================================================
--  Nachtrag zu Stufe 11: Lesezugriff auf die beiden neuen Tabellen
--
--  In diesem Projekt bekommen neue Tabellen keine Rechte von selbst.
--  Wer was sieht, regeln weiterhin die Richtlinien:
--    system_protokoll  - nur Super-Admins
--    support_freigaben - Vereins-Administrator des Vereins und Super-Admins
--  Geschrieben wird in beide nur ueber die Funktionen.
-- =============================================================

grant select on public.system_protokoll to authenticated;
grant select on public.support_freigaben to authenticated;
