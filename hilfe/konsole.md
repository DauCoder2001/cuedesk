---
titel: Konsole für Super-Admins
rollen: superadmin
seiten: konsole
reihenfolge: 90
---
Die **Konsole** ist nur für Super-Admins, also den Betreiber von CueDesk. Sie gilt für alle Vereine. Einblick in die Daten eines Vereins gibt es hier nicht; dafür braucht es dessen befristeten **Support-Zugang**.

## Verein anlegen

1. Unter **Neuer Verein** Name, Kurzname und Web-Adresse eintragen; **Test-Verein** markiert einen Test-Verein.
2. Steht die **E-Mail des Vereins-Administrators** schon fest, gleich eintragen: Der Knopf heißt dann **Verein anlegen und einladen**, und der Vereins-Administrator bekommt sofort einen Anmeldelink. Sonst später unter **Vereine** bei der neuen Zeile **Admin einladen** klicken.
3. Beim ersten Aufruf stimmt der Vereins-Administrator den Nutzungsbedingungen und dem Vertrag zur Auftragsverarbeitung zu. Die Spalte **Verträge** zeigt „✓ Fassung 1“ oder „offen“.

## Vereine verwalten

- **Bearbeiten**: Name, Kurzname, Web-Adresse, Anschrift ändern.
- **Sperren** mit Grund: Der Verein kommt nicht mehr in die Verwaltung, Tablets laufen nur noch offline. **Entsperren** hebt das auf.
- **Löschen**: erst sperren, dann **Export** ziehen, dann **Löschen vormerken**. Nach 30 Tagen löscht ein nächtlicher Lauf den Verein; bis dahin lässt sich das mit **Löschung abbrechen** zurücknehmen. Test-Vereine lassen sich **Sofort löschen**.
- Hat ein Verein mehrere Administratoren, lässt sich einer mit ✕ entfernen; einer muss bleiben.

## Überblick

- **Nutzung**: je Verein Konten, letzte Anmeldung, Mitglieder und Gäste, Turniere und Partien der letzten 30 Tage, Tablets.
- **Sicherung und Rating**: wann die **Wöchentliche Sicherung** und das **Nächtliche Rating** zuletzt liefen.
- **Datenbank**: Größe, Verbindungen, größte Tabellen.
- **Aufräumen**: verwaiste Daten finden und entfernen.
- **Protokoll**: alle Aktionen der Super-Admins.
- **Super-Admins**: weitere Super-Admins ernennen oder entfernen.

## Scoreboards offline

Die Offline-Fassung der Scoreboards (daucoder2001.github.io/scoreboards) entsteht automatisch: Nach jedem Push, der die Scoreboards ändert, baut der Workflow **Scoreboards offline** auf GitHub sie neu und legt sie ab.
