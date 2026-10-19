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

// Text der Rueckfrage vor dem Koppeln oder Umstellen
export function belegtText(tischName: string, andere: GeraetKurz[], zuletzt: (zeitpunkt: string | null) => string): string {
  const wer = andere.map((g) => `„${g.name}“ (${zuletzt(g.zuletzt_gesehen)})`).join(', ');
  return (
    `An ${tischName} hängt schon ${wer}.\n\n` +
    'Zwei Geräte am selben Tisch überschreiben sich gegenseitig den Spielstand. ' +
    'Ersetzt das neue Gerät das alte, trenne das alte danach.'
  );
}
