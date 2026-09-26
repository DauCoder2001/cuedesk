# CueDesk für mehrere Vereine (Mandanten)

Stand: 25.09.2026 · Plan, abgestimmt mit Matthias

Ziel: CueDesk betreut mehrere Vereine in einer Datenbank. Ein Super-Admin legt Vereine an, sperrt sie, setzt ihre Vereins-Administratoren ein und behält Sicherung, Nutzung und Datenbank im Blick. Auf www.cuedesk.de gibt es später einen Test-Verein.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Einblick des Super-Admins | **Nur Kennzahlen.** Namen, Ergebnisse und Einstellungen eines Vereins sieht er nur, wenn der Vereins-Administrator einen befristeten Support-Zugang freigibt. |
| Gesperrter Verein | **Kein Zugang.** Nach der Anmeldung erscheint nur „Dieser Verein ist gesperrt“. Tablets laufen nur noch offline. |
| Verein löschen | **Zweistufig.** Erst sperren und Export ziehen, nach 30 Tagen endgültig löschen. Bis dahin lässt sich die Sperre aufheben. |
| Umgebung | **Erst Test-Datenbank**, das Produktions-Projekt für cuedesk.de kommt in Phase 4. |

## Ausgangslage

Schon vorhanden:
- Jede Tabelle hängt an `verein_id`, die Datenbank-Regeln trennen die Vereine.
- `benutzer.systemadmin` und `ist_systemadmin()`; Vereine anlegen und löschen darf nur der Super-Admin.
- `vereine.aktiv`, `vereine.slug`, `vereine.logo_url`, `vereine.einstellungen`.
- Nächtliches Rating für alle aktiven Vereine, wöchentliche Sicherung der ganzen Datenbank.

Lücken:
1. Keine Oberfläche für den Super-Admin; Super-Admin wird man nur direkt in der Datenbank.
2. Die Sitzung nimmt den ersten Verein eines Kontos – kein Wechsel möglich.
3. `vereine.aktiv = false` sperrt nichts: `hat_rolle()` und `ist_im_verein()` prüfen es nicht.
4. `ist_systemadmin()` öffnet heute alle Vereinsdaten zum Lesen (widerspricht „nur Kennzahlen“).
5. 15 Verweise auf `vereine` sind `on delete restrict` – gewollt als Schutz; Löschen braucht eine Funktion, die in fester Reihenfolge löscht.
6. Sicherung und Wiederherstellung nur für die ganze Datenbank.

## Phase 1 · Kern

**Stand 25.09.2026: umgesetzt** in der Test-Datenbank (Migrationen stufe11_mandanten und stufe11_lesezugriff, Serverfunktion einladung Version 3, Seiten Konsole und System). Geprüft: Trennung der Daten mit und ohne Freigabe, Freigabe nur lesend, Sperre mit Hinweis, Vereinsauswahl. Noch nicht am echten Ablauf geprüft: Einladung eines Vereins-Administrators durch den Super-Admin (verschickt eine echte E-Mail).

1. **Super-Admin-Zugriff zurückbauen:** `ist_systemadmin()` aus den Regeln der Vereinsdaten entfernen. Neu `support_freigegeben(verein)`: wahr, solange eine Freigabe des Vereins-Administrators läuft (Tabelle `support_freigaben`: Verein, bis, von wem). Freigabe auf der Seite „System“, Dauer wählbar (1, 3 oder 7 Tage), jederzeit zurückziehbar.
2. **Sperre wirksam machen:** `hat_rolle()` und `ist_im_verein()` verlangen einen aktiven Verein; ebenso die Geräte-Funktionen. Neue Funktion `meine_vereine()` liefert Name und Status der eigenen Vereine – auch gesperrter, damit die Oberfläche den Hinweis zeigen kann.
3. **Vereinswechsel:** Die Sitzung lädt alle Vereine des Kontos. Bei mehr als einem erscheint oben eine Auswahl; die letzte Wahl bleibt im Browser gemerkt.
4. **Super-Admins verwalten:** `systemadmin_setzen(konto, ja/nein)` nur für Super-Admins; der letzte Super-Admin kann sich nicht selbst entfernen.
5. **Verein anlegen:** Name, Kurzname, Kürzel für die Adresse (`slug`), Test-Verein ja/nein; dazu die E-Mail des ersten Vereins-Administrators, der über die vorhandene Einladung (Serverfunktion `einladung`) seinen Anmeldelink bekommt.
6. **Protokoll:** Tabelle `system_protokoll` (wer, wann, was, welcher Verein) für alle Super-Admin-Aktionen.

