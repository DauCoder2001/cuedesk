# Pool-Club — Konzept

Stand: 19.09.2026, Entwurf 1. Ergebnis der Diskussion zur Zusammenführung von
"Turnier light" (vier HTML-Dateien) und "Pool-TS" (Firebase, Tablets, TV).

## 1. Ziel

Ein Programm für den ganzen Spielbetrieb des Vereins: Mitglieder,
Turniere, Einzelspiele, Live-Anzeige, Serienwertung, Vereins-Rating und
Statistik. Alle Daten liegen in **einer** Datenbank. Export und Import
zwischen Programmteilen entfallen.

## 2. Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Datenhaltung | Cloud, Supabase (PostgreSQL), EU-Region Frankfurt |
| Kosten | Supabase-Gratisstufe, Online-Halten per Zeitplan-Skript |
| Offline-Betrieb | entfällt; im Vereinsheim mobiler WLAN-Router |
| Raspberry Pi | wird abgelöst, Hosting im Netz |
| Geräte | Notebook (Turnierleitung), Tablets an den Tischen, TV, Mitglieder zu Hause |
| Pool-TS | ist Entwicklungsstand, keine Rücksicht auf laufenden Betrieb; Scoreboards dienen als Vorlage |
| Rating | Vereins-Rating aus Turnier light (Fargo-Skala), unverändert im Verfahren |
| Einzelspiele im Rating | **werden nie gewertet**, kein Schalter |
| 14.1 | vor allem als Einzelspiel; vollständiges Aufnahme-Protokoll wird gespeichert und ausgewertet |
| Name / Ordner | Pool-Club, `C:\Users\Haas\Documents\Claude Projekte\Pool-Club` |

## 3. Architektur

```
 Browser (Notebook, Tablet, TV, Handy)
   |  statische Web-App (GitHub Pages)
   v
 Supabase
   - Auth          Anmeldung Mitglieder (E-Mail-Link), Geräte-Konten
   - PostgreSQL    alle Daten, Rechte per Row Level Security
   - Realtime      Live-Stände an Tischen -> Turnierleitung, TV, Zuschauer
   - Edge Function Rating-Berechnung (JS-Code aus der Serienwertung)
 GitHub Actions
   - alle 3 Tage   Online-Halten (echte Abfrage)
   - wöchentlich   Datenbank-Sicherung in privates Repository
```

Zwei Supabase-Projekte: **Produktion** und **Test**. Entwicklung und
Vorschau laufen immer gegen Test. (In Pool-TS schrieb die Vorschau auf die
echten Daten; das soll sich nicht wiederholen.)

Oberfläche: React mit Vite (bekannt aus Billard-Training). Die Turnierlogik
(Spielplan, Gruppen, KO, Nachtragen, Rangfolge, Vorgabe, Rating) wird als
reine JavaScript-Module ohne Oberfläche aus den Turnier-light-Dateien
herausgelöst und mit Tests abgesichert. Diese Module laufen im Browser und in
der Edge Function gleich.

Hinweis GitHub Pages: Kostenlos nur für öffentliche Repositories. Das ist
unkritisch, weil der öffentliche Supabase-Schlüssel ohnehin im Browser landet;
geschützt wird über die Rechte in der Datenbank. Geheime Schlüssel
(Datenbankpasswort für die Sicherung) liegen nur in den GitHub-Secrets.

## 4. Rollen

| Rolle | Rechte |
|---|---|
| Administrator | Benutzer, Rollen, Geräte, Einstellungen, endgültiges Löschen |
| Sportwart | Personen pflegen, Serien, Rating-Einstellungen und Startwerte |
| Turnierleiter | Turniere anlegen, auslosen, nachtragen, Runden abschließen, Ergebnisse korrigieren |
| Tisch (Gerät) | Spiele am zugeordneten Tisch führen, Einzelspiele starten |
| Mitglied | eigene Statistik, Ranglisten, Direktvergleich, Turnieranmeldung |
| Öffentlich | Live-Tische, laufende Turniertabelle, TV-Ansicht (ohne Anmeldung) |

