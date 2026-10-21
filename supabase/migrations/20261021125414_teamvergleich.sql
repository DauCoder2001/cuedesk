-- Teamvergleich (Mosconi-Format): eigener Turniermodus. Zwei Teams spielen
-- Team-Match, Doppel und Einzel; jedes Match gibt einen Punkt, Sieger ist,
-- wer zuerst das eingestellte Ziel erreicht.

-- 1. Neuer Turniermodus
alter type public.turnier_modus add value if not exists 'teamvergleich';

-- 2. Team-Match: Team gegen Team ohne einzelne Spieler. Leere Spieler gibt es
--    nur dort (phase 'team'), nie im Doppel, nie fuers Rating.
alter table public.partien
  alter column spieler_a drop not null,
  alter column spieler_b drop not null;

alter table public.partien add constraint partien_team_match check (
  (spieler_a is null) = (spieler_b is null)
  and (
    spieler_a is not null
    or (coalesce(phase, '') = 'team' and not doppel and not rating_werten
        and partner_a is null and partner_b is null)
  )
);
