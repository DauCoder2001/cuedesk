# Billard-Scoreboards (Standalone)

Offline-Scoreboards für Pool (8/9/10-Ball) und 14.1 endlos — je Board eine
einzige HTML-Datei, kein Server, keine Installation. Der Spielstand wird lokal
im Browser (localStorage) gespeichert.

**Nicht hier ändern:** Die Dateien werden automatisch aus CueDesk erzeugt
(`npm run offline`, Workflow „Scoreboards offline“). Änderungen an den
Scoreboards gehören in den Ordner `scoreboards/` von CueDesk.

## Nutzung
`index.html` öffnen (bzw. die GitHub-Pages-Adresse aufrufen) und ein Scoreboard wählen:

- **8/9/10-Ball** → `index_pool.html`
- **14.1 endlos** → `index141.html`

Über das Haus-Symbol oben links geht es zurück zur Startseite.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html`      | Startseite (Spielart-Auswahl) |
| `index_pool.html` | 8/9/10-Ball-Scoreboard |
| `index141.html`   | 14.1-endlos-Scoreboard |
| `14.1_Log.html`   | Aufnahme-Protokoll zum 14.1-Scoreboard |
| `manifest.json`   | Web-App-Manifest (Vollbild ohne Adressleiste auf dem Tablet) |
| `LICENSE`         | MIT-Lizenz |

## Lizenz
MIT — siehe [`LICENSE`](LICENSE). © 2026 Matthias Haas.
