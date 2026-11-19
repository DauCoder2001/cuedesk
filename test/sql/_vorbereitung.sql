-- Gemeinsame Vorbereitung der Datenbank-Tests (Audit-Befund 6, 19.11.2026).
--
-- Wird von jeder Testdatei innerhalb ihrer Transaktion mit \ir eingebunden.
-- Legt einen eigenen Probeverein mit drei Probekonten an (Vereins-Admin,
-- Turnierleiter, Mitglied) und Hilfsfunktionen in pg_temp. Am Ende jeder
-- Testdatei steht rollback: Nichts davon bleibt in der Datenbank, echte
-- Vereinsdaten werden weder gelesen noch veraendert.
--
-- Laeuft nur gegen die Test-Datenbank (Workflow "Datenbank-Tests"), nie gegen
-- app.cuedesk.de.

-- Merkzettel fuer die Kennungen der Probedaten
create temp table probe (schluessel text primary key, id uuid not null) on commit drop;

create function pg_temp.id(p_schluessel text) returns uuid language sql as $$
  select id from probe where schluessel = p_schluessel
$$;

-- Als Probekonto handeln: 'admin', 'leiter', 'mitglied'; null = ohne Anmeldung
create function pg_temp.als(p_wer text) returns void language plpgsql as $$
begin
  if p_wer is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', pg_temp.id('konto_' || p_wer), 'role', 'authenticated')::text, true);
  end if;
end;
$$;

-- Bedingung pruefen; bei false bricht der Test mit dieser Meldung ab
create function pg_temp.erwarte(p_ok boolean, p_was text) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'TEST FEHLGESCHLAGEN: %', p_was;
  end if;
end;
$$;

-- Der Befehl muss mit einer Meldung scheitern, die p_muster enthaelt
create function pg_temp.erwarte_fehler(p_sql text, p_muster text, p_was text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_muster in sqlerrm) > 0 then
      return;
    end if;
    raise exception 'TEST FEHLGESCHLAGEN: % (falsche Meldung: %)', p_was, sqlerrm;
  end;
  raise exception 'TEST FEHLGESCHLAGEN: % (kein Fehler)', p_was;
end;
$$;

-- Probeverein und Probekonten
do $$
declare
  v_verein uuid;
  v_konto  uuid;
  v_zufall text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  r        record;
begin
  insert into public.vereine (name, kurzname, slug, ist_test)
  values ('Probeverein Datenbank-Tests', 'Probe', 'probe-' || v_zufall, true)
  returning id into v_verein;
  insert into probe values ('verein', v_verein);

  for r in select * from (values ('admin', 'vereinsadmin'), ('leiter', 'turnierleiter'), ('mitglied', 'mitglied')) as x(wer, rolle) loop
    v_konto := gen_random_uuid();
    -- legt ueber den Trigger neues_konto auch public.benutzer an
    insert into auth.users (id, email, aud, role)
    values (v_konto, 'probe-' || r.wer || '-' || v_zufall || '@example.invalid', 'authenticated', 'authenticated');
    insert into public.benutzer_rollen (benutzer_id, verein_id, rolle) values (v_konto, v_verein, r.rolle::public.rolle);
    insert into probe values ('konto_' || r.wer, v_konto);
  end loop;
end $$;