- Eine Person kann mehrere Rollen haben.
- Tablets werden vom Administrator einmalig per QR-Code einem Tisch zugeordnet.
  Am Tisch meldet sich niemand persönlich an.
- Jede Änderung an Ergebnissen landet im **Änderungsprotokoll** (wer, wann,
  vorher, nachher). Das ersetzt das Schutzpasswort `8-Ball`.

## 5. Datenmodell (Entwurf)

Tabellennamen deutsch, ohne Umlaute.

**Stammdaten**

| Tabelle | Wichtige Felder |
|---|---|
| `personen` | id, vorname, nachname, anzeigename, kuerzel, status (mitglied, gast, ausgetreten), eintritt, austritt, name_oeffentlich, minderjaehrig, rating_startwert, foto |
| `benutzer` | auth-id, person_id (optional), aktiv |
| `benutzer_rollen` | benutzer_id, rolle |
| `tische` | id, nummer, bezeichnung, aktiv |
| `geraete` | id, name, tisch_id, auth-id, zuletzt_gesehen |

**Spielbetrieb**

| Tabelle | Wichtige Felder |
|---|---|
| `turnierarten` | name, zaehlt_fuer_serie |
| `serien` | name, saison, disziplin, punkteformel, streichergebnisse |
| `turniere` | name, datum, modus, disziplin, serie_id, status, einstellungen (Race to je Phase, Gruppen, Qualifikanten), rating_werten, eingefroren_am |
| `turnier_teilnehmer` | turnier_id, person_id, startnummer, gruppe, gesetzt, rating_eingefroren, vorgabe_basis, endplatz |
| `partien` | id, turnier_id (leer bei Einzelspiel), disziplin, phase, gruppe, runde, paarung, tisch_id, spieler_a, spieler_b, race_to, vorgabe_a, vorgabe_b, ergebnis_a, ergebnis_b, status, begonnen, beendet, rating_ausgenommen |
| `live_stand` | tisch_id, partie_id, zustand (JSON, wie heute `tables/<id>`) |

Wichtige Änderung gegenüber Turnier light: Jede Partie hat eine eigene ID und
die Felder phase, gruppe, runde und paarung. Die positionsbasierten Schlüssel
in `scores` und `lockedRounds` entfallen. Damit ist auch der Blocker für die
Aufteilung in Tisch-Wellen gelöst (offener Punkt Stufe 2 aus Turnier light).

**14.1**

