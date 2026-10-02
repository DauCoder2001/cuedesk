-- Stufe 27: Serien, deren Disziplin erst am Spieltag festgelegt wird.
-- serien.disziplin darf leer sein; leer heisst "am Spieltag festgelegt".
-- Die Disziplin jedes Turniers bleibt Pflicht (Rating und Statistik), ein
-- Turnier mit noch offener Disziplin traegt einstellungen.disziplinOffen.

alter table public.serien alter column disziplin drop not null;

comment on column public.serien.disziplin is
  'Disziplin der Serie; leer = wird je Spieltag festgelegt (jedes Turnier hat seine eigene)';
