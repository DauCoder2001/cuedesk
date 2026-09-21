-- =============================================================
--  Naechtlicher Lauf des Ratings, vollstaendig in Supabase
--
--  pg_cron ruft eine Datenbankfunktion, die ueber pg_net die Serverfunktion
--  "rating" anspricht. Der Dienstschluessel verlaesst dabei Supabase nicht;
--  er liegt im Vault und wird nur beim Aufruf gelesen.
--
--  Einmalig einzurichten (im SQL-Editor, mit den eigenen Werten):
--
--    select vault.create_secret('<DIENSTSCHLUESSEL>', 'dienstschluessel',
--           'Service-Role-Key fuer interne Aufrufe');
--    select vault.create_secret('https://<projekt>.supabase.co/functions/v1',
--           'funktionsadresse', 'Basisadresse der Serverfunktionen');
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.rating_nachts() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schluessel text;
  v_adresse    text;
begin
  select decrypted_secret into v_schluessel
    from vault.decrypted_secrets where name = 'dienstschluessel';
  select decrypted_secret into v_adresse
    from vault.decrypted_secrets where name = 'funktionsadresse';

  if v_schluessel is null or v_adresse is null then
    raise exception 'Im Vault fehlen die Eintraege dienstschluessel und funktionsadresse.';
  end if;

  -- pg_net legt seine Funktionen im Schema "net" ab.
  perform net.http_post(
    url     := v_adresse || '/rating',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_schluessel
               ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.rating_nachts() from public, anon, authenticated;

-- Jede Nacht um 02:30 UTC. Ohne die beiden Vault-Eintraege bricht der Lauf
-- mit einer verstaendlichen Meldung ab und richtet keinen Schaden an.
select cron.schedule('rating-nachts', '30 2 * * *', 'select public.rating_nachts()');
