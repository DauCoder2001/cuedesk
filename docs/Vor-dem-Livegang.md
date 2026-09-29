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
| Impressum für cuedesk.de | in Arbeit | Eigene Seite `impressum.html` (ohne Anmeldung und Datenbank), verlinkt unter der Anmeldekarte und in „Mein Konto“. E-Mail: kontakt.cuedesk@gmail.com. Zweiter Kontaktweg: Kontaktformular `kontakt.html` → Serverfunktion `kontakt` (Tabelle `kontakt_nachrichten`, Stufe 18, Löschung nach 90 Tagen, Spamfalle, 3 je Absender und Stunde, 50 am Tag), Versand über IONOS an kontakt.cuedesk@gmail.com. Secrets bei Supabase eingetragen, Versand getestet. Offen: Name, Anschrift über impressum-ohne-adresse.de (Basic-Tarif), Datum „Stand“, fachliche Prüfung. |
| Datenschutzerklärung | in Arbeit | Eigene Seite `datenschutz.html` (du-Anrede), verlinkt auf der Anmeldeseite, in „Mein Konto“, im Impressum und im Kontaktformular. Nennt Verantwortliche (Betreiber für Webseite, Konten, Kontakt; Verein für Spieldaten, Art. 28), GitHub Pages, Local Storage, Konto, Spieldaten und Sichtbarkeit, Kontaktformular, Dienstleister (Supabase, IONOS, GitHub, Google), Fristen, Rechte, Aufsichtsbehörde Niedersachsen. Offen: Name, Anschrift, Datum „Stand“, die mit [prüfen] markierten Grundlagen der USA-Übermittlungen, fachliche Prüfung. Voraussetzung: „Anonymisieren statt Löschen“ muss vor dem Livegang gebaut sein, die Erklärung verspricht es. |
| Nutzungsbedingungen für Vereine | offen | Was CueDesk leistet, Verfügbarkeit ohne Zusage, Sperren und Löschen, Kündigung. AGB erst nötig, wenn CueDesk etwas kostet. |
| Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) mit jedem Verein | offen | Jeder Verein ist verantwortlich für seine Daten, der Betreiber verarbeitet sie in seinem Auftrag. |
| Verträge zur Auftragsverarbeitung mit Dienstleistern | offen | Supabase (DPA im Dashboard abschließen), IONOS, GitHub. |
| Verzeichnis der Verarbeitungstätigkeiten | offen | Kurze Liste: welche Daten, wofür, wer hat Zugriff, wie lange. |
| Wöchentliche Sicherung in den USA | in Arbeit | `sicherung.yml` verschlüsselt den Auszug vor dem Hochladen (gpg, AES256, Secret `SICHERUNG_SCHLUESSEL`) und legt die Historie bei jedem Lauf neu an, damit es wirklich nur 12 Wochen gibt (vorher blieben gelöschte Auszüge in der Git-Historie). Offen: Secret anlegen und außerhalb von GitHub aufbewahren, Lauf von Hand starten und prüfen. |
| Seite auf GitHub Pages | offen | Aufrufe laufen über Server in den USA. Nennen oder auf einen EU-Anbieter umziehen, zum Beispiel IONOS, wo die Domain liegt. |
| Auskunft für ein einzelnes Mitglied (Art. 15, 20) | erledigt | Stufe 21: Funktion `person_auskunft` (Spieler selbst, Sportwart, Vereins-Admin; jeder Abruf im Systemprotokoll). Knöpfe „PDF“ und „JSON“ auf der Seite „Spieler“ und unter „Mein Konto“ → „Meine Daten“ (je verknüpftem Spieler). PDF aus `src/auskunft.ts`: Person, vertrauliche Angaben, Konto (Passwort nur „festgelegt“), Überblick, Turniere, Anmeldungen, Mannschaften, Partien mit Gegnern, Änderungsprotokoll ohne ändernde Konten, Zweck/Empfänger/Fristen/Rechte. JSON zusätzlich mit jeder 14.1-Aufnahme und dem Rating-Verlauf. |
| Anonymisieren statt Löschen | erledigt | Stufe 20: Funktion `person_anonymisieren` (nur Vereins-Administrator, nicht umkehrbar), Knopf „Anonymisieren“ auf der Seite „Spieler“ bei Spielern mit Ergebnissen. Name wird „Ehemaliger Spieler N“ (fortlaufend je Verein), Kürzel „EN“; gelöscht werden vertrauliche Angaben, Turnier-Anmeldungen, Einladungen, Konto-Verknüpfung (Konto ohne andere Rolle wird gelöscht) und Protokolleinträge mit dem Namen. Ergebnisse, Teilnahmen, Kader und 14.1-Protokoll bleiben. Anonymisierte Spieler sind nicht mehr bearbeitbar. |
| Aufbewahrungsfrist für Ergebnisse | erledigt | Ergebnisse, Turniere und Rating bleiben, solange der Verein CueDesk nutzt; auf Löschwunsch wird der Name durch einen Platzhalter ersetzt. Weitere Fristen: Änderungs- und Systemprotokoll 2 Jahre, Systemereignisse 1 Jahr, Kontaktnachrichten 90 Tage, per nächtlichem Cron-Job `fristen-loeschen` (Stufe 19). |
| Minderjährige | erledigt | Stufe 22: Konto und Namensanzeige nur mit Einwilligung der Erziehungsberechtigten, von der Vereinsleitung auf der Seite „Spieler“ erfasst. Einladen und Verknüpfen eines minderjährigen Spielers ohne diese Einwilligung lehnt die Datenbank ab (Trigger auf `einladungen` und `benutzer_personen`). |
| Einwilligung zur Namensanzeige | erledigt | Stufe 22: Tabelle `einwilligungen` als Verlauf (Art, erteilt/widerrufen, Weg, Fassung des Wortlauts, Zeitpunkt, erfassendes Konto), Funktion `einwilligung_setzen`; `name_oeffentlich` folgt daraus und lässt sich nicht mehr von Hand einschalten. Mitglied willigt unter „Mein Konto“ selbst ein und widerruft dort; Vereinsleitung erfasst schriftliche Einwilligungen und Widerrufe. Die 53 bisherigen Haken stehen als „übernommen, ohne Nachweis“ im Verlauf, bis die Vereinsleitung sie bestätigt oder widerruft. Wortlaut: `src/einwilligung.ts`. Die TV-Ansicht im Vereinsheim zeigt weiter volle Namen (Entscheidung 29.09.2026: nicht öffentlich im Internet). |

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
