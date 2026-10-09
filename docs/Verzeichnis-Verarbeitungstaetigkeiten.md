# Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)

**Entwurf, internes Dokument, nicht öffentlich.** Vor dem Livegang prüfen lassen (`[prüfen]`). Bei Änderungen an Daten, Dienstleistern oder Fristen mitziehen, zusammen mit `datenschutz.html` und `auftragsverarbeitung.html`.

Stand: [Datum]

## Angaben zum Betreiber

| | |
|---|---|
| Name | Matthias Haas |
| Anschrift | Königstr. 41, 28857 Syke |
| Kontakt | kontakt.cuedesk@gmail.com, Kontaktformular auf der Webseite |
| Datenschutzbeauftragter | keiner, keine Pflicht (§ 38 BDSG) [prüfen] |

Der Betreiber ist in zwei Rollen tätig:
- **Teil A, als Verantwortlicher (Art. 30 Abs. 1):** Webseite, Benutzerkonten, Kontaktformular, Betrieb.
- **Teil B, als Auftragsverarbeiter (Art. 30 Abs. 2):** Daten der Vereine im Spielbetrieb.

Die Ausnahme für Betriebe unter 250 Beschäftigten (Art. 30 Abs. 5) greift nicht, weil die Verarbeitung nicht nur gelegentlich erfolgt. [prüfen]

## Teil A: Betreiber als Verantwortlicher

### A1 Bereitstellung der Webseite

| | |
|---|---|
| Zweck | Webseite und Anwendung ausliefern, vor Angriffen schützen |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO |
| Betroffene | Besucher der Webseite |
| Daten | IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browserkennung (Server-Protokolle) |
| Empfänger | GitHub, Inc. (GitHub Pages) liefert Webseite und Anwendung aus; die Daten der Vereine laufen direkt zwischen Browser und Supabase und berühren GitHub nicht |
| Drittland | GitHub, Inc.: USA; EU-US Data Privacy Framework [prüfen] |
| Löschfrist | nach den Fristen von GitHub [prüfen] |

### A2 Benutzerkonten und Anmeldung

| | |
|---|---|
| Zweck | Anmeldung per Link, Code oder Passwort; Rollen im Verein |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO |
| Betroffene | Benutzer mit Konto (auf Einladung eines Vereins), Tablets (ohne Personenbezug) |
| Daten | E-Mail-Adresse, Name, Rollen, Verknüpfung mit dem Spieler, Einladung, letzte Anmeldung, Passwort-Hash |
| Empfänger | Supabase (Anmeldung, Datenbank), IONOS (Versand der Anmelde-Mails) |
| Drittland | Supabase, Inc. sitzt in den USA, Daten in Frankfurt; DPA und Standardvertragsklauseln [prüfen] |
| Löschfrist | bis der Verein das Konto entfernt oder der Verein gelöscht wird |

### A3 Kontaktformular und E-Mail

| | |
|---|---|
| Zweck | Anfragen beantworten, massenhaften Versand verhindern |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO, bei Fragen zur Nutzung lit. b |
| Betroffene | Absender von Anfragen |
| Daten | Name, E-Mail-Adresse, Verein, Nachricht, Prüfwert aus IP-Adresse und Tag (nicht die IP selbst) |
| Empfänger | Supabase (Speicherung), IONOS (Versand), Google (Postfach kontakt.cuedesk@gmail.com) |
| Drittland | Google und Supabase: USA; EU-US Data Privacy Framework bzw. Standardvertragsklauseln [prüfen] |
| Löschfrist | 90 Tage in CueDesk (Cron-Job `fristen-loeschen`), im Postfach nach Erledigung |

### A4 Systemprotokoll und Betrieb

| | |
|---|---|
| Zweck | Sicherheit, Fehlersuche, Nachweis von Support-Freigaben und Löschungen |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO |
| Betroffene | Benutzer mit Konto |
| Daten | Ereignis, Zeitpunkt, auslösendes Konto, betroffener Verein |
| Empfänger | Supabase |
| Löschfrist | Systemprotokoll 2 Jahre, Systemereignisse 1 Jahr (Cron-Job `fristen-loeschen`) |

