// Offline-Fassung der Scoreboards bauen (npm run offline).
//
// Je Board entsteht eine einzige HTML-Datei mit allem eingebettet, wie
// frueher bei Pool-TS (Git_Standalone). So laufen die Boards auf GitHub Pages
// und auch direkt als Datei vom Tablet, ohne Server. Gebaut wird mit
// VITE_NUR_OFFLINE=1: anbindung.ts bleibt immer offline, die Datenbank ist
// nicht enthalten. Die Namen bleiben die alten (index_pool.html,
// index141.html), damit Lesezeichen auf den Tablets weiter stimmen.
//
// Ergebnis im Ordner offline/; der Workflow scoreboards-offline.yml legt ihn
// ins Repository aus der Variable SCOREBOARDS_ZIEL. Neue Seiten, die offline
// gebraucht werden, hier in SEITEN eintragen.

import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quelle = join(wurzel, 'scoreboards');
const ziel = join(wurzel, 'offline');
const zwischen = join(wurzel, 'offline-bau');

// Quelle in scoreboards/ -> Name in der Offline-Fassung
const SEITEN = [
  ['index.html', 'index.html'],
  ['Pool_Scoreboard.html', 'index_pool.html'],
  ['14.1_Scoreboard.html', 'index141.html'],
  ['14.1_Log.html', '14.1_Log.html']
];

// Weitere Dateien: [Quelle relativ zur Wurzel, Name im Ziel]
const BEIGABEN = [
  ['scoreboards/manifest.json', 'manifest.json'],
  ['scoreboards/offline-repo/README.md', 'README.md'],
  ['scoreboards/offline-repo/LICENSE', 'LICENSE'],
  ['scoreboards/offline-repo/.nojekyll', '.nojekyll']
];

await rm(ziel, { recursive: true, force: true });
await rm(zwischen, { recursive: true, force: true });
await mkdir(ziel, { recursive: true });

for (const [datei] of SEITEN) {
  await build({
    configFile: false, // nicht vite.config.ts: kein React, keine .env mit Datenbankadresse
    root: quelle,
    envDir: zwischen, // leer - es wird keine .env gelesen
    base: './',
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_NUR_OFFLINE': JSON.stringify('1') },
    plugins: [viteSingleFile()],
    build: {
      outDir: join(zwischen, datei),
      emptyOutDir: true,
      assetsInlineLimit: 1_000_000,
      rollupOptions: { input: join(quelle, datei) }
    }
  });
}

// Umbenennen und Verweise zwischen den Seiten auf die neuen Namen ziehen
const umbenennen = (text) =>
  SEITEN.reduce((t, [alt, neu]) => (alt === neu ? t : t.split(alt).join(neu)), text);
// Was das Plugin nicht einbettet (etwa das Favicon im <link>), wird hier als
// data:-Adresse eingesetzt
const TYPEN = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp' };
for (const [datei, neu] of SEITEN) {
  const ordner = join(zwischen, datei);
  let text = await readFile(join(ordner, datei), 'utf8');
  for (const name of await readdir(ordner)) {
    // Das Manifest liegt unter seinem festen Namen daneben (BEIGABEN)
    if (/^manifest-.*\.json$/.test(name)) text = text.split(`./${name}`).join('manifest.json');
    const typ = TYPEN[name.slice(name.lastIndexOf('.'))];
    if (!typ || !text.includes(`./${name}`)) continue;
    const inhalt = await readFile(join(ordner, name));
    text = text.split(`./${name}`).join(`data:${typ};base64,${inhalt.toString('base64')}`);
  }
  // Wie bei Pool-TS: jede Seite nennt das Manifest, damit ein Board als
  // Startbildschirm-App im Vollbild laeuft
  if (!text.includes('rel="manifest"')) text = text.replace(/<head>/i, '<head>\n<link rel="manifest" href="manifest.json">');
  await writeFile(join(ziel, neu), umbenennen(text));
}
for (const [von, nach] of BEIGABEN) await copyFile(join(wurzel, von), join(ziel, nach));
await rm(zwischen, { recursive: true, force: true });

// Pruefung: keine Datenbank, keine nachgeladenen Dateien
const fehler = [];
for (const name of await readdir(ziel)) {
  if (!name.endsWith('.html')) continue;
  const text = await readFile(join(ziel, name), 'utf8');
  if (text.includes('supabase.co')) fehler.push(`${name}: enthält eine Datenbankadresse`);
  if (/(src|href)="[^"]*assets\//.test(text)) fehler.push(`${name}: lädt Dateien aus assets/ nach`);
  if (/<script[^>]+src="(?!https?:)/.test(text)) fehler.push(`${name}: bindet ein Skript als Datei ein`);
  // Nur Verweise auf die eigenen Seiten und manifest.json sind erlaubt
  for (const [, pfad] of text.matchAll(/(?:src|href)="\.?\/?([^"#?:]+\.[a-z0-9]+)"/g)) {
    if (!pfad.endsWith('.html') && pfad !== 'manifest.json') fehler.push(`${name}: verweist auf die fehlende Datei ${pfad}`);
  }
}
if (fehler.length) {
  console.error(`Offline-Fassung fehlerhaft:\n${fehler.join('\n')}`);
  process.exit(1);
}
console.log(`Offline-Fassung in offline/: ${(await readdir(ziel)).join(', ')}`);
