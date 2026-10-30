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
      for (const m of q.text.matchAll(/<button([^>]*)>\s*(Verwerfen|Löschen|Entziehen)\s*<\/button>/g)) {
        if (!m[1].includes('gefahrknopf')) ohneRot.push(`${q.name}: ${m[2]}`);
      }
    }
    expect(ohneRot).toEqual([]);
  });

  it('Entfernen-Knoepfe sind orange', () => {
    const ohneOrange: string[] = [];
    for (const q of quelle) {
      for (const m of q.text.matchAll(/<button([^>]*)>\s*Entfernen\s*<\/button>/g)) {
        if (!m[1].includes('entfernknopf')) ohneOrange.push(q.name);
      }
    }
    expect(ohneOrange).toEqual([]);
  });

  it('Speichern ist im Formular gruen (wenn faellig), im Dialog blau', () => {
    // Ausnahme: die Auswahl "Behalten / Speichern" beim Status-Wechsel eines Spielers
    const ohneFarbe: string[] = [];
    for (const q of quelle) {
      for (const m of q.text.matchAll(/<button((?:=>|[^>])*)>([^<]*)<\/button>/g)) {
        if (!/Speichern|speichern'|Anlegen'|Anmelden'|Anmeldelink schicken|Einladung schicken|Bestätigungsmails schicken/.test(m[2])) continue;
        if (/Behalten|Abmelden/.test(m[2])) continue;
        if (!/faellig|hauptaktion/.test(m[1])) ohneFarbe.push(`${q.name}: ${m[2].trim()}`);
      }
    }
    expect(ohneFarbe).toEqual([]);
  });

  it('Loeschknoepfe im Kopf stehen abgesetzt', () => {
    // Nicht direkt neben dem naechsten Schritt (Abschliessen, Wieder oeffnen)
    const ohneAbstand: string[] = [];
    for (const [datei, knopf] of [
      ['TurnierAnsicht.tsx', 'Turnier löschen'],
      ['LigaAnsicht.tsx', 'Spieltag löschen'],
      ['TeamvergleichAnsicht.tsx', 'Teamvergleich löschen'],
      ['Mannschaften.tsx', 'Löschen']
    ]) {
      const text = quelle.find((q) => q.name === datei)?.text ?? '';
      const stelle = text.search(new RegExp(`>\\s*${knopf}\\s*</button>`));
      if (stelle < 0 || !text.slice(Math.max(0, stelle - 1500), stelle).includes('loeschgruppe')) ohneAbstand.push(`${datei}: ${knopf}`);
    }
    expect(ohneAbstand).toEqual([]);
  });
});
