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

export function herunterfahrenFrage(anzahl: number): string {
  return anzahl === 1
    ? 'TV-Gerät herunterfahren?\nEs startet erst wieder, wenn der Strom kurz getrennt wird.'
    : `Alle ${anzahl} TV-Geräte herunterfahren?\nSie starten erst wieder, wenn der Strom kurz getrennt wird.`;
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
