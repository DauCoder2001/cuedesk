# CueDesk — Konzept

Stand: 19.09.2026, Entwurf 3. Ergebnis der Diskussion zur Zusammenführung von
"Turnier light" (vier HTML-Dateien) und "Pool-TS" (Firebase, Tablets, TV).

## 1. Ziel

Ein Programm für den ganzen Spielbetrieb eines oder mehrerer Vereine:
Mitglieder, Turniere, Einzelspiele, Live-Anzeige, Serienwertung,
Vereins-Rating und Statistik. Alle Daten liegen in **einer** Datenbank.
Export und Import zwischen Programmteilen entfallen.

## 2. Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Datenhaltung | Cloud, Supabase (PostgreSQL), EU-Region Frankfurt |
| Kosten | Supabase-Gratisstufe, Online-Halten per Zeitplan-Skript |
| Betreiber | Stufe 1: Matthias. Später können Vereine eine eigene Supabase-Datenbank betreiben |
| Mandanten | mehrere Vereine in einer Datenbank, strikt getrennt (`verein_id`) |
| Erster Mandant | Verden; ein weiterer Verein ist vorerst nicht geplant, das Programm ist aber darauf vorbereitet |
| Vereinsübergreifende Turniere | zu Beginn als normales Turnier mit Gästen; eigene Logik erst in Stufe 8 |
| Adresse | zunächst GitHub Pages, Umzug auf eine eigene Domain später |
| Offline-Betrieb | entfällt; im Vereinsheim mobiler WLAN-Router |
| Raspberry Pi | wird abgelöst, Hosting im Netz |
| Geräte | Notebook (Turnierleitung), Tablets an den Tischen, TV, Mitglieder zu Hause |
| Pool-TS | ist Entwicklungsstand; Scoreboards dienen als Vorlage; Firebase-Daten sind Testdaten und werden **nicht** übernommen |
| Programmiersprache | TypeScript, Oberfläche mit React und Vite |
| Rating | Vereins-Rating aus Turnier light (Fargo-Skala), unverändert im Verfahren, je Verein getrennt |
| Einzelspiele im Rating | **werden nie gewertet**, kein Schalter |
| Gäste | kein Rating, in keiner Rangliste; Vorgabe mit 500, im Turnier änderbar; Partien mit Gastbeteiligung werden nicht gewertet, Ausnahme: Liga-Spieltage (dort zählen sie, damit die Stärke des Gegners eingeht) |
| 14.1 im Rating | zählt nie; das Rating rechnet in Racks, 14.1 in Punkten |
| Pool-Protokoll | **kein** Protokoll je Rack; Pool-Statistik nur aus Partieergebnissen |
| 14.1 | vor allem als Einzelspiel; vollständiges Aufnahme-Protokoll wird gespeichert und ausgewertet |
| Sichtbarkeit Statistik | jedes Mitglied sieht nur die **eigene** Statistik, dazu die Ranglisten |
| Name / Ordner | CueDesk, `C:\Users\Haas\Documents\Claude Projekte\CueDesk` |

## 3. Architektur

```
 Browser (Notebook, Tablet, TV, Handy)
   |  statische Web-App (GitHub Pages)
   v
 Supabase
   - Auth          Anmeldung Mitglieder (E-Mail-Link), Geräte-Konten
   - PostgreSQL    alle Daten, Rechte per Row Level Security
   - Realtime      Live-Stände an Tischen -> Turnierleitung, TV, Zuschauer
   - Edge Function Rating-Berechnung (Code aus der Serienwertung)
 GitHub Actions
   - alle 3 Tage   Online-Halten (echte Abfrage)
   - wöchentlich   Datenbank-Sicherung in privates Repository
```

Zwei Supabase-Projekte: **Produktion** und **Test**. Entwicklung und
Vorschau laufen immer gegen Test. (In Pool-TS schrieb die Vorschau auf die
echten Daten; das soll sich nicht wiederholen.)

