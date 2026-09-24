// Ein einfaches Wort schuetzt die Stellen, die am Tisch niemand versehentlich
// ausloesen soll: die verdeckte Aufstellung und das Neuladen eines Tablets.
// Es haelt keinen Angreifer auf, nur den schnellen Griff daneben.

export const SCHUTZWORT = '8-ball';

export function schutzwortStimmt(eingabe: string): boolean {
  return eingabe.trim().toLowerCase() === SCHUTZWORT;
}
