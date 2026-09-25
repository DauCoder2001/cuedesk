# Funktionsvergleich Pool-TS · Turnier light · CueDesk

Stand: 25.09.2026 · Grundlage zum Durchgehen und Abhaken

Quellen:
- **Pool-TS:** `Documents/Claude/Billard-Turnier` mit README, `_Dokumentation`, den Seiten unter `zentrale/`, `public/`, `tv/`, `scoreboards/` und `js/`.
- **Turnier light:** `Claude Projekte/Turnier light` mit Turnierplan v60, Gruppen v64, KO v74, Serienwertung v15 und der Rating-Erklärung. Dazu `Turnier light als Programm/docs`.
- **CueDesk:** die aktuellen Seiten unter `src/seiten/` und `scoreboards/`.

Die Liste stammt aus Dokumentation, Überschriften und Knöpfen der Seiten, nicht aus einem vollständigen Durchklicken. Was mit „prüfen“ markiert ist, bitte im Programm ansehen.

**Spalte CueDesk:** vorhanden · teilweise · fehlt · entfällt (Ersatz daneben)
**Spalte Entscheidung:** leer lassen und beim Durchgehen eintragen, etwa „übernehmen“, „nicht nötig“ oder „später“.

## 1. Turnier vorbereiten

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| Turnier ankündigen als WhatsApp-Text (Art, Disziplin, Race, Datum, Start, Anmeldeschluss) | ja | – | **fehlt** | In Pool-TS gibt es „WhatsApp-Ankündigung erstellen“ und „Text kopieren“. | |
| Auslosung als WhatsApp-Text | ja | – | **fehlt** | „WhatsApp-Auslosung“ mit Gruppen und Spielern. | |
| Anmeldung der Spieler | über WhatsApp („Bitte eintragen“) | von Hand | **fehlt** | Idee: Selbstanmeldung für Mitglieder mit Konto, siehe Vor-dem-Livegang.md. | |
| Spieler eintragen, Tippfehler und doppelte Namen erkennen | ja | ja | vorhanden | CueDesk wählt aus der Spielerliste, doppelte Namen fallen damit weg. | |
| Gesetzte Spieler vor der Auslosung | – | ja | vorhanden | | |
| Automatische Gruppenzahl nach Teilnehmerzahl (bis 7 eine, ab 16 vier Gruppen) | ja | – | teilweise | In CueDesk wählt die Leitung den Modus, es gibt keinen Vorschlag nach Teilnehmerzahl. | |
| Vorbereitete Turniere speichern | bis 4 | Datei | vorhanden | In CueDesk als geplante Turniere, ohne Obergrenze. | |
| Turnierarten mit Serienwertung (Liga, freies Turnier) | ja | – | vorhanden | In CueDesk über Serien. | |
| Vorgaben für neue Turniere (Race, Modus, Vorgabe) | – | – | vorhanden | Seite System. | |
| Startgeld verwalten | Idee | – | **fehlt** | Steht im Backlog von Pool-TS. | |

## 2. Turnierformen

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| Jeder gegen jeden (eine Gruppe) | ja | v60 | vorhanden | | |
| Zwei Gruppen mit Platzierungsspielen | ja | Gruppen v64 | vorhanden | | |
| Gruppen mit KO, Phase 3 | vier Gruppen und KO | KO v74 | vorhanden | Vier Gruppen: prüfen, ob alle Varianten aus Pool-TS gehen. | |
| Liga-Spieltag (Begegnung, Hin- und Rückrunde) | Turnierart „Liga“ | – | vorhanden | In CueDesk mit Mannschaften und Spielbericht-Import. | |
| Einzelspiel ohne Turnier | am Tablet | – | vorhanden | Zählt nie fürs Rating. | |
| Doppel-KO | – | Idee | **fehlt** | Steht in den offenen Punkten von Turnier light. | |
| Schweizer System | Idee | – | **fehlt** | Steht im Backlog von Pool-TS. | |
| Tischzahl im Spielplan berücksichtigen (Wellen, Zuteilung) | – | offen | teilweise | CueDesk teilt Partien Tischen zu, der Plan kennt die Tischzahl aber nicht. | |

## 3. Turnier leiten

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| Ergebnisse eintragen und korrigieren | ja | ja | vorhanden | | |
| Spiel von Hand hinzufügen | ja | – | prüfen | | |
| Rückgängig | – | ja | vorhanden | In CueDesk dazu der Verlauf je Partie. | |
| Wiederherstellungspunkte | – | ja | entfällt | Ersatz: Datenbank und Änderungsprotokoll. | |
| Rundensperre | – | ja | vorhanden | | |
| Spieler nachtragen | – | ja | vorhanden | | |
| Stichkampf bzw. Shoot-Out bei Gleichstand | Shoot-Out-Hinweis | Stichkampf | vorhanden | | |
| Rangliste: Siege, Differenz, direkter Vergleich | ja | ja | vorhanden | | |
| Vorgabe über das Vereins-Rating | – | ja | vorhanden | | |
| Rating in der Ansicht ausblenden | – | ja | vorhanden | | |
| Zeitprognose | – | ja | vorhanden | | |
| Pause | Admin-Passwort | – | vorhanden | | |
| Vollbild für den Turnierplan | – | ja | **fehlt** | Die Scoreboards haben Vollbild, die Turnierseite in CueDesk nicht. | |