Oberfläche in TypeScript mit React und Vite. Die Datenbanktypen werden aus
dem Schema erzeugt (`supabase gen types`), damit Tabellen und Programm nicht
auseinanderlaufen. Die Turnierlogik (Spielplan, Gruppen, KO, Nachtragen,
Rangfolge, Vorgabe, Rating) wird als reine TypeScript-Module ohne Oberfläche
aus den Turnier-light-Dateien übertragen und mit Tests abgesichert. Diese
Module laufen im Browser und in der Edge Function gleich.

**Vorbereitet auf eigene Datenbanken der Vereine:**

- Das Datenbankschema liegt vollständig als Migrationsdateien im Repository.
  Eine neue Supabase-Datenbank lässt sich damit in wenigen Schritten
  einrichten.
- Adresse und öffentlicher Schlüssel der Datenbank sind Einstellungen der
  Veröffentlichung, nicht fest im Code. Dieselbe Web-App kann gegen die
  gemeinsame oder gegen eine vereinseigene Datenbank laufen.
- Eine vereinseigene Datenbank enthält einfach nur einen Verein. Das Programm
  unterscheidet die beiden Fälle nicht.

**Vorbereitet auf den späteren Umzug der Adresse:** Der Basispfad der
Web-App ist eine Einstellung. Beim Umzug auf eine eigene Domain ändern sich
nur diese Einstellung und die erlaubten Rücksprung-Adressen der Anmeldung in
Supabase (E-Mail-Links zeigen auf die Web-App). Die alte GitHub-Adresse kann
danach auf die neue weiterleiten.

Hinweis GitHub Pages: Kostenlos nur für öffentliche Repositories. Das ist
unkritisch, weil der öffentliche Supabase-Schlüssel ohnehin im Browser landet;
geschützt wird über die Rechte in der Datenbank. Geheime Schlüssel
(Datenbankpasswort für die Sicherung) liegen nur in den GitHub-Secrets.

## 4. Mandanten (Vereine)

- Jede Tabelle mit Vereinsdaten hat eine Spalte `verein_id`. Die Rechte in
  der Datenbank (Row Level Security) lassen nur Zugriff auf Vereine zu, in
  denen der Benutzer eine Rolle hat.
- Personen, Turniere, Partien, Serien, Rating, Tische und Geräte gehören
  immer genau einem Verein.
- Das Rating wird je Verein getrennt berechnet. Die Werte zweier Vereine sind
  nicht vergleichbar (beide Skalen haben ihren Schnitt bei 500).
- Wer in zwei Vereinen spielt, hat dort zwei getrennte Personeneinträge, aber
  nur ein Konto mit Zugang zu beiden Vereinen.
- Je Verein: Name, Logo, Farben und eine eigene Adresse
  (z.B. `…/bassum`, `…/verden`).

**Vereinsübergreifende Turniere** (spätere Ausbaustufe):

- Ein Turnier hat einen **ausrichtenden Verein**. Spieler anderer Vereine
  nehmen dort als Gäste teil: kein Rating, keine Wertung, Vorgabe 500 und
  änderbar.
- Weil beide Vereine in derselben Datenbank liegen, kann das Programm beim
  Gastspieler dessen Wert im Heimatverein als **Hinweis** anzeigen, damit der
  Turnierleiter die Vorgabe sinnvoll setzen kann. Übernommen wird der Wert
  nicht automatisch.
- **Einschränkung:** Das funktioniert nur zwischen Vereinen in derselben
  Datenbank. Betreibt ein Verein später eine eigene Datenbank, kann er an
  vereinsübergreifenden Turnieren der gemeinsamen Datenbank nur noch mit
  Gastspielern ohne Verknüpfung teilnehmen (Namen von Hand).

## 5. Rollen

