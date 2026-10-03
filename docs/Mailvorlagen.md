# Mailvorlagen für Supabase

Einzutragen unter **Authentication → Emails → Templates**. Versendet wird über
das IONOS-Postfach (SMTP, siehe Konzept Abschnitt 13). Die Platzhalter in
doppelten geschweiften Klammern setzt Supabase selbst ein:

- `{{ .ConfirmationURL }}`: der Anmelde- oder Einladungslink
- `{{ .Token }}`: der Zahlencode (Länge unter Authentication → Providers → Email einstellbar)

In das Feld „Subject“ kommt nur der Text des Betreffs, in das Feld für den
Inhalt nur der HTML-Block, ohne die Zeilen mit den drei Backticks.

Benutzt werden **Magic Link**, **Confirm signup**, **Invite user**,
**Change Email Address** (E-Mail-Adresse ändern unter „Mein Konto“) und
**Reauthentication** (Code vor dem Festlegen eines Passworts).
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

## Change Email Address

Bei eingeschaltetem **Secure email change** (Authentication → Sign In / Providers
→ Email) geht diese Mail zweimal hinaus: an die bisherige und an die neue
Adresse, jede mit ihrem eigenen Link. Der Text passt deshalb für beide.
`{{ .Email }}` ist die bisherige, `{{ .NewEmail }}` die neue Adresse.

**Betreff:** `CueDesk: Neue E-Mail-Adresse bestätigen`

```html
<h2>Neue E-Mail-Adresse für CueDesk</h2>
<p>Für das CueDesk-Konto <strong>{{ .Email }}</strong> wurde ein Wechsel auf die Adresse <strong>{{ .NewEmail }}</strong> angefordert.</p>
<p>Bitte bestätige den Wechsel mit einem Klick auf den Link:</p>
<p><a href="{{ .ConfirmationURL }}">Wechsel bestätigen</a></p>
<p>Je eine solche Mail geht an die bisherige und an die neue Adresse. Die neue Adresse gilt erst, wenn in beiden Mails der Link geklickt wurde. Bis dahin meldest du dich weiter mit der bisherigen Adresse an.</p>
<p style="color:#666;font-size:13px">Du hast keinen Wechsel angefordert? Dann klicke den Link nicht an. Die Adresse bleibt, wie sie ist. Sag am besten deinem Verein Bescheid, vielleicht war jemand anderes mit deinem Konto angemeldet, zum Beispiel an einem Vereins-PC.</p>
```

## Reauthentication

**Betreff:** `Dein Bestätigungscode für CueDesk: {{ .Token }}`

```html
<h2>Passwort für CueDesk festlegen</h2>
<p>Dein Bestätigungscode lautet:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Trage ihn unter „Mein Konto“ bei <strong>Code aus der Mail</strong> ein und lege dort dein neues Passwort fest.</p>
<p style="color:#666;font-size:13px">Du hast keinen Code angefordert? Dann kannst du diese Mail einfach löschen. Ohne den Code lässt sich kein Passwort festlegen.</p>
```
