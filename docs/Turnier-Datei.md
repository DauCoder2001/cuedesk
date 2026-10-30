# Turnier-Datei

Austauschformat für einzelne beendete Turniere zwischen CueDesk und TurnierPilot (und zwischen zwei CueDesk-Vereinen). Beide Programme lesen und schreiben es; Code in CueDesk: `src/turnier-datei.ts`, in TurnierPilot: `app/Auswertung.html` (Herunterladen) und `app/Serienwertung.html` (Einlesen).

```json
{
  "format": "billard-turnierdatei",
  "formatVersion": 1,
  "programm": "CueDesk v0302_30-10-2026",
  "erstellt": "2026-10-30T18:00:00.000Z",
  "turniere": [
    {
      "kennung": "cuedesk:<uuid>",
      "name": "Freitagsturnier",
      "datum": "2026-10-24",
      "disziplin": "8-Ball",
      "modus": "einzelgruppe",
      "teilnehmer": ["Anna Probe", "Bernd Beispiel"],
      "ranking": [{ "platz": 1, "name": "Anna Probe" }, { "platz": 2, "name": "Bernd Beispiel" }],
      "partien": [
        { "a": "Anna Probe", "b": "Bernd Beispiel", "satzA": 3, "satzB": 1, "vorgabeA": 0, "vorgabeB": 0,
          "raceTo": 3, "phase": "Gruppe", "werten": true, "grund": null }
      ]
    }
  ]
}
```

## Felder

- **kennung**: Herkunft, `cuedesk:<Turnier-Id>` oder `turnierpilot:<Archiv-Id>`. Wer ein eingelesenes Turnier weitergibt, behält die Kennung. So erkennt jedes Programm ein Turnier wieder, auch nach Hin und Zurück. Altbestand aus Turnier light steht in CueDesk ohne Vorsilbe in `alt_id` und gilt als `turnierpilot:`.
- **disziplin**: Klartext `8-Ball`, `9-Ball`, `10-Ball`, `Multi-Ball`, `14.1`. TurnierPilot kennt 14.1 nicht.
- **modus**: `einzelgruppe`, `zwei-gruppen`, `gruppen-ko`. Andere Modi (Liga, Teamvergleich) werden nicht übertragen.
- **teilnehmer**, **ranking**, **a**, **b**: Namen als Text. Beim Einlesen ordnet man sie Spielern zu.
- **phase**: Klartext wie in TurnierPilot: `Gruppe`, `Gruppe A`, `Achtelfinale`, `Viertelfinale`, `Halbfinale`, `Finale`, `Spiel um Platz 3`, `Platzierung`.
- **werten**, **grund**: ob die einzelne Partie fürs Rating zählt und warum nicht. Ob das ganze Turnier zählt, entscheidet man beim Einlesen.

## Einlesen

- Nur ins Archiv, ohne Serie. Fürs Rating nur mit Haken (Vorgabe: aus).
- Schon vorhanden ist ein Turnier mit gleicher Kennung (in CueDesk auch: das eigene Turnier zurück oder gleicher Name am selben Tag). Es wird übersprungen.
- `formatVersion` höher als bekannt: Datei ablehnen mit Hinweis aufs Aktualisieren.
