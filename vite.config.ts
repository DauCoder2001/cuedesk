import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Der Basispfad haengt davon ab, wo die Anwendung liegt:
// GitHub Pages unter /pool-club/, eine eigene Domain unter /.
// Er wird beim Bauen ueber VITE_BASIS gesetzt, Vorgabe ist "/".
export default defineConfig(() => ({
  base: process.env.VITE_BASIS ?? '/',
  plugins: [react()],
  server: { port: 5173 }
}));
