# Änderungen an CueDesk

## 0.14.0 – 12.11.2026

- Neu unter **System**: **Gäste bereinigen**. Der Vereins-Administrator sucht Gäste ohne Spiel aus einem Zeitraum (Anlegedatum), hakt ab, wer bleiben soll, und entfernt den Rest mit dem Schutzwort. So wächst die Gästeliste durch eingelesene Mannschaftspässe nicht immer weiter.
- Gäste mit Partien oder Turnierteilnahme, Gäste eines noch nicht abgeschlossenen Spieltags sowie angemeldete, im Kader stehende oder mit einem Konto verknüpfte Gäste bleiben immer.
- Braucht eine Datenbank-Migration (neue Funktionen `gaeste_ohne_spiel` und `gaeste_bereinigen`).

## 0.13.1 – 12.11.2026

- Behoben: Ein Doppelklick auf **Anlegen** im Formular „Neues Turnier“ konnte das Turnier und die Gäste aus dem Mannschaftspass des Gegners doppelt anlegen. Der Knopf ist jetzt während des Speicherns gesperrt und zeigt „Wird angelegt …“.
- Zusätzliche Sicherung: Direkt vor dem Anlegen eines Gastes aus dem Pass sucht CueDesk noch einmal nach seiner DBU- bzw. Pass-Nummer und nimmt einen inzwischen vorhandenen Gast, statt einen zweiten anzulegen.

## 0.13.0 – 12.11.2026

- Neuer Knopf **Turnierbaum** im Turnierkopf, beim Doppel-KO ab der Auslosung und bei Gruppen mit KO-Runde ab dem Start der KO-Runde: Er öffnet den Turnierbaum als Fenster, so wie ihn der Fernseher zeigt, nur hell. Sieger fett, Ausgeschiedene grau, laufende Spiele gelb mit Tisch und Stand. Nur zum Ansehen; die TV-Anzeige bleibt, wie sie ist.

## 0.12.0 – 12.11.2026

- Teamvergleich und Liga-Spieltag haben jetzt denselben festen Kopf wie das Turnier: Name, Stand und Knöpfe, Infozeile und **TV zeigt** bleiben beim Scrollen oben stehen, **Live an/aus**, Chat-Schalter und **Öffentlicher Link…** stehen rechts daneben.
- Liga-Spieltag: Die Knöpfe stehen als Reihe neben dem Titel, die Lösch-Knöpfe abgesetzt am Ende. Die TV-Auswahl heißt **TV zeigt:** mit **Live-Tische** und **Spieltag-Ergebnis**. Auch der Umschalter der Begegnungen bleibt oben stehen.
- Stand im Kopf: „läuft“ ist im Teamvergleich grün wie im Turnier; nach dem Abschließen steht grün „Teamvergleich abgeschlossen.“ bzw. „Begegnung abgeschlossen.“ statt „beendet“.

## 0.11.3 – 12.11.2026

- Turnierkopf: mehr Abstand zwischen der Zeile „1 von 36 Partien …“ und **TV zeigt**.

## 0.11.2 – 12.11.2026

- Turnierkopf: **Live an/aus**, der Chat-Schalter und **Öffentlicher Link…** stehen jetzt rechts im festen Kopf. Der Block darunter entfällt, wenn er sonst nichts enthält, Teilnehmer und Spielplan rücken nach oben.

## 0.11.1 – 12.11.2026

- Turnierkopf: Worauf die Zeitschätzung beruht („36 Partien, 3 Tische, 35 Min. je Partie bei Race to 3“), steht jetzt als Tooltip auf der Schätzung statt als eigene Zeile im Block darunter.

## 0.11.0 – 12.11.2026

- Ein pausiertes Turnier zeigt hinter dem Stand „läuft“ den Zusatz „(pausiert)“, im Turnierkopf und in der Turnierliste.

## 0.10.1 – 12.11.2026

- Turnierkopf: Der Fortschrittsbalken ist nur noch so breit wie die Zeile „10 von 12 Partien …“ darunter, und beide stehen dichter zusammen.

## 0.10.0 – 12.11.2026

- Turnierkopf: Die Zeile mit Datum, Spielweise und Zeitangabe, der Fortschritt und **TV zeigt** gehören jetzt zum festen Kopf und bleiben beim Scrollen oben. Spielweise und Zeitangabe stehen nebeneinander in einer Zeile.
- Nach dem Abschließen steht neben dem Namen grün „Turnier abgeschlossen.“ statt der Marke „beendet“ und einer zweiten Meldung.
- **Auslosung teilen** ist nur noch zu sehen, solange nach der Auslosung kein Spiel begonnen hat.

## 0.9.0 – 11.11.2026

- Liga-Aufstellung: Die Auswahl der eigenen Seite trennt den Kader in **Stammspieler** und **Ersatz**, darunter wie bisher die weiteren Mitglieder.
- Über jeder Runde steht, solange sie noch nicht voll aufgestellt ist, wie viele Stammspieler schon spielen („Hinrunde: 1 von mindestens 2 Stammspielern …“). Reichen die freien Plätze nicht mehr, heißt es „bitte umstellen“. Pflicht sind 2 je Runde (BLVN-STO Pool 2.5.4).

## 0.8.1 – 11.11.2026

- Spieltag anlegen mit **Aus Pass…**: Der Knopf im Pass-Kasten heißt jetzt **Gegner eintragen** und ist grün, denn er ist der nächste Schritt. Solange der Kasten offen ist, ist **Anlegen** nicht grün. Der Hinweis sagt deutlicher, dass die Spieler erst mit **Anlegen** oben im Formular zu Gästen werden.

## 0.8.0 – 11.11.2026

- Liga-Spieltag anlegen: **Aus Pass…** neben dem Feld Gegner liest den PDF-Mannschaftspass des gegnerischen Vereins. Vorgeschlagen wird die Mannschaft aus derselben Liga und Staffel wie die eigene; Übernehmen trägt den Gegner ein (Verein und Nummer im Pass), beim Anlegen werden die angehakten Spieler Gäste. Vorhandene Gäste werden an DBU- bzw. Pass-Nummer oder Namen erkannt und nicht doppelt angelegt.
- Dasselbe im Spieltag unter **Gegnerische Spieler**, für schon angelegte Spieltage.
- Die Gegnerseite der Aufstellung bietet nur noch die Gäste dieses Gegners an (und wer dort schon steht); **Alle Gäste des Vereins anbieten** zeigt wieder alle. Ältere Spieltage bleiben wie bisher.
- Neue Gäste erscheinen auf TV, Live und an den Tablets als „Vorname N.“ statt „Name (Gegner)“.

## 0.7.0 – 11.11.2026

- Serienwertung (PDF): Passen die Turniere nicht mehr hochkant auf die Seite, kommt die Rangliste im Querformat. Reicht auch das nicht (etwa eine wöchentliche Serie über ein Jahr), werden die Turniere auf mehrere gleich große Tabellen verteilt („Turniere 1 bis 20“, „Turniere 21 bis 40“), jeweils mit Platz, Spieler und Punkten vorn.

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