## Phase 2 · Konsole

**Stand 25.09.2026: umgesetzt** (Migration stufe12_konsole, Konsole mit Nutzung, Sicherung und Rating, Datenbank). Die Rückmeldung der Sicherung ist seit dem Lauf vom 25.09.2026 bestätigt (erfolgreich, 1,9 MB). Ausgelassen: Super-Admins und Protokoll gab es schon in Phase 1.

Eigene Ansicht für Super-Admins (statt der Vereinsreiter, wenn kein Verein gewählt ist):
- **Vereine:** Status, Test-Kennzeichen, Konten, Mitglieder, letzte Anmeldung, Partien der letzten 30 Tage, Tablets online, belegter Speicher (geschätzt). Aktionen: anlegen, sperren/entsperren, Vereins-Administrator einladen.
- **Super-Admins:** Liste, hinzufügen, entfernen.
- **Verein bearbeiten** (ergänzt 26.09.2026, Migration stufe14_verein_aendern): Name, Kurzname, Adresse und Test-Kennzeichen; im Protokoll mit vorher → nachher. Logo und Vorgaben bleiben beim Vereins-Administrator.
- **Datenbank:** Größe im Verhältnis zur Tarifgrenze, größte Tabellen, aktive Verbindungen – über eine Funktion nur für Super-Admins.
- **Sicherung:** Die Sicherung meldet jeden Lauf zurück (Zeit, Erfolg, Größe) in `system_ereignisse`; die Konsole zeigt den letzten Lauf und warnt, wenn er älter als 8 Tage ist oder fehlschlug.
- **Protokoll** der Super-Admin-Aktionen.

Alle Kennzahlen kommen aus Funktionen, die nur zählen – keine Namen, keine Ergebnisse.

## Phase 3 · Datenpflege

**Stand 25.09.2026: umgesetzt** (Migrationen stufe13_datenpflege, stufe13_demo_fix und stufe13_protokoll_namen, Konsole mit Export, Löschen, Demo und Aufräumen, Export auf der Seite System). Entschieden: Der Vereins-Admin exportiert jederzeit, der Super-Admin nur gesperrte Vereine. Beim Löschen fallen die Konten weg, die nur in diesem Verein eine Rolle hatten (Super-Admins bleiben). Test-Vereine lassen sich ohne Frist löschen. Der nächtliche Lauf heißt `vereine-loeschen` (03:00 UTC). Im Export fehlen bewusst das Änderungsprotokoll, die Tischstände und die Anmeldekennungen der Tablets.

- **Verein exportieren:** alle Daten eines Vereins als Datei (JSON), auch für die Datenübertragbarkeit nach DSGVO.
- **Verein löschen:** Sperren setzt `loeschen_ab` = heute + 30 Tage; ein nächtlicher Lauf löscht danach in fester Reihenfolge. Vorher Pflicht: Export.
- **Aufräumen mit Vorschau:** verwaiste Geräte, abgelaufene Einladungen und Kopplungscodes, alte Tischstände, Testdaten. Erst „betroffen: …“, dann ausführen.
- **Test-Verein:** Kennzeichen `test`, taucht in keiner Statistik auf; „Demo zurücksetzen“ löscht seine Daten und legt Beispieldaten neu an.

## Phase 4 · Livegang cuedesk.de

- Produktions-Projekt bei Supabase (Pro-Tarif empfohlen: tägliche Sicherung, kein Pausieren), Migrationen aus diesem Repository einspielen.
- Domain www.cuedesk.de auf die Veröffentlichung zeigen lassen.
- Eigener E-Mail-Absender für Anmeldelinks.
- Zwei-Faktor-Anmeldung für Super-Admins.
- Impressum, Datenschutzerklärung, Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) mit jedem Verein – rechtlich prüfen lassen.
- Überwachung: Hinweis per E-Mail, wenn die Sicherung fehlschlägt oder die Datenbank an ihre Grenze kommt.

## Offene Fragen für später

- Sollen Vereinsseiten eine eigene Adresse bekommen (cuedesk.de/verden) – etwa für Ranglisten oder den Fernseher?
- Grenzen je Verein (Tische, Tablets, Konten)?
- Wer bekommt die Warnungen der Überwachung?
