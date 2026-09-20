import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Die Serverfunktion "rating" braucht die Rechenlogik in ihrem eigenen Ordner,
// weil beim Einspielen nur dieser Ordner mitgeht. Damit Browser und Server
// nicht auseinanderlaufen, muessen beide Dateien Zeichen fuer Zeichen gleich
// sein. Nach einer Aenderung an src/rating.ts also kopieren:
//   cp src/rating.ts supabase/functions/rating/rating.ts
test('Serverkopie der Rating-Logik ist aktuell', () => {
  const quelle = readFileSync('src/rating.ts', 'utf8');
  const kopie = readFileSync('supabase/functions/rating/rating.ts', 'utf8');
  expect(kopie).toBe(quelle);
});
