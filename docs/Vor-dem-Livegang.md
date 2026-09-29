# Vor dem Livegang

Stand: 25.09.2026 · Sammelliste von Matthias und Claude

Der Livegang auf www.cuedesk.de (Phase 4 in Mandanten.md) kommt erst, wenn die Punkte hier erledigt oder bewusst zurückgestellt sind. Was fachlich fehlt, steht zusätzlich in Funktionsvergleich.md.

**Status:** offen · in Arbeit · erledigt · zurückgestellt

## 1. Funktionen

| Punkt | Status | Stand und Vorschlag |
|---|---|---|
| Funktionsvergleich mit Pool-TS und Turnier light durchgehen | offen | Matthias geht Funktionsvergleich.md durch und trägt die Entscheidungen ein. Danach setzen wir die Lücken um. |
| Turnier ausschreiben (WhatsApp, Mail) | erledigt | Abschnitt „Ausschreibung“ in der Turnieransicht (in Vorbereitung): Beginn, Meldeschluss, Startgeld, Höchstzahl, Hinweis. Text kopieren, per WhatsApp oder E-Mail teilen, Aushang als PDF mit den schon Eingetragenen. Dazu „Ändern“ für Turniere bis zur Auslosung. |
| Auslosung teilen | erledigt | Aufklappbarer Abschnitt „Auslosung teilen“ in der Turnieransicht nach der Auslosung: Gruppen und Spieler in Startnummer-Reihenfolge, wahlweise mit Rating und den Spielen der 1. Runde; kopieren, per WhatsApp oder E-Mail teilen. |
| Anmeldung zum Turnier | erledigt | Schalter „Anmeldung für Mitglieder offen“ in der Ausschreibung, Link `?anmeldung=` im Text. Mitglieder mit verknüpftem Spieler melden sich auf der Seite Turniere bis zum Meldeschluss an und ab (Tabelle `turnier_anmeldungen`, Funktion `turnier_anmelden`, Stufe 16). Ab der Höchstzahl Nachrücker. Die Leitung übernimmt Angemeldete mit einem Klick als Teilnehmer und sieht Abmeldungen. Offen: Beim Anmelden über den Mail-Link geht `?anmeldung=` verloren, dann die Seite Turniere von Hand öffnen. |
| Zuschauer-Funktion öffentlich | offen | Vorhanden sind „Live“ für angemeldete Mitglieder, das Scoreboard zum Zusehen und die TV-Ansicht. Pool-TS hatte zusätzlich eine öffentliche Seite mit Gruppen, KO und Rangliste. Öffentlich erst nach Impressum und Datenschutz; Namen ohne Einwilligung nur als Kürzel (`name_oeffentlich`). |
| Chat für Zuschauer | offen | Technisch machbar über Supabase Realtime. Rechtlich aufwendig: Jemand muss moderieren, Beiträge müssen auf Hinweis gelöscht werden können, und unter den Mitgliedern sind Minderjährige. **Vorschlag:** zurückstellen oder klein anfangen, nur für angemeldete Mitglieder oder zuerst nur mit festen Reaktionen wie Applaus. |
| Spiele- und Turnierarchiv | erledigt | Reiter „Archiv“ für alle Mitglieder: beendete und abgebrochene Turniere, Liga-Spieltage und Einzelspiele mit Filtern nach Saison, Disziplin, Turnierart und Spieler (Gäste wählbar). Mit „gegen“ der direkte Vergleich: Siege, Racks, Bilanz je Disziplin mit Rating und 14.1-GD/HS, die letzten 10 Begegnungen als Reihe, gemeinsame Turniere mit Platz. Die 14.1-Kennzahlen je Partie (`partien_141`) sind dafür für alle Mitglieder lesbar (Stufe 17), das Aufnahme-Protokoll bleibt geschützt. |
| Funktions- und Designänderungen | offen | Sammeln wir beim Durchgehen des Funktionsvergleichs. |

## 2. Recht und Datenschutz

Entwürfe kann Claude schreiben. Sie ersetzen keine Rechtsberatung und müssen vor dem Livegang von jemandem mit Fachwissen geprüft werden.

