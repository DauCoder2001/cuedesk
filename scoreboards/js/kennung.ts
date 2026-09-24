// Eine neue Kennung im UUID-Format.
//
// crypto.randomUUID gibt es nur in sicheren Kontexten (HTTPS oder localhost).
// Die Tablets rufen CueDesk aber ueber die Adresse im WLAN auf (http://...),
// dort fehlt die Funktion - der Abschluss eines Turnierspiels ist daran
// gescheitert. Deshalb hier ein Rueckfall aus Zufallsbytes.

export function neueKennung(): string {
  const zufall = globalThis.crypto as Crypto | undefined;
  if (typeof zufall?.randomUUID === 'function') return zufall.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof zufall?.getRandomValues === 'function') {
    zufall.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Fassung 4, Variante 1 - dieselbe Form wie aus randomUUID
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
