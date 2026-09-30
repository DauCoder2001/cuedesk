import { useMemo, useState } from 'react';
import { useSitzung } from '../sitzung';
import { herunterladen } from '../pdf';
import { dateiName, handbuchPdf, handoutPdf, suchen, themenFuer } from '../hilfe';
import { THEMEN } from '../hilfe-texte';
import type { Block, Teil, Thema } from '../hilfe';

// Hilfe (Knopf "?" oben rechts): Themen nach Rolle, Suche, Handout je Thema
// und Benutzerhandbuch als PDF. Texte in hilfe/*.md, Rechnung in src/hilfe.ts.

const ROLLEN_TEXT: Record<string, string> = {
  vereinsadmin: 'Vereins-Administrator',
  sportwart: 'Sportwart',
  turnierleiter: 'Turnierleiter',
  mitglied: 'Mitglied'
};

function Inline({ teile }: { teile: Teil[] }) {
  return (
    <>
      {teile.map((t, i) =>
        t.art === 'fett' ? (
          <strong key={i}>{t.text}</strong>
        ) : t.art === 'code' ? (
          <code key={i}>{t.text}</code>
        ) : t.art === 'link' && /^https?:\/\//.test(t.ziel) ? (
          <a key={i} href={t.ziel} target="_blank" rel="noreferrer">
            {t.text}
          </a>
        ) : (
          <span key={i}>{t.text}</span>
        )
      )}
    </>
  );
}

function Bloecke({ bloecke }: { bloecke: Block[] }) {
  return (
    <>
      {bloecke.map((b, i) => {
        if (b.art === 'h2') return <h3 key={i}><Inline teile={b.teile} /></h3>;
        if (b.art === 'h3') return <h4 key={i}><Inline teile={b.teile} /></h4>;
        if (b.art === 'p') return <p key={i}><Inline teile={b.teile} /></p>;
        const Liste = b.art === 'ol' ? 'ol' : 'ul';
        return (
          <Liste key={i}>
            {b.punkte.map((p, k) => (
              <li key={k}>
                <Inline teile={p} />
              </li>
            ))}
          </Liste>
        );
      })}
    </>
  );
}

export default function Hilfe({ startThema }: { startThema: string | null }) {
  const { verein, rollen, istSuperAdmin } = useSitzung();
  const { eigene, weitere } = useMemo(() => themenFuer(THEMEN, rollen, istSuperAdmin), [rollen, istSuperAdmin]);
  const [offen, setOffen] = useState<string>(startThema ?? eigene[0]?.id ?? THEMEN[0]?.id ?? '');
  const [begriff, setBegriff] = useState('');
  const [alleZeigen, setAlleZeigen] = useState(false);

  const vereinName = verein?.name ?? 'CueDesk';
  const treffer = begriff.trim() ? suchen(THEMEN, begriff) : null;
  const thema: Thema | null = THEMEN.find((t) => t.id === offen) ?? null;
  const rolle = rollen.map((r) => ROLLEN_TEXT[r]).filter(Boolean)[0] ?? (istSuperAdmin ? 'Super-Admin' : 'ohne Rolle');

  const liste = (themen: Thema[]) => (
    <ul className="hilfeliste">
      {themen.map((t) => (
        <li key={t.id}>
          <button type="button" className={t.id === offen ? 'aktiv' : ''} onClick={() => setOffen(t.id)}>
            {t.titel}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <h2>Hilfe</h2>
          <div className="knopfpaar">
            <button type="button" title="Alle Themen hintereinander lesen" onClick={() => setOffen('handbuch')}>
              Benutzerhandbuch
            </button>
            <button
              type="button"
              title="Das Benutzerhandbuch mit allen Themen als PDF herunterladen"
              onClick={() => herunterladen(handbuchPdf(THEMEN, vereinName), 'CueDesk-Benutzerhandbuch.pdf')}
            >
              Handbuch (PDF)
            </button>
          </div>
        </div>
        <div className="hilfe">
          <nav className="hilfethemen" aria-label="Hilfethemen">
            <input
              type="search"
              placeholder="Suchen …"
              aria-label="Hilfe durchsuchen"
              value={begriff}
              onChange={(e) => setBegriff(e.target.value)}
            />
            {treffer ? (
              <>
                <h4>Treffer</h4>
                {treffer.length ? liste(treffer) : <p className="hinweis">Nichts gefunden.</p>}
              </>
            ) : (
              <>
                <h4>Für dich ({rolle})</h4>
                {liste(eigene)}
                {weitere.length > 0 && (
                  <>
                    <button type="button" className="klein" onClick={() => setAlleZeigen((x) => !x)}>
                      {alleZeigen ? 'Weitere Themen ausblenden' : `Alle Themen (${weitere.length} weitere)`}
                    </button>
                    {alleZeigen && liste(weitere)}
                  </>
                )}
              </>
            )}
          </nav>
          <article className="hilfetext">
            {offen === 'handbuch' ? (
              <>
                <h2>Benutzerhandbuch</h2>
                {suchen(THEMEN, '').map((t) => (
                  <section key={t.id} className="hilfekapitel">
                    <h2>{t.titel}</h2>
                    <Bloecke bloecke={t.bloecke} />
                  </section>
                ))}
              </>
            ) : thema ? (
              <>
                <div className="bearbeitenkopf">
                  <h2>{thema.titel}</h2>
                  <button
                    type="button"
                    className="klein"
                    title="Dieses Thema als PDF zum Ausdrucken herunterladen"
                    onClick={() => herunterladen(handoutPdf(thema, vereinName), dateiName(thema.titel))}
                  >
                    Handout (PDF)
                  </button>
                </div>
                <Bloecke bloecke={thema.bloecke} />
              </>
            ) : (
              <p className="hinweis">Noch kein Hilfethema vorhanden.</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
