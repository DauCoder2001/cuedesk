import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { dauerText, kachel } from '../live';
import { schutzwortStimmt } from '../schutzwort';
import type { Kachel } from '../live';
import type { Geraet, Tisch } from '../datenbank.types';

// Live-Tische: eine Kachel je aktivem Tisch, aktualisiert sich bei jedem
// Stoss am Tablet (Realtime auf live_stand). Sichtbar fuer alle Mitglieder.

type Stand = { zustand: unknown; aktualisiert: string };

// Eine Bitte ums Neuladen gilt nach fuenf Minuten als erledigt - falls die
// Quittung des Tablets einmal nicht ankommt, haengt die Anzeige nicht fest.
const BITTE_GILT_MS = 5 * 60 * 1000;
const offeneBitte = (zeitpunkt: string | null) =>
  Boolean(zeitpunkt) && Date.now() - Date.parse(zeitpunkt as string) < BITTE_GILT_MS;

export default function Live() {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const [tische, setTische] = useState<Tisch[]>([]);
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [geraete, setGeraete] = useState<Geraet[]>([]);
  const [frage, setFrage] = useState<Tisch | null>(null); // Tisch, dessen Tablet neu laden soll
  const [wort, setWort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [, setTakt] = useState(0);

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;

    (async () => {
      const [tischAntwort, standAntwort, geraetAntwort] = await Promise.all([
        supabase.from('tische').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('nummer'),
        supabase.from('live_stand').select('tisch_id, zustand, aktualisiert').eq('verein_id', verein.id),
        // Die Geraeteliste sehen nur Turnierleitung und Vereins-Admin; fuer
        // alle anderen bleibt sie leer und der Knopf verschwindet.
        supabase.from('geraete').select('*').eq('verein_id', verein.id).eq('aktiv', true)
      ]);
      if (vorbei) return;
      setTische(tischAntwort.data ?? []);
      setGeraete(geraetAntwort.data ?? []);
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

    // Die Geraete oefter nachsehen: so ist zu sehen, ob ein Tablet die Bitte
    // ums Neuladen schon erledigt hat.
    const geraeteUhr = window.setInterval(async () => {
      const { data } = await supabase.from('geraete').select('*').eq('verein_id', verein.id).eq('aktiv', true);
      if (!vorbei && data) setGeraete(data);
    }, 15000);

    return () => {
      vorbei = true;
      window.clearInterval(uhr);
      window.clearInterval(geraeteUhr);
      void supabase.removeChannel(kanal);
    };
  }, [verein]);

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  return (
    <div className="einspaltig">
      <section className="block">
        {tische.length === 0 && <p className="hinweis">Es ist noch kein Tisch angelegt.</p>}
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
        <div className="livetische">
          {tische.map((tisch) => (
            <Tischkachel
              key={tisch.id}
              tisch={tisch}
              k={kachel(staende[tisch.id]?.zustand ?? null, staende[tisch.id]?.aktualisiert ?? null)}
              neuLaden={
                darfLeiten && geraete.some((g) => g.tisch_id === tisch.id)
                  ? () => {
                      setFehler(null);
                      setMeldung(null);
                      setWort('');
                      setFrage(tisch);
                    }
                  : null
              }
              laedtNeu={geraete.some((g) => g.tisch_id === tisch.id && offeneBitte(g.neu_laden_am))}
            />
          ))}
        </div>
      </section>
      {frage && (
        <div className="dialoghintergrund" onClick={() => setFrage(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Tablet neu laden</h2>
            <p>
              Das Tablet an Tisch {frage.nummer} lädt die Seite neu. Ein laufendes Spiel bleibt erhalten, es kommt
              danach aus der Cloud zurück. Bis zu 30 Sekunden kann es dauern.
            </p>
            <div className="zeile">
              <input
                type="password"
                placeholder="Passwort"
                value={wort}
                autoFocus
                onChange={(e) => setWort(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void neuLadenAusloesen()}
              />
              <button type="button" onClick={() => void neuLadenAusloesen()}>
                Neu laden
              </button>
            </div>
            <button type="button" onClick={() => setFrage(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Bitte an alle Tablets dieses Tisches
  async function neuLadenAusloesen() {
    if (!frage) return;
    if (!schutzwortStimmt(wort)) {
      setFehler('Das Passwort stimmt nicht.');
      return;
    }
    const betroffen = geraete.filter((g) => g.tisch_id === frage.id);
    const tischNummer = frage.nummer;
    setFrage(null);
    setFehler(null);
    const { error } = await supabase
      .from('geraete')
      .update({ neu_laden_am: new Date().toISOString() })
      .in(
        'id',
        betroffen.map((g) => g.id)
      );
    if (error) return setFehler(error.message);
    setMeldung(
      betroffen.length === 1
        ? `Tisch ${tischNummer}: Das Tablet lädt in den nächsten 30 Sekunden neu.`
        : `Tisch ${tischNummer}: ${betroffen.length} Tablets laden in den nächsten 30 Sekunden neu.`
    );
  }
}

function Tischkachel({
  tisch,
  k,
  neuLaden,
  laedtNeu
}: {
  tisch: Tisch;
  k: Kachel;
  neuLaden: (() => void) | null;
  laedtNeu: boolean;
}) {
  const titel = (
    <>
      Tisch {tisch.nummer}
      {tisch.bezeichnung ? ` · ${tisch.bezeichnung}` : ''}
    </>
  );
  const knopf = laedtNeu ? (
    <span className="marke">lädt neu …</span>
  ) : (
    neuLaden && (
      <button type="button" className="klein" onClick={neuLaden} title="Das Tablet an diesem Tisch neu laden">
        Neu laden
      </button>
    )
  );

  if (k.art === 'frei') {
    return (
      <div className="livekachel">
        <div className="livekopf">
          <span>{titel}</span>
          <span>{k.bereit ? 'bereit' : 'frei'}</span>
        </div>
        <div className="livefrei">{k.bereit ? 'Tablet bereit, noch kein Spiel' : 'Kein Spiel'}</div>
        {knopf && <div className="livefuss rechts">{knopf}</div>}
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
      {knopf && <div className="livefuss rechts">{knopf}</div>}
    </div>
  );
}
