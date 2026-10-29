import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Einheitliche Oberflaeche: Begriffe und Knopffarben (siehe hilfe/*.md)
const SRC = join(__dirname, '..', 'src');
const dateien = [join(SRC, 'rueckfrage.tsx'), ...readdirSync(join(SRC, 'seiten')).map((d) => join(SRC, 'seiten', d))].filter((d) => d.endsWith('.tsx'));
const quelle = dateien.map((d) => ({ name: d.split(/[\\/]/).pop() as string, text: readFileSync(d, 'utf8') }));

describe('UI-Regeln', () => {
  it('Schutzwort-Abfragen heissen Schutzwort, nicht Passwort', () => {
    // "Passwort" nur fuer das eigene Konto (Anmeldung, Mein Konto)
    const treffer = quelle
      .filter((q) => !['Anmeldung.tsx', 'Konto.tsx'].includes(q.name))
      .filter((q) => /placeholder="Passwort"|Das Passwort stimmt nicht/.test(q.text))
      .map((q) => q.name);
    expect(treffer).toEqual([]);
  });

  it('PDF-Knoepfe heissen "Name (PDF)"', () => {
    const treffer = quelle.filter((q) => /^\s*[A-ZÄÖÜ][a-zäöüß]+ als PDF\s*$/m.test(q.text)).map((q) => q.name);
    expect(treffer).toEqual([]);
  });

  it('Verwerfen- und Loeschen-Knoepfe sind rot', () => {
    const ohneRot: string[] = [];
    for (const q of quelle) {
      for (const m of q.text.matchAll(/<button([^>]*)>\s*(Verwerfen|Löschen)\s*<\/button>/g)) {
        if (!m[1].includes('gefahrknopf')) ohneRot.push(`${q.name}: ${m[2]}`);
      }
    }
    expect(ohneRot).toEqual([]);
  });
});
