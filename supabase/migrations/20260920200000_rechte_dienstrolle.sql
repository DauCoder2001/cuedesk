-- Die Dienstrolle (Serverfunktionen, Zeitplaene) braucht Tabellenrechte.
-- Sie umgeht zwar die Row Level Security, aber nicht die Grundrechte.
-- Ohne diese Grants liefert jede Serverfunktion "permission denied".
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Auch fuer alles, was spaeter dazukommt.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