| Rolle | Gilt für | Rechte |
|---|---|---|
| Systemadministrator | alle Vereine | Vereine anlegen, ersten Vereins-Administrator einsetzen |
| Vereins-Administrator | einen Verein | Benutzer, Rollen, Geräte, Einstellungen, endgültiges Löschen |
| Sportwart | einen Verein | Personen pflegen, Serien, Rating-Einstellungen und Startwerte |
| Turnierleiter | einen Verein | Turniere anlegen, auslosen, nachtragen, Runden abschließen, Ergebnisse korrigieren, Vorgaben ändern |
| Tisch (Gerät) | einen Tisch | Spiele am zugeordneten Tisch führen, Einzelspiele starten |
| Mitglied | einen Verein | eigene Statistik, Ranglisten, Turnieranmeldung |
| Öffentlich | — | Live-Tische, laufende Turniertabelle, TV-Ansicht (ohne Anmeldung) |

- Eine Person kann mehrere Rollen haben, auch in verschiedenen Vereinen.
- Tablets werden vom Vereins-Administrator einmalig per QR-Code einem Tisch
  zugeordnet. Am Tisch meldet sich niemand persönlich an.
- Jede Änderung an Ergebnissen landet im **Änderungsprotokoll** (wer, wann,
  vorher, nachher). Das ersetzt das Schutzpasswort `8-Ball`.

## 6. Datenmodell (Entwurf)

Tabellennamen deutsch, ohne Umlaute. Alle Tabellen außer `vereine` und
`benutzer` tragen `verein_id`.

**Mandanten und Zugang**

| Tabelle | Wichtige Felder |
|---|---|
| `vereine` | id, name, kurzname, adresse_kurz (für die URL), logo, farben, aktiv |
| `benutzer` | auth-id, systemadmin, aktiv |
| `benutzer_rollen` | benutzer_id, verein_id, rolle |
| `benutzer_personen` | benutzer_id, person_id (Verknüpfung Konto zu Personeneintrag je Verein) |

**Stammdaten**

| Tabelle | Wichtige Felder |
|---|---|
| `personen` | id, verein_id, vorname, nachname, anzeigename, kuerzel, status (mitglied, gast, ausgetreten), eintritt, austritt, name_oeffentlich, minderjaehrig, rating_startwert, foto |
| `tische` | id, verein_id, nummer, bezeichnung, aktiv |
| `geraete` | id, verein_id, name, tisch_id, auth-id, zuletzt_gesehen |

**Spielbetrieb**

| Tabelle | Wichtige Felder |
|---|---|
| `turnierarten` | name, zaehlt_fuer_serie |
| `serien` | name, saison, disziplin, punkteformel, streichergebnisse |
| `turniere` | name, datum, modus, disziplin, serie_id, status, einstellungen (Race to je Phase, Gruppen, Qualifikanten), rating_werten, eingefroren_am |
| `turnier_teilnehmer` | turnier_id, person_id, gast, startnummer, gruppe, gesetzt, rating_eingefroren, rating_quelle (eigene Daten, vorläufig, ..., von Hand, Gast), endplatz |
| `partien` | id, turnier_id (leer bei Einzelspiel), disziplin, phase, gruppe, runde, paarung, tisch_id, spieler_a, spieler_b, race_to, vorgabe_a, vorgabe_b, ergebnis_a, ergebnis_b, status, begonnen, beendet, rating_ausgenommen |
| `live_stand` | tisch_id, partie_id, zustand (JSON, wie heute `tables/<id>`) |

Gäste sind Personen mit Status `gast` im ausrichtenden Verein. Beim
vereinsübergreifenden Turnier zeigt ein optionales Feld auf den
Personeneintrag im Heimatverein (nur für den Rating-Hinweis).

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
| `aenderungen` | zeitpunkt, benutzer_id, verein_id, tabelle, datensatz_id, vorher, nachher |

## 7. Vereins-Rating im neuen Programm

Verfahren unverändert nach `vereins_rating_erklaert_v02.docx`: 100 Punkte =
doppelte Rack-Zahl, gemeinsame Berechnung, 30 gedachte Racks, 12 Monate mit
Verlängerung bis 36 Monate, Disziplinen getrennt mit Ersatzwerten,
Vorgabe mit 75 % Ausgleich.

