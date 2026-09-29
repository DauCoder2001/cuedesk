-- Stufe 17: Kennzahlen der 14.1-Partien fuer alle Vereinsmitglieder lesbar.
-- partien_141 enthaelt je Partie nur Summen: Ziel, Aufnahmen, Hoechstserie
-- und Dauer. Das Archiv (direkter Vergleich) und die Bestenliste 14.1 in den
-- Ranglisten brauchen sie fuer alle Spieler; die Ergebnisse selbst (partien)
-- sind schon fuer alle Mitglieder lesbar.
-- Das Aufnahme-Protokoll (aufnahmen_141) bleibt wie bisher: Leitung, Support
-- und die beiden Spieler der Partie.

drop policy p141_lesen on public.partien_141;
create policy p141_lesen on public.partien_141 for select to authenticated
  using (public.ist_im_verein(verein_id) or public.support_freigegeben(verein_id));
