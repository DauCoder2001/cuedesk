// Kennzeichnung der Testfassung (Entscheidung E3, docs/Produktion-einrichten.md)
//
// Nur wenn beim Bauen VITE_TESTFASSUNG=1 gesetzt ist (veroeffentlichen.yml,
// daucoder2001.github.io/cuedesk/ mit der Test-DB): Streifen oben auf jeder
// Seite der Verwaltung und "[TEST]" im Tab-Titel. Lokal und in der Produktion
// (app.cuedesk.de) bleibt alles wie bisher. Scoreboards und TV haben eigene
// Seiten und bleiben ohne Streifen.

export const PRODUKTION = 'https://app.cuedesk.de/';

export function testfassungKennzeichnen(wurzel: HTMLElement) {
  if (import.meta.env.VITE_TESTFASSUNG !== '1') return;
  if (!document.title.startsWith('[TEST]')) document.title = `[TEST] ${document.title}`;
  const streifen = document.createElement('div');
  streifen.className = 'teststreifen';
  streifen.setAttribute('role', 'note');
  streifen.append('Testumgebung – keine echten Turniere eintragen · ');
  const link = document.createElement('a');
  link.href = PRODUKTION;
  link.textContent = 'zur echten Fassung: app.cuedesk.de';
  streifen.append(link);
  wurzel.before(streifen);
}