### A5 Zustimmung der Vereine zu Nutzungsbedingungen und AVV

| | |
|---|---|
| Zweck | Nachweis, welcher Fassung ein Verein wann durch wen zugestimmt hat |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b und c DSGVO |
| Betroffene | Vereins-Administratoren |
| Daten | Verein, Fassung, Zeitpunkt, zustimmendes Konto |
| Empfänger | Supabase |
| Löschfrist | mit dem Verein, danach nicht mehr nötig [prüfen: Aufbewahrung als Vertragsnachweis] |

## Teil B: Betreiber als Auftragsverarbeiter

| | |
|---|---|
| Auftraggeber | jeder Verein, der CueDesk nutzt (Liste in der Konsole des Super-Admins) |
| Grundlage | Nutzungsbedingungen und Vertrag zur Auftragsverarbeitung, Zustimmung in CueDesk gespeichert |
| Kategorien der Verarbeitung | Speichern, Anzeigen, Auswerten (Rating, Ranglisten, Statistik), Sichern, Exportieren, Anonymisieren, Löschen |
| Betroffene | Mitglieder, Gastspieler, Benutzer mit Konto im Verein |
| Daten | Name, Anzeigename, Kürzel, Status, Ein- und Austritt, Merker minderjährig, Pass- und DBU-Nummer, Notiz, Einwilligungen mit Verlauf; Turniere, Partien, 14.1-Protokoll, Mannschaften, Rating; Änderungsprotokoll |
| Chat | nur wenn der Verein ihn einschaltet (Seite „System“) und das Turnier ihn vorsieht: Name, Text (höchstens 300 Zeichen), Turnier, Zeitpunkt; lesen nur Mitglieder mit Konto; löschen Verfasser und Turnierleitung; gelöscht 1 Tag nach Turnierende (Cron-Job `fristen-loeschen`) |
| Öffentlicher Live-Link | nur wenn die Turnierleitung ihn für ein Turnier oder einen Liga-Spieltag freigibt: Spielstände, Spielplan, Ergebnisse dieses Turniers für jeden mit dem Link, ohne Anmeldung; Namen nur mit nachgewiesener Einwilligung (Anzeigename ohne Vereinszusatz oder „Vorname N.“), sonst Kürzel; befristet bis zum eingestellten Tag, jederzeit zu beenden; Daten nur über die Funktion `oeffentliche_ansicht` |
| Nicht erfasst | Anschrift, Geburtsdatum, Bankdaten, besondere Kategorien (Art. 9) |
| Unterauftragsverarbeiter | Supabase, Inc. (Datenbank, Frankfurt); IONOS SE (Domain, Postfach, Versand der Anmelde-Mails); GitHub, Inc. (nur Ablage der verschlüsselten Sicherung) |
| Drittland | Supabase, Inc.: USA, Daten in Frankfurt; DPA und Standardvertragsklauseln [prüfen]. GitHub, Inc.: USA, nur verschlüsselte Sicherung; DPA und Data Privacy Framework [prüfen] |
| Sicherung | wöchentlich, vor der Ablage AES-256 verschlüsselt, in einem privaten GitHub-Repository, 12 Wochen; der Schlüssel liegt nicht bei GitHub |
| Löschung | Änderungsprotokoll 2 Jahre; Personen auf Wunsch anonymisiert; ganzer Verein 30 Tage nach Ende, in Sicherungen spätestens 12 Wochen später |

## Technische und organisatorische Maßnahmen

Siehe Anlage 1 in `auftragsverarbeitung.html`.

## Offene Punkte

- **Hosting und Sicherung:** entschieden am 07.10.2026, GitHub Pages und verschlüsselte Sicherung bei GitHub bleiben (AVV Anlage 2, Datenschutzerklärung und dieses Verzeichnis nachgezogen am 09.10.2026).
- **Verträge mit Dienstleistern:** DPA bei Supabase im Dashboard abschließen, AVV bei IONOS im Kundenkonto abschließen, DPA mit GitHub prüfen bzw. abschließen.
