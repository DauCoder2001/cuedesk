# Produktion einrichten

Stand: 09.10.2026 · Anleitung, noch nicht durchgeführt · Matthias und Claude

Entscheidungen vom 09.10.2026: eigenes Produktions-Projekt bei Supabase im
**kostenlosen Tarif**, früh angelegt, sobald echte Turniere anstehen. Die
Anwendung der Produktion läuft unter **`app.cuedesk.de`**, die Testfassung
bleibt unter `daucoder2001.github.io/cuedesk/` mit der Test-DB. Vereine
starten in der Produktion leer (siehe Vor-dem-Livegang.md, Abschnitt Betrieb).

**Wer macht was:** Alles mit Konten, Kosten, Passwörtern und Schlüsseln macht
Matthias. Claude bereitet Dateien vor, zeigt jeden Schritt vorher und spielt
in die Produktion erst nach „einspielen“ ein. Geheime Werte gibt Claude nie
ein und bekommt sie nicht zu sehen.

---

## Entschieden am 09.10.2026

| Nr. | Frage | Entscheidung |
|---|---|---|
| E1 | Wann wird die Produktion neu veröffentlicht? | **Auf Knopfdruck** (Workflow „Produktion veröffentlichen“), nicht bei jedem Push. So läuft eine Änderung zuerst in der Testfassung, und Migrationen kommen vor dem neuen Programmstand in die Produktion. |
| E2 | Wohin geht die Sicherung der Produktion? | **Eigenes privates Repo `cuedesk-sicherung-produktion`.** Der Sicherungslauf legt bei jedem Lauf eine neue Historie an; zwei Datenbanken in einem Repo würden sich gegenseitig löschen. |
| E3 | Testfassung kennzeichnen? | **Ja:** schmaler Streifen „Testumgebung – keine echten Turniere“ oben in der Testfassung, damit niemand versehentlich ein echtes Turnier in die Test-DB einträgt. Eingeschaltet über eine Variable beim Bauen der Testfassung, sobald die Produktion läuft; Aussehen zeigt Claude vorher. |

---

## Schritt 1 · Projekt anlegen (Matthias)

1. supabase.com → **New project**, in derselben Organisation wie das Test-Projekt.
2. Name `cuedesk-produktion`, Region **Frankfurt (eu-central-1)**, Tarif **Free**.
3. Ein starkes Datenbank-Passwort vergeben und sicher aufbewahren (wird für die Sicherung gebraucht).
4. Claude die **Projekt-Kennung** nennen (die Zeichenfolge in der Adresse, wie `ejcskkawxbbvltvoxdnw` beim Test-Projekt). Sie ist nicht geheim.

Gut zu wissen zum kostenlosen Tarif: Ein Projekt pausiert nach sieben Tagen
ohne Zugriff (dagegen hilft Schritt 7), es gibt keine tägliche Sicherung
(dafür Schritt 8), die Datenbank darf 500 MB groß werden (die Konsole zeigt
den Stand).

## Schritt 2 · Datenbank aufbauen (Claude, nach „einspielen“)

1. Die 52 Dateien aus `supabase/migrations/` **der Reihe nach** einspielen.
   Sie legen auch die drei nächtlichen Zeitpläne (`rating-nachts`,
   `vereine-loeschen`, `fristen-loeschen`) und die Echtzeit-Tabellen
   (`live_stand`, `partien`, `turniere`, `chat_beitraege`) an.
2. **Abgleich mit der Test-DB**, solange die Produktion noch leer ist: Die
   Test-DB hat 61 Einträge in ihrer Migrationsliste, das Repo 52 Dateien,
   weil frühe Einzelschritte in den Dateien zusammengefasst sind. Claude
   vergleicht deshalb Tabellen, Spalten, Funktionen, Regeln (RLS),
   Tabellenrechte, Zeitpläne und Echtzeit-Tabellen beider Datenbanken.
   Abweichungen werden als eigene Migration behoben, ebenfalls erst nach
   „einspielen“.