| Tabelle | Wichtige Felder |
|---|---|
| `partien_141` | partie_id, ziel_punkte, ziel_aufnahmen, anstoss_spieler, dauer_sek |
| `aufnahmen_141` | partie_id, lfd_nr, spieler, baelle, punkte, gesamt, art (serie, sicherheit, foul, foul3, eroeffnungsfoul, ende), markierung (/, //, 3F), punkte_je_rack, rack_nr, zeitpunkt |

Das entspricht dem heutigen `state.log` des Scoreboards, ergänzt um einen
Zeitstempel je Aufnahme. **Heute geht das Protokoll verloren**: Pool-TS
speichert in `results` nur die Summen (Punkte, HS, Aufnahmen), das Protokoll
wird lediglich gedruckt oder gesendet.

**Rating**

| Tabelle | Wichtige Felder |
|---|---|
| `rating_einstellungen` | zeitraum, mindest_racks, rueckgriff, gewicht, staerke, vereinsschnitt |
| `rating_stand` | stichtag, disziplin, person_id, wert, racks, kennzeichnung |

`rating_stand` speichert nach jedem abgeschlossenen Turnier eine
Momentaufnahme aller Spieler. Nur so lässt sich ein Verlauf zeigen, denn die
gemeinsame Berechnung verschiebt auch rückwirkend Werte (siehe Rating-Doku,
Häufige Fragen).

**Protokoll**

| Tabelle | Wichtige Felder |
|---|---|
| `aenderungen` | zeitpunkt, benutzer_id, tabelle, datensatz_id, vorher, nachher |

## 6. Vereins-Rating im neuen Programm

Verfahren unverändert nach `vereins_rating_erklaert_v02.docx`: 100 Punkte =
doppelte Rack-Zahl, gemeinsame Berechnung, 30 gedachte Racks, 12 Monate mit
Verlängerung bis 36 Monate, Disziplinen getrennt mit Ersatzwerten,
Vorgabe mit 75 % Ausgleich.

Was sich ändert:

- Berechnet wird serverseitig nach jedem abgeschlossenen Turnier und
  zusätzlich nachts.
- "Rating-Stand laden" entfällt. Beim Turnierstart werden die aktuellen Werte
  in `turnier_teilnehmer` eingefroren.
- Kennzeichnung "nicht gefunden" entfällt.
- Gewertet werden ausschließlich Turnierpartien. Einzelspiele nie.
- Abnahmekriterium: Mit den übernommenen Altdaten muss das neue Programm auf
  den Punkt dieselben Werte liefern wie Serienwertung v15.

## 7. Statistik

**Pool (aus Turnierpartien)**

- Rating-Verlauf je Disziplin, Kennzeichnung (eigene Daten, vorläufig usw.)
- Bilanz Spiele und Racks, Siegquote je Disziplin
- Form der letzten 10 Partien
- Direktvergleich zweier Spieler
- Turnierteilnahmen, Platzierungen, Serienpunkte, Titel
- Ergebnis gegen Erwartung: hat der Spieler mehr oder weniger Racks geholt,
  als das Rating vorhersagt

**14.1 (aus dem Aufnahme-Protokoll)**

| Kennzahl | Herleitung |
|---|---|
| GD (Generaldurchschnitt) | Punkte / Aufnahmen |
| HS (Höchstserie) | größte Aufnahme |
| Durchschnittliche Serie | Mittel der Aufnahmen mit Punkten |
| Serienverteilung | Anzahl Serien 0, 1-4, 5-9, 10-14, 15-29, 30+ |
| Nullaufnahmen | Anteil Aufnahmen ohne Punkt |
| Sicherheitsquote | Anteil Aufnahmen mit Art "Sicherheit" |
| Verschossen-Quote | Anteil Aufnahmen mit Art "serie" (im Protokoll "V") |
| Fouls | Fouls je 10 Aufnahmen, 2. Fouls, Drei-Foul-Strafen, Eröffnungsfouls |
| Rack-Übergänge | Serien über ein Rack hinaus (mehr als ein Eintrag in punkte_je_rack) |
| Tempo | Minuten je Aufnahme (neu, braucht Zeitstempel) |
| Bilanz | Siege, Niederlagen, Unentschieden (Aufnahmen-Limit), Direktvergleich |
| Entwicklung | GD, HS und Foulquote als Verlauf (gleitend über die letzten n Partien) |

Mitglieder sehen ihre eigene Entwicklung. Vergleiche mit anderen nur in
dem Umfang, den die Rechte erlauben (siehe 9.).

## 8. Bildschirme

| Bereich | Bildschirme |
|---|---|
| Öffentlich | Startseite, Live-Tische, laufendes Turnier, TV-Ansicht |
| Tisch (Tablet) | Tisch-Startseite, Pool-Scoreboard, 14.1-Scoreboard, Einzelspiel starten (Spieler aus Mitgliederliste wählen) |
| Turnierleitung | Turnierübersicht, Turnier anlegen, Teilnehmer und Auslosung, Spielplan mit Tischzuteilung, Live-Übersicht, Abschluss mit PDF-Bericht |
| Mitglied | Mein Profil, meine Statistik Pool, meine Statistik 14.1, Ranglisten, Direktvergleich |
| Sportwart | Personen, Serien, Rating-Liste mit Lupe, Startwerte, Rating-Einstellungen |
| Administrator | Benutzer und Rollen, Geräte und Tische, Änderungsprotokoll, Datensicherung |

## 9. Datenschutz

Aus den Notizen "Rechtliche Aspekte der Benutzerverwaltung", auf Supabase
übertragen:

- Verantwortlicher ist der Verein, das Supabase-Konto läuft auf den Verein.
- Auftragsverarbeitungsvertrag (DPA) mit Supabase abschließen, Region EU.
- Datenschutzerklärung und Impressum sind Pflicht, sobald die Seite
  öffentlich erreichbar ist.
- Stammdaten schlank halten: keine Adresse, kein Geburtsdatum, keine
  Bankdaten. Nur ein Merker `minderjaehrig`.
- `name_oeffentlich`: ohne Einwilligung erscheint in öffentlichen Ansichten
  nur das Kürzel.
- Minderjährige: Online-Konto nur mit Einwilligung der Erziehungsberechtigten.
- Löschkonzept: Wird eine Person gelöscht, werden ihre Stammdaten entfernt,
  ihre Partien bleiben mit einem anonymen Platzhalter erhalten, damit Rating
  und Tabellen der Gegner stimmen.
- Aufbewahrungsfrist für Ergebnisse festlegen und dokumentieren.

Rechtlich gegenlesen lassen, bevor die Seite öffentlich geht.

## 10. Ausbaustufen

| Stufe | Inhalt | Nutzen danach |
|---|---|---|
| 1 Fundament | Supabase Produktion und Test, Hosting, Anmeldung, Rollen, Personen, Tische, Geräte-Kopplung, Online-Halten und Sicherung | Mitgliederverwaltung läuft |
| 2 Altdaten und Rating | Import `serienwertung_daten.json` (Aliase werden zu Personen), Rating-Berechnung portiert, Rating-Liste mit Lupe, Abgleich mit v15 | Rating online, identisch mit bisher |
| 3 14.1-Einzelspiel | Scoreboard aus Pool-TS angebunden, Protokoll in `aufnahmen_141`, Statistik 14.1 | Spieler verfolgen ihre 14.1-Entwicklung |
| 4 Pool-Einzelspiel und Live | Pool-Scoreboard, Live-Tische, TV | Tablets und TV im Einsatz |
| 5 Turnier Einzelgruppe | Berger-Kreis, Vorgabe, Ergebnisse vom Tablet, Live-Tabelle, PDF-Bericht | erstes Turnier komplett im neuen Programm |
| 6 Weitere Modi | Zwei Gruppen, Gruppen mit KO, Phase 3, Spieler nachtragen | Turnier light wird abgelöst |
| 7 Serien und Statistik Pool | Serienwertung, Streichergebnisse, Statistik Pool, Ranglisten | Serienwertung wird abgelöst |
| 8 Erweiterungen | Turnieranmeldung, automatische Tischzuteilung, Doppel-KO | — |

Bis Stufe 6 bleiben die Turnier-light-Dateien im Einsatz.

## 11. Offene Fragen

1. **Pool-Scoreboard-Protokoll:** Soll auch Pool je Rack protokolliert werden
   (wer hat angestoßen, wer gewinnt das Rack, Break and Run, Golden Break)?
   Das ergäbe Statistiken wie Anstoß-Gewinnquote, kostet am Tisch aber einen
   Tipp mehr je Rack.
2. **Pool-TS-Altdaten:** Sollen die Ergebnisse aus Firebase (`results`,
   `tournament_archive`) übernommen werden, oder sind das Testdaten?
3. **Gäste:** Bekommen Gäste ein Rating und erscheinen in Ranglisten, oder
   nur in den Tabellen des jeweiligen Turniers?
4. **Sichtbarkeit unter Mitgliedern:** Darf jedes Mitglied die Statistik
   jedes anderen sehen, oder nur die eigene plus Ranglisten?
5. **Vereinslogos:** Ein Verein oder mehrere (Bassum, Verden)? Falls
   mehrere: gemeinsame Datenbank mit Vereinszuordnung oder getrennte Projekte?
6. **TypeScript:** Die Oberfläche in JavaScript wie bisher, oder in
   TypeScript (weniger Fehler bei einem großen Datenmodell, dafür neue Syntax)?
