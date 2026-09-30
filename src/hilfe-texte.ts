// Die Hilfetexte aus hilfe/*.md, beim Bau eingebettet. Getrennt von
// src/hilfe.ts, damit die Rechnung ohne Dateien testbar bleibt.
import { themaLesen } from './hilfe';
import type { Thema } from './hilfe';

const dateien = import.meta.glob('/hilfe/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const THEMEN: Thema[] = Object.entries(dateien).map(([pfad, inhalt]) => themaLesen(pfad, inhalt));
