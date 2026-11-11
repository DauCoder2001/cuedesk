# Änderungen an CueDesk

## 0.6.0 – 11.11.2026

- Turnierbericht (PDF): Die Kopfzeile wird umbrochen statt abgeschnitten, Datum und Uhrzeit fehlen nicht mehr. Ist das Race in allen Runden gleich, steht es kurz da.
- Neu unter dem Kopf: Sieger, Zahl der Partien und Sätze (beim Doppel-KO auch die Freilose).
- Einheitliche Begriffe in Endtabelle und Turnieransicht: „Finale gewonnen/verloren“, „Spiel um Platz 3 gewonnen/verloren“, „Platzierungsspiel gewonnen/verloren“, „Viertelfinale verloren“, „Verliererrunde 4 verloren“. Die Erklärung der Reihenfolge steht als Fußnote unter der Endtabelle.
- Gruppentabellen im Bericht mit Spielen, Siegen und Niederlagen, bei Gruppen mit KO mit dem KO-Startplatz; bis 8 Spieler je Gruppe zusätzlich eine Kreuztabelle.
- Ergebnislisten: Sieger fett, dazu Tisch und Spielzeit, wenn am Tablet gespielt wurde.
- Doppel-KO-Bericht: kein Seitenwechsel vor den Spielen, „Freilos“ nur noch einmal, Spalte „Gesetzt“ nur bei Gesetzten, Gesetzte unter den Hinweisen zur Auslosung. Auch die anderen Turnierberichte laufen ohne erzwungenen Seitenwechsel durch.
- Alle PDFs (auch Spielbericht, Serienwertung, Auskunft): lange Absätze werden umbrochen. Zu breite Tabellen, etwa eine Serie mit vielen Turnieren, bekommen eine kleinere Schrift, statt Werte abzuschneiden.

## 0.5.0 – 09.11.2026

- Standfelder im Turnier-Spielplan und im Teamvergleich begrenzen schon beim Tippen: höchstens das Race to, und hat die Gegenseite es erreicht, höchstens eins weniger.
- Im Turnier-Spielplan springt ein Stand unter der Vorgabe beim Verlassen des Feldes auf die Vorgabe.

## 0.4.0 – 09.11.2026

- Zeitschätzung schon vor dem Start: Unter **Auslosen und starten** steht die geschätzte Dauer aus Partien, aktiven Tischen und dem Vereinswert.
- Neuer Vereinswert **Minuten je Partie bei Race to 3** auf der Seite **System** (Standard 35), bei anderem Race wird umgerechnet. Sind genug Partien am Tablet gemessen, wird der gemessene Wert zum Übernehmen angeboten.
- Im Turnier löst das gemessene Tempo den Vereinswert gleitend ab, ganz erst ab 24 Sätzen und 60 Minuten.
- Fortschrittsbalken im Turnierkopf mit Zahl und Prozent; noch nicht angesetzte Duelle und KO-Spiele zählen mit.

## 0.3.0 – 08.11.2026

- CueDesk-Agent 1.0.0 für das TV-Gerät (Ordner `pi-agent`): Er fährt das Gerät herunter, wenn in CueDesk **TV-Gerät herunterfahren** geklickt wird.

## 0.2.0 – 08.11.2026

- TV-Gerät herunterfahren: Nach dem Abschließen eines Turniers, Teamvergleichs oder ganzen Liga-Spieltags gibt es den Knopf **TV-Gerät herunterfahren**, außerdem in der Geräteliste unter **Tische und Geräte**.
- Der Vereins-Administrator erzeugt dafür unter **Tische und Geräte** einen **Agent-Schlüssel** für den Fernseher.
- TV-Seiten blenden den Mauszeiger aus, wenn sich die Maus drei Sekunden lang nicht bewegt.

## 0.1.0

- Stand vor Einführung dieser Liste.
