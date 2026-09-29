-- Stufe 19: Loeschfristen aus der Datenschutzerklaerung (datenschutz.html)
-- automatisch einhalten. Laeuft jede Nacht, wie rating-nachts und
-- vereine-loeschen. Bisher geschah das nur beim Eingang einer Kontaktnachricht
-- (Serverfunktion "kontakt") oder von Hand in der Konsole ("Aufraeumen").
--
--   Kontaktnachrichten   90 Tage
--   Aenderungsprotokoll   2 Jahre
--   Systemprotokoll       2 Jahre (Aktionen der Super-Admins)
--   Systemereignisse      1 Jahr  (Sicherung, Wachhalten)

create or replace function public.fristen_loeschen() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.kontakt_nachrichten where eingegangen_am < now() - interval '90 days';
  delete from public.aenderungen where zeitpunkt < now() - interval '2 years';
  delete from public.system_protokoll where zeit < now() - interval '2 years';
  delete from public.system_ereignisse where zeit < now() - interval '1 year';
$$;

revoke execute on function public.fristen_loeschen() from public, anon, authenticated;

select cron.schedule('fristen-loeschen', '45 3 * * *', 'select public.fristen_loeschen()');
