-- =============================================================
--  CueDesk: Tablet aus der Ferne neu laden
--
--  Die Live-Uebersicht setzt den Zeitstempel; das Tablet prueft ihn beim
--  regelmaessigen Blick auf seine Kopplung (alle 30 Sekunden) und laedt die
--  Seite neu, wenn er nach seinem Start liegt. Der Spielstand liegt in der
--  Cloud (live_stand) und wird dabei wiederhergestellt.
--
--  Rechte bleiben wie bisher: geraete aendern duerfen Vereins-Admin und
--  Turnierleitung.
-- =============================================================

alter table public.geraete add column neu_laden_am timestamptz;
