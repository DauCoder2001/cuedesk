-- Stufe 18: Nachrichten aus dem Kontaktformular (kontakt.html).
-- Schreiben und Lesen nur ueber die Serverfunktion "kontakt" (Dienstschluessel);
-- fuer anon und authenticated gibt es weder Rechte noch Richtlinien.
-- Die Funktion loescht Nachrichten nach 90 Tagen.
create table public.kontakt_nachrichten (
  id uuid primary key default gen_random_uuid(),
  eingegangen_am timestamptz not null default now(),
  name text not null check (length(name) between 1 and 100),
  email text not null check (length(email) between 3 and 200),
  verein text check (length(verein) <= 100),
  nachricht text not null check (length(nachricht) between 1 and 5000),
  absender_kennung text not null,
  versendet_am timestamptz,
  fehler text
);
comment on column public.kontakt_nachrichten.absender_kennung is 'Hash aus IP-Adresse und Tag, nur fuer die Sperre gegen Massenversand';
create index kontakt_absender on public.kontakt_nachrichten (absender_kennung, eingegangen_am);
alter table public.kontakt_nachrichten enable row level security;
revoke all on public.kontakt_nachrichten from anon, authenticated;