Was sich ändert:

- Berechnet wird serverseitig je Verein, nach jedem abgeschlossenen Turnier
  und zusätzlich nachts.
- "Rating-Stand laden" entfällt. Beim Turnierstart werden die aktuellen Werte
  in `turnier_teilnehmer` eingefroren.
- Kennzeichnung "nicht gefunden" entfällt, neu ist die Kennzeichnung "Gast".
- Gewertet werden ausschließlich Turnierpartien zwischen zwei Mitgliedern.
  Einzelspiele nie, Partien mit Gastbeteiligung nie.
- Gäste starten mit Vorgabe-Basis 500, der Turnierleiter kann den Wert je
  Turnier ändern.
- Abnahmekriterium: Mit den übernommenen Altdaten muss das neue Programm auf
  den Punkt dieselben Werte liefern wie Serienwertung v15.

## 8. Statistik

Jedes Mitglied sieht nur die **eigene** Statistik. Ranglisten (Rating,
Serien) sind für alle Mitglieder des Vereins sichtbar. Sportwart und
Vereins-Administrator sehen alle Statistiken ihres Vereins.

**Pool (aus Turnierpartien und Einzelspielen, nur Ergebnisse)**

- Rating-Verlauf je Disziplin, Kennzeichnung (eigene Daten, vorläufig usw.)
- Bilanz Spiele und Racks, Siegquote je Disziplin
- Form der letzten 10 Partien
- eigene Bilanz gegen einzelne Gegner
- Turnierteilnahmen, Platzierungen, Serienpunkte, Titel
- Ergebnis gegen Erwartung: mehr oder weniger Racks geholt, als das Rating
  vorhersagt

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
| Bilanz | Siege, Niederlagen, Unentschieden (Aufnahmen-Limit), Bilanz gegen einzelne Gegner |
| Entwicklung | GD, HS und Foulquote als Verlauf (gleitend über die letzten n Partien) |

## 9. Bildschirme

| Bereich | Bildschirme |
|---|---|
| Öffentlich | Vereinsauswahl, Startseite des Vereins, Live-Tische, laufendes Turnier, TV-Ansicht |
| Tisch (Tablet) | Tisch-Startseite, Pool-Scoreboard, 14.1-Scoreboard, Einzelspiel starten (Spieler aus Mitgliederliste wählen) |
| Turnierleitung | Turnierübersicht, Turnier anlegen, Teilnehmer und Gäste, Auslosung, Vorgaben, Spielplan mit Tischzuteilung, Live-Übersicht, Abschluss mit PDF-Bericht |
| Mitglied | Mein Profil, meine Statistik Pool, meine Statistik 14.1, Ranglisten, Vereinswechsel (bei mehreren Vereinen) |
| Sportwart | Personen, Serien, Rating-Liste mit Lupe, Startwerte, Rating-Einstellungen |
| Vereins-Administrator | Benutzer und Rollen, Geräte und Tische, Aussehen des Vereins, Änderungsprotokoll |
| Systemadministrator | Vereine, Datensicherung |

## 10. Datenschutz

Aus den Notizen "Rechtliche Aspekte der Benutzerverwaltung", auf Supabase
und mehrere Vereine übertragen:

- Jeder Verein ist Verantwortlicher für seine Daten.
- Betreiber der gemeinsamen Datenbank ist in Stufe 1 Matthias. Er
  verarbeitet Daten im Auftrag der Vereine und braucht mit **jedem** Verein
  einen Auftragsverarbeitungsvertrag. Zusätzlich DPA mit Supabase, Region EU.
- Datenschutzerklärung und Impressum sind Pflicht, sobald die Seite
  öffentlich erreichbar ist.
- Stammdaten schlank halten: keine Adresse, kein Geburtsdatum, keine
  Bankdaten. Nur ein Merker `minderjaehrig`.
- `name_oeffentlich`: ohne Einwilligung erscheint in öffentlichen Ansichten
  nur das Kürzel.
