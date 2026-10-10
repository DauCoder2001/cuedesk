// Start-Hinweis beim Wechsel mit einem Spiel aus dem anderen Board
// (?spiel=<id>). Das Overlay legt ein kleines Skript am Anfang des Boards
// sofort an, noch bevor das Board laedt - sonst blitzten erst ein leeres Board
// ("Spieler 1 : Spieler 2") und dann die Spielauswahl auf. Hier wird der Text
// ergaenzt und das Overlay entfernt, sobald das Spiel am Tisch steht oder der
// Start nicht klappt.

const element = () => document.getElementById('start-hinweis');

// Sicherheitsnetz: nie dauerhaft ueber dem Board liegen bleiben
let notbremse = element() ? setTimeout(() => startHinweisAus(), 20000) : null;

export function startHinweisText(text) {
  const ziel = element()?.querySelector('.start-hinweis-text');
  if (ziel) ziel.textContent = text;
}

export function startHinweisAus() {
  if (notbremse) {
    clearTimeout(notbremse);
    notbremse = null;
  }
  element()?.remove();
}
