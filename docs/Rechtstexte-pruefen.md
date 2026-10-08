# Rechtstexte: Stellen zum Prüfen

Stand der Liste: 07.10.2026 · Grundlage für die rechtliche Prüfung vor dem Livegang

Betroffen sind die öffentlichen Seiten `impressum.html`, `datenschutz.html`, `nutzungsbedingungen.html` und `auftragsverarbeitung.html` sowie das interne `docs/Verzeichnis-Verarbeitungstaetigkeiten.md`. Betreiber ist eine Privatperson (Matthias Haas), CueDesk ist für Vereine unentgeltlich.

Die Liste hat vier Teile:

1. **Fragen an die rechtliche Prüfung**: Formulierungen, die jemand mit Fachkenntnis beurteilen sollte.
2. **Vorher selbst zu klären**: Tatsachen, die in den Texten stehen, aber erst noch hergestellt oder bestätigt werden müssen.
3. **Widersprüche zwischen den Texten**: beim Durchsehen aufgefallen, unabhängig von der Prüfung zu beheben.
4. **Datum „Stand“**: zuletzt eintragen.

## 1. Fragen an die rechtliche Prüfung

### Nutzungsbedingungen (`nutzungsbedingungen.html`)

| Nr. | Abschnitt | Text (gekürzt) | Frage |
|---|---|---|---|
| N1 | Geltungsbereich | „Für den Verein stimmt ein Vereins-Administrator zu; er versichert dabei, dass er den Verein insoweit vertreten darf.“ | Reicht die Zustimmung per Klick durch einen Vereins-Administrator mit dieser Versicherung, oder braucht es den Vorstand nach § 26 BGB? |
| N2 | 7. Haftung | „Weil CueDesk unentgeltlich überlassen wird, haftet der Betreiber nur für Vorsatz und grobe Fahrlässigkeit. Das gilt nicht für Schäden aus der Verletzung von Leben, Körper oder Gesundheit und nicht, soweit ein Gesetz zwingend weiter haftet. Für Daten, die der Verein einträgt, ist der Verein verantwortlich.“ | Ist diese Beschränkung bei unentgeltlicher Überlassung (Leihe bzw. Schenkung, §§ 521, 599 BGB) wirksam, auch als vorformulierte Bedingung (§ 309 Nr. 7 BGB)? |
| N3 | 9. Änderungen | „Änderungen kündigt der Betreiber den Vereins-Administratoren mindestens 6 Wochen vorher per E-Mail an. Die neue Fassung gilt, sobald ein Vereins-Administrator ihr in CueDesk zustimmt. Stimmt der Verein nicht zu, kann er die Nutzung beenden; bis zum Ende gilt die bisherige Fassung.“ | Ist dieses Verfahren (ausdrückliche Zustimmung statt Schweigen) so in Ordnung? |

### Vertrag zur Auftragsverarbeitung (`auftragsverarbeitung.html`, Art. 28 DSGVO)

| Nr. | Abschnitt | Text (gekürzt) | Frage |
|---|---|---|---|
| A1 | 6. Unterauftragsverarbeiter | „Der Verein stimmt den Unterauftragsverarbeitern in Anlage 2 zu. Einen neuen oder geänderten Unterauftragsverarbeiter kündigt der Betreiber mindestens 4 Wochen vorher per E-Mail an. Der Verein kann aus wichtigem datenschutzrechtlichem Grund widersprechen; kommt keine Lösung zustande, kann er die Nutzung beenden.“ | Genügt diese allgemeine Genehmigung mit Widerspruchsrecht den Anforderungen von Art. 28 Abs. 2 und 4 DSGVO? |
| A2 | 8. Nachweise und Kontrollen | „Kontrollen vor Ort sind nach Absprache möglich, soweit eine schriftliche Auskunft nicht ausreicht.“ | Ist die Einschränkung der Vor-Ort-Kontrolle mit Art. 28 Abs. 3 lit. h DSGVO vereinbar? |
| A3 | 10. Haftung | „Für die Haftung gilt Art. 82 DSGVO, im Übrigen die Regelung der Nutzungsbedingungen.“ | Ist der Verweis auf die Haftungsbeschränkung der Nutzungsbedingungen im AVV zulässig? |
| A4 | Anlage 1 (TOM), Konten des Betreibers | „Zugänge zu den Dienstleistern mit starken Passwörtern und Zwei-Faktor-Anmeldung.“ | Inhaltlich ausreichend? (Tatsache siehe S1) |
| A5 | Anlage 2, Supabase | „Server in Frankfurt am Main (Region Central EU). Das Unternehmen sitzt in den USA; Grundlage sind der Vertrag zur Auftragsverarbeitung von Supabase und die Standardvertragsklauseln der EU-Kommission.“ | Ist die Drittland-Grundlage richtig benannt (Standardvertragsklauseln, ggf. zusätzlich Data Privacy Framework)? |

### Datenschutzerklärung (`datenschutz.html`)

