import { describe, expect, it } from 'vitest';
import {
  altIdsZu,
  dateiBauen,
  dateiLesen,
  dateiname,
  disziplinAusText,
  disziplinText,
  eigeneId,
  kennungVon,
  namenVon,
  phaseAusText,
  phaseText
} from '../src/turnier-datei';
import type { DateiTurnier } from '../src/turnier-datei';

// Ausgedachte Namen, keine echten Mitglieder
const turnier: DateiTurnier = {
  kennung: 'turnierpilot:abc123',
  name: 'Freitagsturnier',
  datum: '2026-10-24',
  disziplin: '8-Ball',
  modus: 'einzelgruppe',
  teilnehmer: ['Anna Probe', 'Bernd Beispiel'],
  ranking: [
    { platz: 1, name: 'Anna Probe' },
    { platz: 2, name: 'Bernd Beispiel' }
  ],
  partien: [{ a: 'Anna Probe', b: 'Bernd Beispiel', satzA: 3, satzB: 1, raceTo: 3, phase: 'Gruppe' }]
};

describe('Turnier-Datei', () => {
  it('liest, was sie gebaut hat', () => {
    const datei = JSON.parse(JSON.stringify(dateiBauen('CueDesk v0302', [turnier])));
    const { turniere, meldungen } = dateiLesen(datei);
    expect(meldungen).toEqual([]);
    expect(turniere[0].name).toBe('Freitagsturnier');
    expect(turniere[0].partien[0]).toMatchObject({ a: 'Anna Probe', satzA: 3, satzB: 1, werten: true, vorgabeA: 0 });
  });

  it('lehnt fremde Dateien ab und meldet kaputte Turniere', () => {
    expect(() => dateiLesen({ serien: [] })).toThrow('keine Turnier-Datei');
    expect(() => dateiLesen({ format: 'billard-turnierdatei', formatVersion: 99, turniere: [] })).toThrow('neueren Fassung');
    const { turniere, meldungen } = dateiLesen({
      format: 'billard-turnierdatei',
      formatVersion: 1,
      turniere: [
        { name: 'Ohne Datum', kennung: 'x' },
        { ...turnier, partien: [...turnier.partien, { a: 'Anna Probe', b: '', satzA: 1, satzB: 0 }] }
      ]
    });
    expect(turniere).toHaveLength(1);
    expect(turniere[0].partien).toHaveLength(1);
    expect(meldungen).toHaveLength(2);
  });

  it('Kennung bleibt beim Weiterreichen erhalten', () => {
    expect(kennungVon({ id: 'u1', quelle: null, alt_id: null })).toBe('cuedesk:u1');
    expect(kennungVon({ id: 'u1', quelle: 'import', alt_id: 'idmv1' })).toBe('turnierpilot:idmv1');
    expect(kennungVon({ id: 'u1', quelle: 'import', alt_id: 'turnierpilot:x' })).toBe('turnierpilot:x');
    expect(kennungVon({ id: 'u1', quelle: 'import', alt_id: 'excel:s:2026-01-01' })).toBe('cuedesk:u1');
    expect(altIdsZu('turnierpilot:x')).toEqual(['turnierpilot:x', 'x']);
    expect(eigeneId('cuedesk:u1')).toBe('u1');
    expect(eigeneId('turnierpilot:x')).toBeNull();
  });

  it('Phasen hin und zurueck', () => {
    expect(phaseText('gruppe', 'A')).toBe('Gruppe A');
    expect(phaseText('ko', 'sf2')).toBe('Halbfinale');
    expect(phaseText('phase2', null)).toBe('Platzierung');
    const z = new Map<string, number>();
    expect(phaseAusText('Gruppe B', z)).toEqual({ phase: 'gruppe', gruppe: 'B' });
    expect(phaseAusText('Gruppe', z)).toEqual({ phase: 'gruppe', gruppe: null });
    expect(phaseAusText('Halbfinale', z)).toEqual({ phase: 'ko', gruppe: 'sf1' });
    expect(phaseAusText('Halbfinale', z)).toEqual({ phase: 'ko', gruppe: 'sf2' });
    expect(phaseAusText('Spiel um Platz 3', z)).toEqual({ phase: 'ko', gruppe: 'bro' });
    expect(phaseAusText('Platzierung', z)).toEqual({ phase: 'phase3', gruppe: null });
  });

  it('Disziplin, Dateiname und Namen', () => {
    expect(disziplinText('14-1')).toBe('14.1');
    expect(disziplinAusText('Multi-Ball')).toBe('multi-ball');
    expect(disziplinAusText('Snooker')).toBeNull();
    expect(dateiname([turnier])).toBe('turnier_2026-10-24_Freitagsturnier.json');
    expect(namenVon(turnier)).toEqual(['Anna Probe', 'Bernd Beispiel']);
  });
});
