-- Doppel-KO: jedes Spiel gibt es je Turnier nur einmal (wie partien_ko_einmal
-- bei Gruppen mit KO). Die Partien legt das Notebook der Turnierleitung an,
-- sobald beide Spieler feststehen. Sind zwei Geraete der Turnierleitung
-- gleichzeitig offen, laesst der Index die zweite Anlage scheitern (Fehler
-- 23505), die Seite uebergeht diesen Fehler.

create unique index partien_dko_einmal
  on public.partien (turnier_id, gruppe)
  where phase = 'dko';