| Nr. | Abschnitt | Text (gekürzt) | Frage |
|---|---|---|---|
| D1 | Dienstleister, Supabase | „Die Daten liegen auf Servern in Frankfurt am Main. Da das Unternehmen in den USA sitzt, ist ein Zugriff von dort nicht ausgeschlossen; Grundlage sind der Vertrag zur Auftragsverarbeitung und die Standardvertragsklauseln der EU-Kommission.“ | Wie A5. |
| D2 | Dienstleister, GitHub | „Bereitstellung der Webseite und Ablage der wöchentlichen Sicherung. Die Sicherung ist verschlüsselt, bevor sie GitHub erreicht; GitHub kann sie nicht lesen. Grundlage für die Webseite ist das EU-US Data Privacy Framework.“ | Ist GitHub zertifiziert und die Grundlage richtig? (Entfällt, wenn Webseite und Sicherung zu IONOS ziehen, siehe S2.) |
| D3 | Dienstleister, Google | „Postfach kontakt.cuedesk@gmail.com für Kontaktanfragen. Grundlage ist das EU-US Data Privacy Framework.“ | Grundlage richtig? Ist ein privates Gmail-Postfach für Anfragen zu Daten von Vereinen vertretbar? |

### Verzeichnis der Verarbeitungstätigkeiten (intern)

| Nr. | Stelle | Text | Frage |
|---|---|---|---|
| V1 | Betreiber | „Datenschutzbeauftragter: keiner, keine Pflicht (§ 38 BDSG)“ | Richtig für eine Privatperson als Betreiber? |
| V2 | Einleitung | „Die Ausnahme für Betriebe unter 250 Beschäftigten (Art. 30 Abs. 5) greift nicht, weil die Verarbeitung nicht nur gelegentlich erfolgt.“ | Richtig eingeordnet? |
| V3 | A2, A3, B | Drittland Supabase und Google: DPA, Standardvertragsklauseln, Data Privacy Framework | Wie A5 und D3. |
| V4 | A5 Zustimmungen | „Löschfrist: mit dem Verein, danach nicht mehr nötig [prüfen: Aufbewahrung als Vertragsnachweis]“ | Müssen Zustimmungen zu Nutzungsbedingungen und AVV nach dem Ende eines Vereins aufbewahrt werden, und wie lange? |

## 2. Vorher selbst zu klären

| Nr. | Punkt | Wo es steht | Was zu tun ist |
|---|---|---|---|
| S1 | Zwei-Faktor-Anmeldung bei allen Dienstleistern | AVV Anlage 1 | Bei Supabase, IONOS, GitHub und Google einschalten, sonst stimmt die Zusage nicht. |
| S2 | Hosting der Webseite: GitHub Pages oder IONOS | Datenschutzerklärung (GitHub), AVV Anlage 2 (IONOS), Verzeichnis A1 | Entschieden 07.10.2026: GitHub Pages bleibt. Alle drei Stellen gleichziehen (Claude, steht in `Vor-dem-Livegang.md`). |
| S3 | Ablage der wöchentlichen Sicherung | Datenschutzerklärung (GitHub), Verzeichnis B, offene Punkte | Entschieden 07.10.2026: bleibt verschlüsselt bei GitHub; GitHub in AVV Anlage 2 aufnehmen (Claude). |
| S4 | Verträge mit den Dienstleistern | Datenschutzerklärung, AVV Anlage 2, Verzeichnis | DPA bei Supabase (Dashboard) und AVV bei IONOS (Kundenkonto) abschließen und ablegen. |
| S5 | Löschfrist der Server-Protokolle | Verzeichnis A1: „nach den Fristen des Hosters [prüfen]“ | Frist beim gewählten Hoster nachsehen und eintragen. |
| S6 | Öffentlicher Live-Link (Stufe 32, 08.10.2026) | Datenschutzerklärung, Verzeichnis (neue Tätigkeit), Hilfe Turnier | Neue Verarbeitung aufnehmen: Spielstände, Spielplan und Namen („Vorname N.“ mit Einwilligung, sonst Kürzel) sind für jeden mit dem Link sichtbar, befristet je Turnier. Hinweis für Vereine: Teilnehmer vorab informieren, z. B. in der Ausschreibung. Text zeigen, dann einarbeiten (Claude). |

## 3. Widersprüche zwischen den Texten

- **Webseite:** Die Datenschutzerklärung nennt GitHub als Ort der Webseite, AVV Anlage 2 nennt IONOS („Hosting der Webseite“). Nur eines davon stimmt (S2).
- **Sicherung:** Die Datenschutzerklärung nennt GitHub als Ablage der Sicherung, in AVV Anlage 2 fehlt GitHub. Für die Vereine ist GitHub damit ein nicht genehmigter Unterauftragsverarbeiter (S3).
- **IONOS:** In der Datenschutzerklärung macht IONOS nur Domain, Postfach und Mailversand, in AVV Anlage 2 auch das Hosting. Gleichziehen nach der Entscheidung zu S2.

## 4. Datum „Stand“

Erst eintragen, wenn alle Punkte oben erledigt sind:

- `impressum.html`: „Stand: [Datum]“
- `datenschutz.html`: „Stand: [Datum]“
- `nutzungsbedingungen.html`: „Fassung 1 · Stand: [Datum]“
- `auftragsverarbeitung.html`: „Fassung 1 · Stand: [Datum]“
- `docs/Verzeichnis-Verarbeitungstaetigkeiten.md`: „Stand: [Datum]“

Danach in Nutzungsbedingungen und AVV die Kommentare „ENTWURF: vor dem Livegang rechtlich pruefen lassen“ entfernen. Ändert sich nach dem Livegang etwas an Nutzungsbedingungen oder AVV, wird daraus Fassung 2, und die Vereine müssen neu zustimmen.
