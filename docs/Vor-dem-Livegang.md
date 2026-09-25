# Vor dem Livegang

Stand: 25.09.2026 · Sammelliste von Matthias und Claude

Der Livegang auf www.cuedesk.de (Phase 4 in Mandanten.md) kommt erst, wenn die Punkte hier erledigt oder bewusst zurückgestellt sind. Was fachlich fehlt, steht zusätzlich in Funktionsvergleich.md.

**Status:** offen · in Arbeit · erledigt · zurückgestellt

## 1. Funktionen

| Punkt | Status | Stand und Vorschlag |
|---|---|---|
| Funktionsvergleich mit Pool-TS und Turnier light durchgehen | offen | Matthias geht Funktionsvergleich.md durch und trägt die Entscheidungen ein. Danach setzen wir die Lücken um. |
| Turnier ausschreiben (WhatsApp, Mail) | offen | Pool-TS hatte eine WhatsApp-Ankündigung als Text zum Kopieren. **Vorschlag:** Das Turnier bekommt Ausschreibungsangaben (Beginn, Meldeschluss, Startgeld, Hinweis). Der Knopf „Ausschreibung teilen“ öffnet am Handy das Teilen-Menü mit WhatsApp, am PC WhatsApp Web. Für Mail öffnet er das eigene Mailprogramm mit den Mitgliedern im BCC; der Mailversand von CueDesk schafft nur wenige Mails pro Stunde. Dazu auf Wunsch ein PDF als Aushang. |
| Auslosung teilen | offen | Wie in Pool-TS: Gruppen und Spieler als WhatsApp-Text. |
| Anmeldung zum Turnier | offen | **Vorschlag:** Link in der Ausschreibung. Mitglieder mit Konto melden sich bis zum Meldeschluss selbst an und ab. Die Leitung sieht die Liste und übernimmt sie mit einem Klick als Teilnehmer. Mitglieder ohne Konto trägt die Leitung ein. Braucht eine Tabelle für Anmeldungen und eine Regel, dass jeder nur sich selbst anmeldet. |
| Zuschauer-Funktion öffentlich | offen | Vorhanden sind „Live“ für angemeldete Mitglieder, das Scoreboard zum Zusehen und die TV-Ansicht. Pool-TS hatte zusätzlich eine öffentliche Seite mit Gruppen, KO und Rangliste. Öffentlich erst nach Impressum und Datenschutz; Namen ohne Einwilligung nur als Kürzel (`name_oeffentlich`). |
| Chat für Zuschauer | offen | Technisch machbar über Supabase Realtime. Rechtlich aufwendig: Jemand muss moderieren, Beiträge müssen auf Hinweis gelöscht werden können, und unter den Mitgliedern sind Minderjährige. **Vorschlag:** zurückstellen oder klein anfangen, nur für angemeldete Mitglieder oder zuerst nur mit festen Reaktionen wie Applaus. |
| Spiele- und Turnierarchiv | offen | Heute verteilt auf Turnierliste, PDF-Berichte, Serien, Ranglisten, Pool- und 14.1-Statistik. **Vorschlag:** eine Archivansicht mit Filtern nach Saison, Disziplin, Turnierart und Spieler, dazu der direkte Vergleich zweier Spieler. |
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
| Überwachung per E-Mail (Sicherung, Datenbankgröße) | offen | Die Konsole warnt schon; eine Mail fehlt noch. |
| Test-Verein auf cuedesk.de | offen | Mit „Demo zurücksetzen“. |
| Einladung eines Vereins-Administrators mit echter Mail prüfen | offen | Am besten mit dem Test-Verein auf cuedesk.de. |
| Tablet-Probe beim nächsten Spieltag | offen | Nach dem Antippen einer 14.1-Paarung darf kein `spiel=` in der Adresse stehen. |