3. Sicherheitsprüfung von Supabase (`get_advisors`) ohne offene Warnungen.

## Schritt 3 · Serverfunktionen (Claude, nach „einspielen“)

Die vier Funktionen aus `supabase/functions/` bereitstellen, mit derselben
Einstellung wie im Test-Projekt:

| Funktion | JWT prüfen | Wofür |
|---|---|---|
| `einladung` | aus | Konten einladen (prüft selbst die Rolle) |
| `rating` | aus | Rating rechnen; auch nachts vom Zeitplan |
| `kontakt` | aus | Kontaktformular ohne Anmeldung |
| `spielbericht` | an | Spielbericht des Verbands einlesen |

## Schritt 4 · Geheime Werte (Matthias)

1. **Vault** für den nächtlichen Rating-Lauf, im SQL-Editor der Produktion
   (Werte selbst einsetzen; der Dienstschlüssel steht unter Project Settings
   → API Keys):
   ```sql
   select vault.create_secret('<DIENSTSCHLUESSEL>', 'dienstschluessel', 'Service-Role-Key fuer interne Aufrufe');
   select vault.create_secret('https://<projekt>.supabase.co/functions/v1', 'funktionsadresse', 'Basisadresse der Serverfunktionen');
   ```
2. **Secrets der Serverfunktionen** (Edge Functions → Secrets), wie im
   Test-Projekt: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `KONTAKT_AN`.

Danach prüft Claude ohne die Werte zu lesen: Die Vault-Einträge sind da (nur
die Namen), und `rating_nachts()` läuft ohne Fehlermeldung.

## Schritt 5 · Anmeldung einstellen (Matthias)

Unter **Authentication**:

1. **URL Configuration:** Site URL `https://app.cuedesk.de/`, Redirect URLs
   `https://app.cuedesk.de/**`.
2. **Providers → Email:** Passwort-Mindestlänge **10**; „Allow new users to
   sign up“ bleibt **an** (Tablets melden sich selbst an).
3. **SMTP:** IONOS-Postfach wie im Test-Projekt (Absender, Host, Port,
   Benutzer, Passwort).
4. **Emails → Templates:** die fünf Vorlagen aus `docs/Mailvorlagen.md`.

## Schritt 6 · Anwendung unter app.cuedesk.de

**Matthias:**

1. Zuerst die Domain bei GitHub **verifizieren**: Profil-Settings → Pages →
   „Add a domain“ → `cuedesk.de`; GitHub nennt einen TXT-Eintrag, den bei
   IONOS (Domains & SSL → cuedesk.de → DNS) eintragen und dann bestätigen. Das
   verhindert, dass ein fremdes GitHub-Konto `app.cuedesk.de` für sich
   beansprucht, solange der CNAME schon steht.
2. Neues **öffentliches** Repo `DauCoder2001/cuedesk-app` (leer, mit README).
3. Dort Settings → Pages: Quelle „Deploy from a branch“, `main`, Ordner `/`;
   Custom domain `app.cuedesk.de`; nach dem Zertifikat **Enforce HTTPS**.
4. Bei IONOS für `app.cuedesk.de` einen **CNAME** auf `daucoder2001.github.io`.
   Dafür ist **kein Webpaket** nötig (Entscheidung „Hosting und Sicherung“ vom
   07.10.2026): IONOS liefert nur den DNS-Eintrag der Domain; die Seite selbst
   und das HTTPS-Zertifikat kommen kostenlos von GitHub Pages. Postfach und
   Mailversand von `cuedesk.de` bleiben davon unberührt.
5. Im Repo `cuedesk` (Settings → Secrets and variables → Actions):
   - Variablen `PROD_SUPABASE_URL` und `PROD_SUPABASE_KEY` (Adresse und
     öffentlicher Schlüssel der Produktion; nicht geheim),
   - Secret `APP_TOKEN`: Fine-grained Token, nur „Contents: Read and write“
     auf `cuedesk-app`.

