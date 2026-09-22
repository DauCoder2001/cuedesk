# Mailvorlagen für Supabase

Einzutragen unter **Authentication → Emails → Templates**. Versendet wird über
das IONOS-Postfach (SMTP, siehe Konzept Abschnitt 13). Die Platzhalter in
doppelten geschweiften Klammern setzt Supabase selbst ein:

- `{{ .ConfirmationURL }}`: der Anmelde- oder Einladungslink
- `{{ .Token }}`: der Zahlencode (Länge unter Authentication → Providers → Email einstellbar)

In das Feld „Subject“ kommt nur der Text des Betreffs, in das Feld für den
Inhalt nur der HTML-Block, ohne die Zeilen mit den drei Backticks.

Benutzt werden nur **Magic Link**, **Confirm signup** und **Invite user**.
„Confirm signup“ geht an Personen, die sich zum ersten Mal anmelden. Es hat
deshalb denselben Inhalt wie der Anmeldelink.

---

## Magic Link

**Betreff:** `Dein Anmeldecode für CueDesk: {{ .Token }}`

```html
<h2>Anmeldung bei CueDesk</h2>
<p>Dein Anmeldecode lautet:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Tippe den Code auf der Anmeldeseite ein oder klicke auf den Link:</p>
<p><a href="{{ .ConfirmationURL }}">Bei CueDesk anmelden</a></p>
<p>Code und Link gelten eine Stunde und nur einmal.</p>
<p style="color:#666;font-size:13px">Du hast keine Anmeldung angefordert? Dann kannst du diese Mail einfach löschen.</p>
```

## Confirm signup

**Betreff:** `Dein Anmeldecode für CueDesk: {{ .Token }}`

Inhalt wie bei **Magic Link**.

## Invite user

**Betreff:** `Einladung zu CueDesk`

```html
<h2>Du bist zu CueDesk eingeladen</h2>
<p>Dein Verein nutzt CueDesk für Turniere, Ranglisten und Statistik. Mit einem Klick auf den Link ist dein Zugang eingerichtet:</p>
<p><a href="{{ .ConfirmationURL }}">Einladung annehmen</a></p>
<p>Ein Passwort brauchst du nicht. Später meldest du dich mit deiner Mail-Adresse an und bekommst jedes Mal einen Code.</p>
<p style="color:#666;font-size:13px">Du kennst den Verein nicht? Dann kannst du diese Mail einfach löschen.</p>
```
