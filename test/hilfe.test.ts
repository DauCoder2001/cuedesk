import { describe, expect, test } from 'vitest';
import { bloecke, dateiName, handbuchPdf, handoutPdf, pdfTauglich, suchen, teile, themaLesen, themaZurSeite, themenFuer } from '../src/hilfe';

const TURNIER = `---
titel: Turnier anlegen und durchführen
rollen: vereinsadmin, sportwart, turnierleiter
seiten: turniere
reihenfolge: 20
---
## Anlegen

Unter **Turniere** auf \`Neues Turnier\` klicken.

1. Name eintragen
2. Modus wählen
   mit Fortsetzung

- Punkt eins
- Punkt [zwei](https://cuedesk.de)
`;

describe('Lesen', () => {
  const t = themaLesen('/hilfe/turnier.md', TURNIER);
  test('Kopf', () => {
    expect(t).toMatchObject({ id: 'turnier', titel: 'Turnier anlegen und durchführen', seiten: ['turniere'], reihenfolge: 20 });
    expect(t.rollen).toEqual(['vereinsadmin', 'sportwart', 'turnierleiter']);
  });
  test('Bloecke: Ueberschrift, Absatz, nummerierte und einfache Liste', () => {
    expect(t.bloecke.map((b) => b.art)).toEqual(['h2', 'p', 'ol', 'ul']);
    const ol = t.bloecke[2] as { punkte: unknown[][] };
    expect(ol.punkte).toHaveLength(2);
    expect(JSON.stringify(ol.punkte[1])).toContain('mit Fortsetzung');
  });
  test('ohne Kopf: fuer alle, Titel aus dem Dateinamen', () => {
    const o = themaLesen('frei.md', 'Nur Text');
    expect(o).toMatchObject({ id: 'frei', titel: 'frei', rollen: ['alle'] });
    expect(bloecke('Nur Text')[0].art).toBe('p');
  });
  test('Inline-Teile', () => {
    expect(teile('a **b** `c` [d](e) f')).toEqual([
      { art: 'text', text: 'a ' },
      { art: 'fett', text: 'b' },
      { art: 'text', text: ' ' },
      { art: 'code', text: 'c' },
      { art: 'text', text: ' ' },
      { art: 'link', text: 'd', ziel: 'e' },
      { art: 'text', text: ' f' }
    ]);
  });
});

describe('Auswahl', () => {
  const turnier = themaLesen('turnier.md', TURNIER);
  const mitglieder = themaLesen('mitglieder.md', '---\ntitel: Für Mitglieder\nrollen: alle\nseiten: zuschauen, konto\nreihenfolge: 10\n---\nZuschauen und Chat');
  const konsole = themaLesen('konsole.md', '---\ntitel: Konsole\nrollen: superadmin\nseiten: konsole\n---\nVereine anlegen');
  const alle = [konsole, turnier, mitglieder];

  test('eigene Themen nach Rolle, Rest unter "Alle Themen"', () => {
    const m = themenFuer(alle, ['mitglied'], false);
    expect(m.eigene.map((t) => t.id)).toEqual(['mitglieder']);
    expect(m.weitere.map((t) => t.id)).toEqual(['turnier', 'konsole']);
    expect(themenFuer(alle, ['turnierleiter'], true).eigene.map((t) => t.id)).toEqual(['mitglieder', 'turnier', 'konsole']);
  });
  test('Kontexthilfe zur Seite', () => {
    expect(themaZurSeite(alle, 'turniere')?.id).toBe('turnier');
    expect(themaZurSeite(alle, 'konto')?.id).toBe('mitglieder');
    expect(themaZurSeite(alle, 'serien')).toBeNull();
  });
  test('Suche in Titel und Text, gross/klein egal', () => {
    expect(suchen(alle, 'CHAT').map((t) => t.id)).toEqual(['mitglieder']);
    expect(suchen(alle, 'modus').map((t) => t.id)).toEqual(['turnier']);
    expect(suchen(alle, '')).toHaveLength(3);
  });
});

describe('PDF', () => {
  test('nicht darstellbare Zeichen werden ersetzt', () => {
    expect(pdfTauglich('Mein Konto → Meine Daten ✓')).toBe('Mein Konto -> Meine Daten OK');
    expect(pdfTauglich('mit dem ✕ löschen ↗')).toBe('mit dem x löschen');
  });
  test('Handout enthaelt Titel und Listenpunkte', () => {
    const pdf = new TextDecoder('latin1').decode(handoutPdf(themaLesen('turnier.md', TURNIER), 'B&W Verden'));
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf).toContain('Tj');
    expect(pdf).toContain('Name eintragen');
    expect(pdf).toContain('(1.) Tj');
  });
  test('Dateiname', () => {
    expect(dateiName('Turnier anlegen & durchführen')).toBe('CueDesk-Hilfe_Turnier-anlegen-durchführen.pdf');
  });
});

describe('Die echten Hilfetexte', () => {
  test('alle Themen haben Titel, Rollen und Seiten; jede Rolle hat eigene Themen', async () => {
    const { THEMEN } = await import('../src/hilfe-texte');
    expect(THEMEN.length).toBeGreaterThanOrEqual(8);
    THEMEN.forEach((t) => {
      expect(t.titel).not.toBe(t.id);
      expect(t.seiten.length).toBeGreaterThan(0);
      expect(t.bloecke.length).toBeGreaterThan(2);
    });
    for (const rolle of ['mitglied', 'turnierleiter', 'sportwart', 'vereinsadmin']) {
      expect(themenFuer(THEMEN, [rolle], false).eigene.length).toBeGreaterThan(1);
    }
    expect(themenFuer(THEMEN, [], true).eigene.map((t) => t.id)).toContain('konsole');
    expect(themaZurSeite(THEMEN, 'turniere')?.id).toBe('turnier');
    expect(themaZurSeite(THEMEN, 'personen')?.id).toBe('spieler-datenschutz');
  });
  test('Handbuch: jede Seite beginnt, keine unlesbaren Zeichen', async () => {
    const { THEMEN } = await import('../src/hilfe-texte');
    const pdf = new TextDecoder('latin1').decode(handbuchPdf(THEMEN, 'Testverein'));
    expect(pdf).not.toContain(String.raw`\077`); // Fragezeichen fuer nicht darstellbare Zeichen
    expect(pdf).toContain('Benutzerhandbuch');
  });
});