**Claude:**

1. Neuer Workflow `produktion-veroeffentlichen.yml`: baut CueDesk mit den
   Werten der Produktion und `VITE_BASIS=/`, legt das Ergebnis samt `CNAME`
   und `.nojekyll` in `cuedesk-app` (Muster wie „Scoreboards offline“). Start
   auf Knopfdruck (E1).
2. Testfassung kennzeichnen (E3).

Die Scoreboards und TV-Seiten sind Teil der Anwendung und liegen danach unter
`app.cuedesk.de/scoreboards/`. Die Offline-Scoreboards bleiben unverändert.

## Schritt 7 · Wachhalten (Claude)

`datenbank-wachhalten.yml` klopft zusätzlich bei der Produktion an (mit
`PROD_SUPABASE_URL` und `PROD_SUPABASE_KEY`), alle drei Tage.

## Schritt 8 · Wöchentliche Sicherung

**Matthias:** privates Repo für die Sicherung anlegen (E2); Secret
`SUPABASE_DB_URL_PRODUKTION` (Connect → Session pooler, mit Passwort);
`SICHERUNG_TOKEN` zusätzlich für das neue Repo freigeben;
`SICHERUNG_SCHLUESSEL` gilt für beide Sicherungen und muss außerhalb von
GitHub aufbewahrt sein.

**Claude:** `sicherung.yml` sichert beide Datenbanken in ihre jeweiligen
Repos; die Rückmeldung geht in die Konsole der jeweiligen Datenbank. Danach
einen Lauf von Hand starten und das Ergebnis in der Konsole prüfen.

## Schritt 9 · Erster Super-Admin und erster Verein

1. **Matthias:** Authentication → Users → **Add user** mit der eigenen
   Adresse („Send invitation“ oder „Create new user“).
2. **Claude** (nach Freigabe): dieses Konto zum Super-Admin machen
   (`benutzer.systemadmin`). Weitere Super-Admins gehen danach über die Konsole.
3. **Matthias** auf `app.cuedesk.de`: anmelden → Konsole → Verein **B&W**
   anlegen → sich selbst als Vereins-Administrator einladen → Auftragsverarbeitung
   zustimmen → System einstellen (Logo, Vorgaben, Saisonbeginn, Schutzwort).
4. Spieler: über **Altdaten übernehmen** aus Turnier light oder von Hand.
   Mannschaften und Kader, Tische anlegen.
5. **Tablets neu koppeln** unter `app.cuedesk.de/scoreboards/`, TV-Gerät neu
   einrichten.
6. Das eine echte Turnier aus der Testzeit von Hand nachtragen.

## Schritt 10 · Abschluss

- Probelauf: ein kleines Turnier mit zwei Tablets, Ergebnis bestätigen,
  Rating „Jetzt neu berechnen“, öffentlicher Link, PDF.
- Nächtlicher Lauf am nächsten Morgen in der Konsole prüfen (Rating-Stand,
  keine Fehler).
- In `Vor-dem-Livegang.md` die Punkte „Produktions-Projekt“, „Passwort-Mindestlänge“
  und „Eigener E-Mail-Absender“ nachziehen.

## Danach: Ablauf bei jeder Änderung

1. Änderung wie bisher in die Testfassung (Push), dort prüfen.
2. Neue Migrationen: erst Test-DB, dann nach „einspielen“ die Produktion.
3. Erst danach „Produktion veröffentlichen“ starten.
4. Geänderte Serverfunktionen in beiden Projekten bereitstellen.

**Vor weiteren Vereinen:** Abschnitt 2 in Vor-dem-Livegang.md (Recht und
Datenschutz) muss erledigt sein. Für B&W als Pilotverein des Betreibers reicht
der jetzige Stand.
