-- Stufe 32 (Nachtrag): Tabellenrechte fuer oeffentliche_links
--
-- Wie bei allen Tabellen ausdruecklich vergeben; ohne sie meldete der Dialog
-- "Öffentlicher Link" "permission denied". Wer was darf, regelt weiter die
-- Policy oeffentliche_links_leitung (nur Turnierleitung des Vereins).

grant select, insert, update, delete on public.oeffentliche_links to authenticated;
