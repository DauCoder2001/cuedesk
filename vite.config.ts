import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Der Basispfad haengt davon ab, wo die Anwendung liegt:
// GitHub Pages unter /cuedesk/, eine eigene Domain unter /.
// Er wird beim Bauen ueber VITE_BASIS gesetzt, Vorgabe ist "/".
//
// Neben der Anwendung (index.html) werden die Scoreboards als eigene Seiten
// gebaut. Sie stammen aus Pool-TS und bleiben weitgehend unveraendert.
export default defineConfig(() => ({
  base: process.env.VITE_BASIS ?? '/',
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // Die Scoreboards warten beim Start auf CueDesk (await auf oberster Ebene).
    target: 'es2022',
    rollupOptions: {
      input: {
        anwendung: resolve(__dirname, 'index.html'),
        scoreboards: resolve(__dirname, 'scoreboards/index.html'),
        vierzehnEins: resolve(__dirname, 'scoreboards/14.1_Scoreboard.html'),
        vierzehnEinsProtokoll: resolve(__dirname, 'scoreboards/14.1_Log.html'),
        pool: resolve(__dirname, 'scoreboards/Pool_Scoreboard.html'),
        tv: resolve(__dirname, 'scoreboards/tv.html'),
        tvAuslosung: resolve(__dirname, 'scoreboards/tv-Auslosung.html'),
        tvErgebnis: resolve(__dirname, 'scoreboards/tv-Turnier-Ergebnis.html')
      }
    }
  }
}));
