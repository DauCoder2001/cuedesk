// Platz in einer Endtabelle: Plaetze 1 bis 3 als kleine Medaille (Gold,
// Silber, Bronze) mit der Zahl darin, sonst "4.", "5." ... Die Spalte ist
// mittig ausgerichtet (stil.css .platzspalte). Medaillen nur, wenn das Ergebnis
// feststeht; im laufenden Turnier stehen ueberall Zahlen.

const FARBEN: Record<number, { flaeche: string; rand: string; schrift: string; name: string }> = {
  1: { flaeche: '#f4c542', rand: '#c99a1a', schrift: '#5a3d00', name: 'Gold' },
  2: { flaeche: '#d5d9de', rand: '#9aa1a9', schrift: '#3c4248', name: 'Silber' },
  3: { flaeche: '#d99a5b', rand: '#a8692e', schrift: '#5a2e0a', name: 'Bronze' }
};

export default function Platz({ platz, medaille }: { platz: number | null | undefined; medaille: boolean }) {
  if (platz === null || platz === undefined) return null;
  const f = FARBEN[platz];
  if (!medaille || !f) return <span className="platzzahl">{platz}.</span>;
  return (
    <svg className="medaille" viewBox="0 0 24 30" width="20" height="25" role="img" aria-label={`Platz ${platz} (${f.name})`}>
      <title>{`Platz ${platz}`}</title>
      <path d="M6 0h5l2 9H8z" fill="#3b6fd8" />
      <path d="M13 0h5l-2 9h-5z" fill="#2c56b0" />
      <circle cx="12" cy="19" r="9" fill={f.flaeche} stroke={f.rand} strokeWidth="1.5" />
      <text x="12" y="22.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={f.schrift}>
        {platz}
      </text>
    </svg>
  );
}
