-- =============================================================
--  CueDesk, Stufe 5: Echtzeit fuer Turniere
--
--  Aenderungen an Partien und Turnieren sofort an Tablets und Turnierleitung
--  verteilen (Turniermodus am Tablet, Live-Spielplan am Notebook). Wer was
--  sehen darf, regelt weiter die Row Level Security.
-- =============================================================

alter publication supabase_realtime add table public.partien, public.turniere;
