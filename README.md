# CueDesk

Web-Anwendung für den Spielbetrieb von Billardvereinen: Mitglieder, Turniere,
Liga-Spieltage, Serienwertung, Vereins-Rating, Statistik, Live-Anzeige und die
Scoreboards an den Tischen. Mandantenfähig: mehrere Vereine in einer Anwendung,
getrennt über `verein_id`.

- **Produktion:** https://app.cuedesk.de
- **Testfassung:** https://daucoder2001.github.io/cuedesk/ (Test-Datenbank, orangefarbener Hinweis „Testumgebung“)

## Technik

TypeScript, React und Vite im Browser; Supabase (PostgreSQL, Auth, Realtime,
Edge Functions) als Backend. Ausgeliefert als statische Seite über GitHub Pages.

## Ordner

| Ordner / Datei | Inhalt |
|---|---|
| `src/` | Die Anwendung. Rechenregeln in eigenen Dateien (`turnier.ts`, `liga.ts`, `rating.ts` …), Seiten in `src/seiten/` |
| `scoreboards/` | Pool- und 14.1-Scoreboard für die Tablets sowie die TV-Ansichten. Erprobter HTML/JS-Code; Datenbankzugriff nur über `scoreboards/js/anbindung.ts` |
| `supabase/migrations/` | Datenbank-Änderungen, eine Datei je Migration |
| `test/` | Tests (Vitest), nur mit erfundenen Daten |
| `hilfe/` | Hilfetexte, die in der Anwendung angezeigt werden |
| `docs/` | Konzept, Einrichtung der Produktion, Checkliste vor dem Livegang, Rechtstexte |
| `skripte/` | Hilfsskripte, z. B. Bau der Offline-Scoreboards, Readme-Vorlage für `cuedesk-app` |
| `CLAUDE.md` | Arbeitsregeln für die Entwicklung mit Claude Code |

## Umgebungen

| | Test | Produktion |
|---|---|---|
| Adresse | daucoder2001.github.io/cuedesk | app.cuedesk.de |
| Datenbank | Supabase-Projekt „Test“ | Supabase-Projekt „cuedesk-produktion“ |
| Aktualisierung | automatisch bei jedem Push auf `main` | nur auf Knopfdruck (Workflow „Produktion“) |

Neue Migrationen kommen immer zuerst in die Test-Datenbank und erst mit dem
Workflow „Produktion“ in die Produktion.

## Workflows (GitHub Actions)

| Workflow | Wann | Was |
|---|---|---|
| Auto Push Testfassung | bei jedem Push auf `main` | baut die Testfassung und veröffentlicht sie |
| Produktion | von Hand, Modus `probelauf` oder `veroeffentlichen` | Probelauf zeigt ausstehende Migrationen; Veröffentlichen spielt sie ein und legt die App in `cuedesk-app` |
| Scoreboards offline | bei Änderungen in `scoreboards/` | baut die Offline-Boards und legt sie in `DauCoder2001/scoreboards` |
| Sicherung | montags 03:23 Uhr (UTC) | verschlüsselter Auszug beider Datenbanken in die privaten Repos `cuedesk-sicherung` und `cuedesk-sicherung-produktion` |
| Datenbank wachhalten | alle drei Tage | verhindert, dass Supabase (Gratisstufe) die Datenbanken pausiert |

## Lokal arbeiten

    npm ci
    npm run dev        # Entwicklungsserver
    npm run pruefen    # Typprüfung
    npm test           # Tests
    npm run build      # Produktionsbau nach dist/
    npm run offline    # Offline-Scoreboards nach offline/

## Verwandte Repositorien

- `cuedesk-app`: gebaute App für app.cuedesk.de (nicht von Hand ändern)
- `scoreboards`: Offline-Scoreboards (nicht von Hand ändern)
- `cuedesk-sicherung`, `cuedesk-sicherung-produktion`: verschlüsselte Datenbank-Sicherungen (privat)

## Datenschutz

Keine echten Mitglieder- oder Exportdaten in dieses Repository. Tests und
Beispiele arbeiten nur mit erfundenen Daten.
