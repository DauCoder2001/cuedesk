# CLAUDE.md — CueDesk

Diese Datei wird bei jedem Start gelesen. Sie gilt fuer jede Aenderung in
diesem Projekt. Das Konzept steht in `docs/Konzept.md`.

## Sprache

- Antworten auf Deutsch.
- **Sichtbare Texte mit Umlauten** ("Kürzel", "auswählen", "für"). Nur
  Bezeichner, Dateinamen und Code-Kommentare bleiben ohne Umlaute
  (`kuerzel`, `geaendert_am`, `Anmeldung.tsx`).
- Nicht verwenden: Emojis, Fuellsaetze, Hinweise auf `git push`.

## Was dieses Projekt ist

Eine Web-Anwendung fuer den Spielbetrieb eines Billardvereins: Mitglieder,
Turniere, Einzelspiele, Live-Anzeige, Serienwertung, Vereins-Rating und
Statistik. Sie loest die Einzeldateien aus "Turnier light" und das
Firebase-Projekt "Pool-TS" ab. Mandantenfaehig, ein Verein je `verein_id`.

## Techstack — verbindlich

- TypeScript, React, Vite. Kein weiteres UI-Framework, keine CSS-Bibliothek.
- Supabase: PostgreSQL, Auth, Realtime, Edge Functions.
- Veroeffentlichung als statische Seite (zunaechst GitHub Pages).

## Datenbank

- **Nur die Testdatenbank anfassen**: Projekt `ejcskkawxbbvltvoxdnw`
  (Organisation DauCoder, Region Frankfurt). Eine Produktionsdatenbank gibt es
  noch nicht; sie wird nur nach ausdruecklicher Freigabe angelegt oder
  geaendert.
- Jede Schemaaenderung zuerst als Entwurf zeigen, dann als Migration unter
  `supabase/migrations/` ablegen **und** einspielen. Datei und Datenbank
  duerfen nicht auseinanderlaufen.
- Nach jeder Schemaaenderung die Sicherheitshinweise von Supabase abrufen
  (`get_advisors`, Typ `security`) und Abweichungen begruenden.
- Zugriffsrechte: Row Level Security auf jeder Tabelle, dazu die
  Tabellenrechte fuer `anon` und `authenticated`. Beides gehoert zusammen,
  ohne Grant laeuft nichts.
- Typen in `src/datenbank.types.ts` von Hand mitziehen.

## Arbeitsablauf — strikt einhalten

1. Vor jeder Aenderung an der Oberflaeche ein Mockup oder ein Vorher/Nachher
   zeigen.
2. Entwurfsentscheidungen als Optionen vorlegen und auf ausdrueckliche Wahl
   warten. Im Zweifel nachfragen statt annehmen.
3. Nach der Aenderung: `npm run pruefen` (TypeScript) und, wo vorhanden,
   `npm test`.
4. Aenderungen an der Oberflaeche im Browser pruefen, nicht nur behaupten.
5. Nach echten Dateiaenderungen fragen: "Soll ich das committen?" und den
   Befehl fertig zum Kopieren liefern — **einen Befehl je Block**, weil
   Windows PowerShell 5.1 kein `&&` kennt. `git push` macht Matthias selbst.
6. Nur zeigen, was sich geaendert hat.

## Grenzen

- Einzelspiele zaehlen nie fuer das Vereins-Rating, auch nicht mit Schalter.
- Partien mit Gastbeteiligung zaehlen nicht fuer das Rating.
- Vertrauliche Personendaten gehoeren in `personen_intern`, nie in
  `personen`.
- Kein Feld fuer Adresse, Geburtsdatum oder Bankdaten.
- `name_oeffentlich` entscheidet, ob ein Name oeffentlich erscheinen darf.

## Umgebung

- `.env.local` enthaelt Adresse und oeffentlichen Schluessel der
  Testdatenbank und gehoert nicht ins Repository (`.env.beispiel` zeigt den
  Aufbau).
- Entwicklungsserver: `npm run dev` auf Port 5173. Im Claude-Desktop laeuft
  er ueber die Konfiguration `cuedesk` in `Documents/Claude/.claude/launch.json`.
