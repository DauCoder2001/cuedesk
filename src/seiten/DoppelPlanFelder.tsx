import type { DoppelDisziplin } from '../liga';

// Partienliste der Doppel-Begegnung (Spass-Liga): Disziplin und Race to je
// Partie. Gebraucht beim Anlegen des Spieltags und beim nachtraeglichen
// Hinzufuegen in der Liga-Ansicht.

// herkunft: Nummer der Partie vor dem Aendern (fehlt bei neuen Zeilen), damit
// vorhandene Partien beim Speichern ihrer Zeile folgen
export type DoppelZeile = { disziplin: DoppelDisziplin; ziel: string; herkunft?: number };

export const DOPPEL_ZEILEN_STANDARD: DoppelZeile[] = [
  { disziplin: '8-ball', ziel: '4' },
  { disziplin: '10-ball', ziel: '4' }
];

export default function DoppelPlanFelder({
  zeilen,
  aendern
}: {
  zeilen: DoppelZeile[];
  aendern: (neu: DoppelZeile[]) => void;
}) {
  const setzen = (i: number, teil: Partial<DoppelZeile>) =>
    aendern(zeilen.map((z, j) => (j === i ? { ...z, ...teil } : z)));
  return (
    <div className="doppelplan">
      <table className="tabelle kompakt">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Disziplin</th>
            <th>Race to</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <select value={z.disziplin} onChange={(e) => setzen(i, { disziplin: e.target.value as DoppelDisziplin })}>
                  <option value="8-ball">8-Ball</option>
                  <option value="9-ball">9-Ball</option>
                  <option value="10-ball">10-Ball</option>
                </select>
              </td>
              <td>
                <input
                  className="kurz"
                  inputMode="numeric"
                  required
                  value={z.ziel}
                  onChange={(e) => setzen(i, { ziel: e.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="klein"
                  title="Diese Doppel-Partie entfernen"
                  disabled={zeilen.length <= 1}
                  onClick={() => aendern(zeilen.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="klein"
        disabled={zeilen.length >= 12}
        onClick={() => {
          const vorlage = zeilen[zeilen.length - 1] ?? DOPPEL_ZEILEN_STANDARD[0];
          aendern([...zeilen, { disziplin: vorlage.disziplin, ziel: vorlage.ziel }]);
        }}
      >
        + Partie
      </button>
    </div>
  );
}
