-- Stufe 6, Gruppen mit KO: jedes Spiel der KO-Runde und jedes Platzierungs-
-- spiel gibt es je Turnier nur einmal.
--
-- Die KO-Partien legt das Notebook der Turnierleitung an, sobald beide Spieler
-- feststehen. Sind zwei Geraete der Turnierleitung gleichzeitig offen, koennten
-- beide dieselbe Partie anlegen. Der Index laesst die zweite Anlage scheitern
-- (Fehler 23505), die Seite uebergeht diesen Fehler.

create unique index partien_ko_einmal
  on public.partien (turnier_id, gruppe)
  where phase = 'ko';

create unique index partien_platzierung_einmal
  on public.partien (turnier_id, phase, paarung)
  where phase in ('phase2', 'phase3');
