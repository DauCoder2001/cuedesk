// Vorgabe in Saetzen aus dem Rating-Unterschied.
//
// Der Unterschied wird nur zu "staerke" Prozent ausgeglichen (Vorgabe 75),
// damit der staerkere Spieler Favorit bleibt. Gesucht ist die Vorgabe, bei
// der die Siegchance am naechsten an 50 Prozent liegt.
//
// Diese Datei gehoert nicht zur Rating-Berechnung auf dem Server und bleibt
// deshalb getrennt von rating.ts.

export function vorgabe(
  ratingStark: number,
  ratingSchwach: number,
  raceTo: number,
  staerkeProzent = 75,
  obergrenze = Infinity
): number {
  const unterschied = Math.max(0, ratingStark - ratingSchwach) * (staerkeProzent / 100);
  if (unterschied <= 0 || raceTo < 2) return 0;

  const rackChance = 1 / (1 + Math.pow(2, -unterschied / 100));
  let beste = 0;
  let besterAbstand = Math.abs(siegchance(rackChance, raceTo, 0) - 0.5);
  for (let v = 1; v <= Math.min(raceTo - 1, obergrenze); v += 1) {
    const abstand = Math.abs(siegchance(rackChance, raceTo, v) - 0.5);
    if (abstand < besterAbstand) {
      besterAbstand = abstand;
      beste = v;
    }
  }
  return beste;
}

// Siegchance des staerkeren Spielers in einem Race to "ziel", wenn der
// schwaechere mit "vorsprung" Saetzen startet.
export function siegchance(rackChance: number, ziel: number, vorsprung: number): number {
  const brauchtA = ziel;
  const brauchtB = Math.max(0, ziel - vorsprung);
  if (brauchtB === 0) return 0;

  let summe = 0;
  for (let verloren = 0; verloren < brauchtB; verloren += 1) {
    summe +=
      binomial(brauchtA - 1 + verloren, verloren) *
      Math.pow(rackChance, brauchtA) *
      Math.pow(1 - rackChance, verloren);
  }
  return summe;
}

function binomial(n: number, k: number): number {
  let ergebnis = 1;
  for (let i = 1; i <= k; i += 1) ergebnis = (ergebnis * (n - k + i)) / i;
  return ergebnis;
}