## 4. Am Tisch (Scoreboards)

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| Pool-Scoreboard 8/9/10-Ball | ja | – | vorhanden | | |
| 14.1-Scoreboard mit Protokoll | ja | – | vorhanden | | |
| Tablet-Startseite (Tisch und Spielart) | ja | – | vorhanden | | |
| Anstoß-Anzeige, Seitenwechsel | ja | – | vorhanden | | |
| Protokoll teilen oder per Mail | ja | – | vorhanden | | |
| Bildschirm bleibt an, Leerlauf-Erkennung | ja | – | vorhanden | | |
| Regel-Frage per Sprache (DBU/WPA) | ja | – | **fehlt** | `rules-help.js` und `rules-knowledge.js` wurden nicht übernommen. | |
| Hinweis-Symbole „?“ an Bedienelementen | ja | – | teilweise | CueDesk nutzt stattdessen Tooltips. | |
| Weitere Spielarten (One Pocket, Bowliard, Training) | geplant | – | **fehlt** | | |
| Tablet koppeln, Tisch zuordnen, neu laden | – | – | vorhanden | Gibt es nur in CueDesk. | |

## 5. Zuschauer und TV

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| TV-Ansicht aller Tische | ja | – | vorhanden | | |
| TV: Auslosung, Turnierergebnis, automatische Umschaltung | ja | – | vorhanden | | |
| Live-Übersicht für die Leitung | ja | – | vorhanden | Reiter „Live“. | |
| Öffentliche Zuschauerseite ohne Anmeldung (Gruppen, KO, Rangliste) | `public/index.html` | – | **fehlt** | Bewusst zurückgestellt, bis Impressum und Datenschutz stehen. | |
| Live für angemeldete Mitglieder | – | – | vorhanden | | |
| Chat für Zuschauer | – | – | **fehlt** | Neue Idee, siehe Vor-dem-Livegang.md. | |
| Streaming-Overlay | Idee | – | **fehlt** | | |
| Nachricht „du bist dran“ (SMS/Push) | Idee | – | **fehlt** | | |

## 6. Auswertung und Archiv

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| Ergebnis-Archiv nach Spieltagen | ja | – | teilweise | Die beendeten Turniere stehen in der Liste; es gibt keine eigene Archivansicht mit Filtern. | |
| Einzelne Spiele löschen | ja | – | prüfen | Ein Ergebnis lässt sich korrigieren, einen eigenen Knopf „Partie löschen“ habe ich nicht gefunden. | |
| Saison-Überblick | ja | – | **fehlt** | Prüfen, ob Ranglisten und Serien das abdecken. | |
| Beste drei Spieler | ja | – | teilweise | Ranglisten, Titel. | |
| Spielzeit je Tisch | ja | – | **fehlt** | | |
| Jahresauswertung Turniere | ja | – | teilweise | Serien und Ranglisten. | |
| Jahresauswertung Serien | ja | Serienwertung | vorhanden | Streicher und Bonus. | |
| Einzelspieler-Auswertung | ja | Spieler-Detail | vorhanden | Pool-Statistik: Verlauf, Form, Bilanz gegen Gegner. | |
| 14.1-Statistik | – | – | vorhanden | Gibt es nur in CueDesk. | |
| Vereins-Rating mit Rating-Liste | – | ja | vorhanden | | |
| Rating-Startwert setzen | – | ja | vorhanden | | |
| Spieler zusammenführen (doppelte Namen) | – | ja | teilweise | In CueDesk nur beim Import von Altdaten, nicht für vorhandene Spieler. | |
| Spieler in Listen ausblenden | – | ja | vorhanden | „Rating ausgeblendet“. | |
| PDF: Turnierbericht, Rangliste, Serie | – | ja | vorhanden | | |
| Drucken | – | ja | vorhanden | | |
| Ergebnis per Mail verschicken | – | „Mail“-Knopf | **fehlt** | | |
| Excel-Import älterer Turniere | ja | – | **fehlt** | CueDesk übernimmt die Altdaten aus Turnier light und Spielberichte. | |
| Altdaten-CSV einlesen | – | ja | teilweise | Prüfen, ob die CSV-Wege von Turnier light gebraucht werden. | |
| Rating-Stand exportieren | – | ja | **fehlt** | Nur als Teil des Vereins-Exports. | |

## 7. Verwaltung und Betrieb

| Funktion | Pool-TS | Turnier light | CueDesk | Anmerkung | Entscheidung |
|---|---|---|---|---|---|
| Admin-Passwort | ja | – | entfällt | Ersatz: Anmeldung mit Rollen. | |
| Tische und Tablets verwalten | ja | – | vorhanden | | |
| TV-Anzeige einstellen | ja | – | vorhanden | Je Turnier. | |
| Raspberry Pi | ja | – | entfällt | Ersatz: Cloud. | |
| Speicherdatei, Sicherungskopie | – | ja | entfällt | Ersatz: wöchentliche Sicherung und Export je Verein. | |
| Datenbank leeren | Passwort | – | entfällt | Ersatz: Aufräumen in der Konsole. | |
| Offline-Betrieb | Pi im WLAN | Einzeldatei | teilweise | Die Scoreboards gibt es offline, CueDesk selbst braucht Internet. | |