| Punkt | Status | Stand und Vorschlag |
|---|---|---|
| Impressum für cuedesk.de | offen | Pflicht nach § 5 Digitale-Dienste-Gesetz. Nötig sind Name, eine Anschrift, unter der Post zugestellt werden kann, E-Mail und ein schneller Kontaktweg. Claude baut die Seite ein, die Angaben kommen von Matthias. |
| Datenschutzerklärung | offen | Muss nennen: Supabase (Datenbank, Frankfurt), IONOS (Mailversand), GitHub (Seite auf GitHub Pages und wöchentliche Sicherung, beides USA), welche Daten zu welchem Zweck und wie lange, Rechte der Betroffenen. |
| Nutzungsbedingungen für Vereine | offen | Was CueDesk leistet, Verfügbarkeit ohne Zusage, Sperren und Löschen, Kündigung. AGB erst nötig, wenn CueDesk etwas kostet. |
| Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) mit jedem Verein | offen | Jeder Verein ist verantwortlich für seine Daten, der Betreiber verarbeitet sie in seinem Auftrag. |
| Verträge zur Auftragsverarbeitung mit Dienstleistern | offen | Supabase (DPA im Dashboard abschließen), IONOS, GitHub. |
| Verzeichnis der Verarbeitungstätigkeiten | offen | Kurze Liste: welche Daten, wofür, wer hat Zugriff, wie lange. |
| Wöchentliche Sicherung in den USA | offen | Die Sicherung mit Mitgliederdaten liegt im privaten Repository bei GitHub. **Möglichkeiten:** in der Datenschutzerklärung nennen, die Sicherung vor dem Hochladen verschlüsseln oder bei einem EU-Anbieter ablegen. |
| Seite auf GitHub Pages | offen | Aufrufe laufen über Server in den USA. Nennen oder auf einen EU-Anbieter umziehen, zum Beispiel IONOS, wo die Domain liegt. |
| Auskunft für ein einzelnes Mitglied (Art. 15, 20) | offen | Heute nur als Export des ganzen Vereins. Vorschlag: Export je Person auf der Spielerseite. |
| Anonymisieren statt Löschen | offen | Wer Partien gespielt hat, kann heute nur auf „Ausgetreten“ gesetzt werden. Laut Konzept werden die Stammdaten gelöscht und die Partien mit einem anonymen Platzhalter behalten, damit Rating und Tabellen der Gegner stimmen. |
| Aufbewahrungsfrist für Ergebnisse | offen | Festlegen und in der Datenschutzerklärung nennen. |
| Minderjährige | offen | Merker `minderjaehrig` ist vorhanden. Ein Konto nur mit Einwilligung der Eltern; wie das festgehalten wird, ist offen. |
| Einwilligung zur Namensanzeige | offen | Der Schalter `name_oeffentlich` ist da; wie die Einwilligung eingeholt und belegt wird, ist offen. |

**Bereits vorhanden:**
- Datenbank in der EU (Frankfurt).
- Wenig Stammdaten: keine Adresse, kein Geburtsdatum, keine Bankdaten.
- Strikte Trennung der Vereine, Rollen und Rechte.
- Der Super-Admin sieht nur Kennzahlen, mehr nur mit befristetem Support-Zugang.
- Änderungsprotokoll.
- Export je Verein.
- Löschen mit 30 Tagen Frist.
- Aufräumen verwaister Daten.

## 3. Betrieb (Phase 4 in Mandanten.md)

| Punkt | Status | Stand und Vorschlag |
|---|---|---|
| Produktions-Projekt bei Supabase | offen | Pro-Tarif empfohlen: tägliche Sicherung, kein Pausieren. Richtet Matthias ein, Claude spielt nach Freigabe die Migrationen ein. |
| Domain www.cuedesk.de auf die Seite | offen | |
| Eigener E-Mail-Absender für Anmeldelinks | teilweise | IONOS-Postfach der Domain läuft schon in der Test-Datenbank. |
| Zwei-Faktor-Anmeldung für Super-Admins | offen | |
| Anmeldung per SMS-Code | zurückgestellt | Verworfen: SMS kosten über einen Anbieter etwa 7–10 Cent je Nachricht. Stattdessen wahlweise ein Passwort (Mein Konto, bestätigt per Mail-Code). |
| Passwort-Mindestlänge im Produktions-Projekt | offen | Im Supabase-Dashboard unter Authentication → Providers → Email auf 10 setzen, wie im Test-Projekt. „Allow new users to sign up“ bleibt an (Tablets). |
| Überwachung per E-Mail (Sicherung, Datenbankgröße) | offen | Die Konsole warnt schon; eine Mail fehlt noch. |
| Test-Verein auf cuedesk.de | offen | Mit „Demo zurücksetzen“. |
| Einladung eines Vereins-Administrators mit echter Mail prüfen | offen | Am besten mit dem Test-Verein auf cuedesk.de. |
| Tablet-Probe beim nächsten Spieltag | offen | Nach dem Antippen einer 14.1-Paarung darf kein `spiel=` in der Adresse stehen. |
