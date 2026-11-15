// Geraete und Tische (Seite "Tische und Geraete"): Welche anderen Geraete
// haengen schon an einem Tisch? Zwei Tablets am selben Tisch ueberschreiben
// sich gegenseitig den Spielstand; CueDesk warnt deshalb, verbietet es aber
// nicht (Ersatz-Tablet einrichten). Getestet in test/geraete.test.ts.

type GeraetKurz = { id: string; name: string; tisch_id: string | null; zuletzt_gesehen: string | null };

// Andere Geraete am Tisch; ohne Tisch (Fernseher) nie belegt
export function andereAmTisch<T extends GeraetKurz>(geraete: T[], tischId: string | null | undefined, ausser?: string): T[] {
  if (!tischId) return [];
  return geraete.filter((g) => g.tisch_id === tischId && g.id !== ausser);
}

// Der Agent auf dem TV-Geraet meldet sich alle 30 Sekunden. Die Frist gleicht
// der in der Datenbankfunktion tv_herunterfahren.
const AGENT_FRIST_MS = 2 * 60 * 1000;

export function agentErreichbar(zuletztGemeldet: string | null, jetzt = Date.now()): boolean {
  return zuletztGemeldet !== null && jetzt - Date.parse(zuletztGemeldet) < AGENT_FRIST_MS;
}

export type TvAgent = { name: string; zuletzt_gemeldet: string | null };

// "am 08.11.2026 um 14:54 Uhr" (deutsche Zeit)
function meldezeit(iso: string): string {
  const d = new Date(iso);
  const tag = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return `am ${tag} um ${uhr} Uhr`;
}

// Tooltip des grauen Knopfs "TV-Gerät herunterfahren", wenn kein Agent erreichbar ist
export function nichtErreichbarText(agenten: TvAgent[]): string {
  const zuletzt = (a: TvAgent) => (a.zuletzt_gemeldet ? `zuletzt ${meldezeit(a.zuletzt_gemeldet)}` : 'noch nie');
  const teile =
    agenten.length === 1
      ? `Der Agent von „${agenten[0].name}“ hat sich ${zuletzt(agenten[0])} gemeldet.`
      : `Die Agenten haben sich seit über 2 Minuten nicht gemeldet: ${agenten.map((a) => `„${a.name}“ ${zuletzt(a)}`).join(', ')}.`;
  return `Kein TV-Gerät erreichbar: ${teile} Ist das Gerät an?`;
}

// laeuftNoch: z. B. "Das Turnier läuft noch." - dann warnt die Rueckfrage zusaetzlich
export function herunterfahrenFrage(anzahl: number, laeuftNoch?: string): string {
  const frage =
    anzahl === 1
      ? 'TV-Gerät herunterfahren?\nEs startet erst wieder, wenn der Strom kurz getrennt wird.'
      : `Alle ${anzahl} TV-Geräte herunterfahren?\nSie starten erst wieder, wenn der Strom kurz getrennt wird.`;
  return laeuftNoch
    ? `${frage}\n\nAchtung: ${laeuftNoch} Bis zum Neustart zeigt der Fernseher keine Spielstände mehr.`
    : frage;
}

export function herunterfahrenMeldung(anzahl: number): string {
  return anzahl === 1
    ? 'Das TV-Gerät fährt in den nächsten 30 Sekunden herunter.'
    : `${anzahl} TV-Geräte fahren in den nächsten 30 Sekunden herunter.`;
}

// Text der Rueckfrage vor dem Koppeln oder Umstellen
export function belegtText(tischName: string, andere: GeraetKurz[], zuletzt: (zeitpunkt: string | null) => string): string {
  const wer = andere.map((g) => `„${g.name}“ (${zuletzt(g.zuletzt_gesehen)})`).join(', ');
  return (
    `An ${tischName} hängt schon ${wer}.\n\n` +
    'Zwei Geräte am selben Tisch überschreiben sich gegenseitig den Spielstand. ' +
    'Ersetzt das neue Gerät das alte, trenne das alte danach.'
  );
}
