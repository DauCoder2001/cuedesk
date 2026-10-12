-- =============================================================
--  Tabellenrechte festschreiben (12.10.2026)
--
--  Neue Supabase-Projekte geben anon und authenticated fuer jede neue
--  Tabelle, Sequenz und Funktion im Schema public automatisch alle Rechte.
--  Das Test-Projekt (September 2026) tat das noch nicht; die Migrationen
--  vergeben Rechte deshalb nur gezielt und nehmen nichts zurueck. In der
--  Produktion standen so etwa benutzer.systemadmin (selbst aenderbar) und
--  die Sicht rating_partien (ohne Anmeldung lesbar) offen.
--
--  Diese Migration stellt den Stand des Test-Projekts her: erst Lesen und
--  Schreiben fuer anon und authenticated entziehen, dann genau die Rechte
--  vergeben, die die Anwendung braucht. Im Test-Projekt aendert sie nichts.
--  Was davon im Einzelnen erlaubt ist, entscheidet weiter die Row Level
--  Security.
-- =============================================================

-- Kuenftige Tabellen, Sequenzen und Funktionen bekommen nichts automatisch
-- (wie im Test-Projekt). Neue Tabellen brauchen also immer ein grant.
alter default privileges in schema public revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Bestehende Tabellen, Sichten und Sequenzen: Lesen und Schreiben entziehen
revoke select, insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Und gezielt vergeben, was die Anwendung braucht

-- Vereinsauswahl ohne Anmeldung
grant select on public.vereine to anon;
grant select, insert, update, delete on public.vereine to authenticated;

-- Benutzer: lesen, selbst nur den Anzeigenamen aendern (nie systemadmin)
grant select on public.benutzer to authenticated;
grant update (anzeigename) on public.benutzer to authenticated;

grant select, insert, update, delete on
  public.aufnahmen_141,
  public.benutzer_personen,
  public.benutzer_rechte,
  public.benutzer_rollen,
  public.einladungen,
  public.live_stand,
  public.mannschaft_spieler,
  public.mannschaften,
  public.oeffentliche_links,
  public.partien,
  public.partien_141,
  public.personen,
  public.personen_intern,
  public.rating_einstellungen,
  public.serien,
  public.tische,
  public.turnier_anmeldungen,
  public.turnier_teilnehmer,
  public.turniere
  to authenticated;

-- Geraete entstehen nur ueber geraet_koppeln(), deshalb kein insert
grant select, update, delete on public.geraete to authenticated;

-- Chat: geschrieben wird ueber chat_schreiben()
grant select, delete on public.chat_beitraege to authenticated;

-- Nur lesen; geschrieben wird ueber Funktionen, Trigger oder die Dienstrolle
grant select on
  public.aenderungen,
  public.einwilligungen,
  public.rating_partien,
  public.rating_stand,
  public.support_freigaben,
  public.system_ereignisse,
  public.system_protokoll,
  public.vertragszustimmungen
  to authenticated;

-- Ohne Rechte fuer anon und authenticated (Zugriff nur ueber Funktionen):
-- kopplungen, verein_schutzwort
