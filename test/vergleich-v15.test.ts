import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { berechnen, GESAMT } from '../src/rating';
import type { RatingPartie } from '../src/rating';

const HTML = 'C:/Users/Haas/Documents/Claude Projekte/Turnier light/serienwertung_billard_v15.html';
const DATEI = 'C:/Users/Haas/Downloads/Sicherung vom 2026-09-20 - serienwertung_billard.json';
const STICHTAG = '2026-09-20';

// Abnahmepruefung: CueDesk muss dieselben Werte liefern wie die alte
// Serienwertung. Beide Dateien liegen ausserhalb des Repositorys (die
// Sicherung enthaelt Mitgliederdaten), deshalb laeuft der Test nur,
// wenn sie vorhanden sind.
const vorhanden = existsSync(HTML) && existsSync(DATEI);

test.skipIf(!vorhanden)('CueDesk rechnet wie Serienwertung v15', async () => {
  const bestand = JSON.parse(readFileSync(DATEI, 'utf8'));

  // 1. v15 im jsdom rechnen lassen
  const dom = new JSDOM(readFileSync(HTML, 'utf8'), {
    runScripts: 'dangerously',
    url: 'http://localhost/'
  });
  await new Promise((fertig) => dom.window.addEventListener('load', fertig));
  const w = dom.window as any;
  const bestandOffen = { ...bestand, ratingAusgeblendet: [] };
  w.eval('db = ' + JSON.stringify(bestandOffen) + ';');
  const alt = JSON.parse(w.eval(`JSON.stringify(ratingBerechnen('${STICHTAG}'))`));

  // 2. Dieselben Partien fuer CueDesk aufbereiten (wie der Einlesevorgang)
  const aliase: Record<string, string> = bestand.aliase ?? {};
  const loese = (n: string) => (aliase[n.trim().toLowerCase()] ?? n).trim();
  const disziplinKey = (d: string) => String(d).toLowerCase().replace('14.1', '14-1');

  const partien: RatingPartie[] = [];
  (bestand.partienArchiv ?? []).forEach((t: any) => {
    if (!t.werten) return;
    (t.partien ?? []).forEach((p: any) => {
      if (p.werten === false) return;
      const a = loese(p.a), b = loese(p.b);
      if (a === b) return;
      const wa = p.satzA - (p.vorgabeA ?? 0), wb = p.satzB - (p.vorgabeB ?? 0);
      if (wa < 0 || wb < 0 || wa + wb === 0) return;
      partien.push({ datum: t.datum, disziplin: disziplinKey(t.disziplin), a, b, wa, wb });
    });
  });

  const startwerte: Record<string, number> = {};
  (bestand.ratingStartwerte ?? []).forEach((s: any) => (startwerte[loese(s.name)] = s.wert));

  const neu = berechnen({
    partien,
    startwerte,
    stichtag: STICHTAG,
    disziplinen: ['8-ball', '9-ball', '10-ball', 'multi-ball'],
    ausgeblendet: [],
    einstellungen: {
      zeitraum: bestand.ratingEinstellungen?.zeitraum,
      mindestRacks: bestand.ratingEinstellungen?.mindestRacks,
      rueckgriff: bestand.ratingEinstellungen?.rueckgriff,
      gewicht: bestand.ratingEinstellungen?.gewicht
    }
  });

  // 3. Vergleichen, Ansicht fuer Ansicht
  const ansichtenAlt: Record<string, string> = {
    gesamt: GESAMT, '8-Ball': '8-ball', '9-Ball': '9-ball', '10-Ball': '10-ball', 'Multi-Ball': 'multi-ball'
  };

  const unterschiede: string[] = [];
  for (const [altName, neuName] of Object.entries(ansichtenAlt)) {
    const a = alt.ansichten[altName];
    const n = neu.ansichten[neuName];
    if (!a || !n) { unterschiede.push('Ansicht fehlt: ' + altName); continue; }
    const namen: Record<string, string> = alt.spieler;
    for (const key of Object.keys(a.werte)) {
      const anzeige = namen[key] ?? key;
      const wAlt = a.werte[key];
      const wNeu = n.werte[anzeige];
      if (!wNeu) { unterschiede.push(`${altName}: ${anzeige} fehlt in CueDesk`); continue; }
      if (wAlt.rating !== wNeu.rating) {
        unterschiede.push(`${altName}: ${anzeige} v15=${wAlt.rating} CueDesk=${wNeu.rating}`);
      }
      if (wAlt.racks !== wNeu.racks) {
        unterschiede.push(`${altName}: ${anzeige} Racks v15=${wAlt.racks} CueDesk=${wNeu.racks}`);
      }
    }
    console.log(`${altName}: ${Object.keys(a.werte).length} Spieler geprueft`);
  }

  if (unterschiede.length) console.log(unterschiede.slice(0, 20).join('\n'));
  expect(unterschiede).toEqual([]);
}, 120000);
