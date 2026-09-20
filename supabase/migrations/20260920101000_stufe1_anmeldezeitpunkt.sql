-- Wann hat sich ein Konto zuletzt angemeldet? Daran erkennt die Oberflaeche,
-- wer eingeladen wurde, den Link aber noch nicht benutzt hat.
alter table public.benutzer add column angemeldet_am timestamptz;

create function public.anmeldung_mitschreiben() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.benutzer set angemeldet_am = new.last_sign_in_at where id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.anmeldung_mitschreiben() from public, anon, authenticated;

create trigger anmeldung_mitschreiben after update on auth.users
  for each row execute function public.anmeldung_mitschreiben();

update public.benutzer b
set angemeldet_am = u.last_sign_in_at
from auth.users u
where u.id = b.id;