- Vereinsübergreifend sieht der ausrichtende Verein vom Gastspieler nur Name
  und Rating-Hinweis, keine Statistik.
- Minderjährige: Online-Konto nur mit Einwilligung der Erziehungsberechtigten.
- Löschkonzept: Wird eine Person gelöscht, werden ihre Stammdaten entfernt,
  ihre Partien bleiben mit einem anonymen Platzhalter erhalten, damit Rating
  und Tabellen der Gegner stimmen.
- Aufbewahrungsfrist für Ergebnisse festlegen und dokumentieren.

Rechtlich gegenlesen lassen, bevor die Seite öffentlich geht.

## 11. Ausbaustufen

| Stufe | Inhalt | Nutzen danach |
|---|---|---|
| 1 Fundament | Supabase Produktion und Test, Hosting, Vereine, Anmeldung, Rollen, Personen, Tische, Geräte-Kopplung, Online-Halten und Sicherung | Mitgliederverwaltung läuft |
| 2 Altdaten und Rating | Import `serienwertung_daten.json` (Aliase werden zu Personen), Rating-Berechnung portiert, Rating-Liste mit Lupe, Abgleich mit v15 | Rating online, identisch mit bisher |
| 3 14.1-Einzelspiel | Scoreboard aus Pool-TS angebunden, Protokoll in `aufnahmen_141`, Statistik 14.1 | Spieler verfolgen ihre 14.1-Entwicklung |
| 4 Pool-Einzelspiel und Live | Pool-Scoreboard, Live-Tische, TV | Tablets und TV im Einsatz |
| 5 Turnier Einzelgruppe | Berger-Kreis, Gäste, Vorgabe, Ergebnisse vom Tablet, Live-Tabelle, PDF-Bericht | erstes Turnier komplett im neuen Programm |
| 6 Weitere Modi | Zwei Gruppen, Gruppen mit KO, Phase 3, Spieler nachtragen | Turnier light wird abgelöst |
| 7 Serien und Statistik Pool | Serienwertung, Streichergebnisse, Statistik Pool, Ranglisten | Serienwertung wird abgelöst (umgesetzt am 22.09.2026) |
| 8 Vereinsübergreifend | Turniere mit Gastspielern anderer Vereine, Rating-Hinweis | Vereinsturniere Bassum gegen Verden |
| 9 Erweiterungen | Turnieranmeldung, automatische Tischzuteilung, Doppel-KO | — |

Bis Stufe 6 bleiben die Turnier-light-Dateien im Einsatz. Stufe 6 ist seit dem 22.09.2026 umgesetzt (Regeln aus Einzelgruppe v60, Gruppen v64, KO v74, durch Vergleichstests abgesichert); die Ablösung erfolgt nach den Praxistests. Einschränkung: Folgespiele der KO-Runde legt die geöffnete Turnierseite der Turnierleitung an.

## 12. Offene Fragen

Zur Zeit keine. Das Konzept ist die Grundlage für Stufe 1.

## 13. Betrieb

| Ablauf (GitHub Actions) | Zeitpunkt | Braucht |
|---|---|---|
| `veroeffentlichen.yml` | bei jedem Push auf `main` | Repository-Variablen `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` |
| `datenbank-wachhalten.yml` | alle drei Tage | dieselben Variablen |
| `sicherung.yml` | montags nachts | Geheimnisse `SUPABASE_DB_URL`, `SICHERUNG_TOKEN` |

Adressen: Programm `https://daucoder2001.github.io/cuedesk/`, Geraeteansicht
mit dem Zusatz `?geraet`. Die Sicherung liegt im privaten Repository
`cuedesk-sicherung`, je Woche ein Ordner mit Schema, Daten und Konten; die
letzten zwoelf Wochen bleiben erhalten.

Mailversand: ueber das IONOS-Postfach der Domain `cuedesk.de` (SMTP `smtp.ionos.de`,
Port 465). Brevo wird nicht gebraucht. Die Mailvorlagen stehen in
`docs/Mailvorlagen.md`.
