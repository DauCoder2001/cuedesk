-- Stufe 28: E-Mail-Adresse unter "Mein Konto" aendern.
-- Die Aenderung selbst erledigt Supabase Auth (Bestaetigung in beiden
-- Postfaechern, "Secure email change"). Erst wenn sie bestaetigt ist, aendert
-- sich auth.users.email; dieser Trigger zieht public.benutzer nach und loest
-- offene Einladungen fuer die neue Adresse ein.

create function public.email_mitschreiben() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.benutzer set email = lower(new.email) where id = new.id;
    perform public.einladungen_uebernehmen(new.id, new.email);
  end if;
  return new;
end;
$$;
revoke execute on function public.email_mitschreiben() from public, anon, authenticated;

create trigger email_mitschreiben after update of email on auth.users
  for each row execute function public.email_mitschreiben();
