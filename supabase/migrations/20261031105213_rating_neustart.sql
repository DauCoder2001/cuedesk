-- Rating neu beginnen (31.10.2026)
--
-- Der Vereins-Administrator kann das Vereins-Rating ab einem Tag neu beginnen
-- lassen. Partien vor diesem Tag zaehlen nicht mehr; alle starten wieder beim
-- Rating-Startwert, beim Wert aus den anderen Disziplinen oder beim
-- Vereinsschnitt. Die Partien selbst bleiben unveraendert, der Neustart laesst
-- sich wieder aufheben.
--
-- Gefiltert wird in der Sicht rating_partien. So beachten ihn die Berechnung
-- (Serverfunktion rating), die Lupe auf der Seite Rating und der Rating-Verlauf
-- in der Spielerstatistik, ohne dass sich dort etwas aendert.

alter table public.rating_einstellungen add column neustart date;

create or replace view public.rating_partien with (security_invoker = true) as
  select p.id, p.verein_id, p.turnier_id, p.disziplin, p.datum,
         p.spieler_a, p.spieler_b,
         greatest(coalesce(p.ergebnis_a, 0) - p.vorgabe_a, 0) as racks_a,
         greatest(coalesce(p.ergebnis_b, 0) - p.vorgabe_b, 0) as racks_b
  from public.partien p
  join public.turniere t on t.id = p.turnier_id
  join public.personen a on a.id = p.spieler_a
  join public.personen b on b.id = p.spieler_b
  left join public.rating_einstellungen e on e.verein_id = p.verein_id
  where p.status = 'beendet'
    and p.rating_werten
    and t.rating_werten
    and p.disziplin <> '14-1'
    and (t.modus = 'liga' or (a.status <> 'gast' and b.status <> 'gast'))
    and (e.neustart is null or p.datum >= e.neustart);

-- Neustart setzen (p_datum) oder aufheben (p_datum null). Die gespeicherten
-- Rating-Staende werden geloescht: Wer seit dem Neustart nicht gespielt hat,
-- bekaeme sonst seinen alten Wert aus einem frueheren Stichtag (Turnier,
-- Archiv, Statistik nehmen den neuesten Stand je Spieler). Danach rechnet die
-- Seite System das Rating sofort neu.
create function public.rating_neustart(p_verein uuid, p_datum date, p_startwerte_leeren boolean, p_wort text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.hat_rolle(p_verein, '{vereinsadmin}') then
    raise exception 'Das Rating darf nur der Vereins-Administrator zurücksetzen.';
  end if;
  if not public.schutzwort_stimmt(p_verein, p_wort) then
    raise exception 'Das Schutzwort stimmt nicht.';
  end if;
  if p_datum > current_date then
    raise exception 'Der Neustart darf nicht in der Zukunft liegen.';
  end if;

  insert into public.rating_einstellungen (verein_id, neustart)
  values (p_verein, p_datum)
  on conflict (verein_id) do update set neustart = excluded.neustart;

  delete from public.rating_stand where verein_id = p_verein;

  if p_startwerte_leeren then
    update public.personen_intern set rating_startwert = null
    where verein_id = p_verein and rating_startwert is not null;
  end if;

  perform public.protokollieren(
    case when p_datum is null then 'rating-neustart-aufgehoben' else 'rating-neustart' end,
    p_verein,
    jsonb_build_object('neustart', p_datum, 'startwerte_geleert', p_startwerte_leeren)
  );
end;
$$;

revoke execute on function public.rating_neustart(uuid, date, boolean, text) from public, anon;
grant execute on function public.rating_neustart(uuid, date, boolean, text) to authenticated;
