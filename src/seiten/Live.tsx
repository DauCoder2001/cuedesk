import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { dauerText, kachel } from '../live';
import type { Kachel } from '../live';
import type { Tisch } from '../datenbank.types';

// Live-Tische: eine Kachel je aktivem Tisch, aktualisiert sich bei jedem
// Stoss am Tablet (Realtime auf live_stand). Sichtbar fuer alle Mitglieder.

type Stand = { zustand: unknown; aktualisiert: string };

export default function Live() {
  const { verein } = useSitzung();
  const [tische, setTische] = useState<Tisch[]>([]);
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [, setTakt] = useState(0);

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;

    (async () => {
      const [tischAntwort, standAntwort] = await Promise.all([
        supabase.from('tische').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('nummer'),
        supabase.from('live_stand').select('tisch_id, zustand, aktualisiert').eq('verein_id', verein.id)
      ]);
      if (vorbei) return;
      setTische(tischAntwort.data ?? []);
      const neu: Record<string, Stand> = {};
      (standAntwort.data ?? []).forEach((z) => {
        neu[z.tisch_id] = { zustand: z.zustand, aktualisiert: z.aktualisiert };
      });
      setStaende(neu);
    })();

    const kanal = supabase
      .channel(`live-seite-${verein.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${verein.id}` },
        (ereignis) => {
          if (ereignis.eventType === 'DELETE') {
            const alt = ereignis.old as { tisch_id: string };
            setStaende((bisher) => {
              const kopie = { ...bisher };
              delete kopie[alt.tisch_id];
              return kopie;
            });
            return;
          }
          const zeile = ereignis.new as { tisch_id: string; zustand: unknown; aktualisiert: string };
          setStaende((bisher) => ({
            ...bisher,
            [zeile.tisch_id]: { zustand: zeile.zustand, aktualisiert: zeile.aktualisiert }
          }));
        }
      )
      .subscribe();

    // Jede Minute neu zeichnen: Spieldauer und liegengebliebene Staende
    const uhr = window.setInterval(() => setTakt((t) => t + 1), 60000);

    return () => {
      vorbei = true;
      window.clearInterval(uhr);
      void supabase.removeChannel(kanal);
    };
  }, [verein]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        {tische.length === 0 && <p className="hinweis">Es ist noch kein Tisch angelegt.</p>}
        <div className="livetische">
          {tische.map((tisch) => (
            <Tischkachel
              key={tisch.id}
              tisch={tisch}
              k={kachel(staende[tisch.id]?.zustand ?? null, staende[tisch.id]?.aktualisiert ?? null)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Tischkachel({ tisch, k }: { tisch: Tisch; k: Kachel }) {
  const titel = (
    <>
      Tisch {tisch.nummer}
      {tisch.bezeichnung ? ` · ${tisch.bezeichnung}` : ''}
    </>
  );

  if (k.art === 'frei') {
    return (
      <div className="livekachel">
        <div className="livekopf">
          <span>{titel}</span>
          <span>frei</span>
        </div>
        <div className="livefrei">Kein Spiel</div>
      </div>
    );
  }

  return (
    <div className="livekachel">
      <div className="livekopf">
        <span>
          {titel}
          <span className="marke">{k.art === '14.1' ? '14.1' : 'Pool'}</span>
          {k.raceTo !== null && <span className="marke">Race to {k.raceTo}</span>}
        </span>
        <span className={k.laeuft ? 'livelaeuft' : ''}>{k.laeuft ? `● ${dauerText(k.seit)}` : 'beendet'}</span>
      </div>
      <div className="livestand">
        <span className="rot rechts">{k.spieler1}</span>
        <span className="zahl">
          <span className="rot">{k.stand1}</span> : <span className="blau">{k.stand2}</span>
        </span>
        <span className="blau">{k.spieler2}</span>
      </div>
      <div className="livefuss">
        {k.hinweis}
        {k.ziel ? ` · ${k.ziel}` : ''}
        {k.art === '14.1' && (
          <>
            {' · '}
            <a
              href={`${import.meta.env.BASE_URL}scoreboards/14.1_Log.html?table=${tisch.nummer}`}
              target="_blank"
              rel="noreferrer"
            >
              Protokoll live
            </a>
          </>
        )}
      </div>
    </div>
  );
}
