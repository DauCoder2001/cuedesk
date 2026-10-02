import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { KEIN_LIVE_TEXT, dauerText, kachel, liveAktiv } from '../live';
import { schutzwortPruefen } from '../schutzwort';
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

// Ein Tablet gilt als an, wenn es sich in den letzten zwei Minuten gemeldet
// hat (es meldet sich alle 30 Sekunden).
const ONLINE_MS = 2 * 60 * 1000;
const istOnline = (g: Geraet) => Boolean(g.zuletzt_gesehen) && Date.now() - Date.parse(g.zuletzt_gesehen as string) < ONLINE_MS;

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
  const [liveAn, setLiveAn] = useState<boolean | null>(null); // null: noch nicht geladen
  const [turnierLaeuft, setTurnierLaeuft] = useState(false); // fuer die Marke "Freies Spiel"

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;

    // Staende komplett neu lesen: auch beim Ein- und Ausschalten der
    // Live-Uebertragung, denn dann aendert sich, was die Datenbank liefert.
    const staendeLaden = async () => {
      const [standAntwort, turnierAntwort] = await Promise.all([
        supabase.from('live_stand').select('tisch_id, zustand, aktualisiert').eq('verein_id', verein.id),
        supabase.from('turniere').select('status, einstellungen').eq('verein_id', verein.id).eq('status', 'laeuft')
      ]);
      if (vorbei) return;
      const neu: Record<string, Stand> = {};
      (standAntwort.data ?? []).forEach((z) => {
        neu[z.tisch_id] = { zustand: z.zustand, aktualisiert: z.aktualisiert };
      });
      setStaende(neu);
      setLiveAn(liveAktiv(turnierAntwort.data ?? []));
      setTurnierLaeuft((turnierAntwort.data ?? []).length > 0);
    };

    (async () => {
      const [tischAntwort, geraetAntwort] = await Promise.all([
        supabase.from('tische').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('nummer'),
        // Die Geraeteliste sehen nur Turnierleitung und Vereins-Admin; fuer
        // alle anderen bleibt sie leer und der Knopf verschwindet.
        supabase.from('geraete').select('*').eq('verein_id', verein.id).eq('aktiv', true)
      ]);
      if (vorbei) return;
      setTische(tischAntwort.data ?? []);
      setGeraete(geraetAntwort.data ?? []);
      await staendeLaden();
    })();

    const standUebernehmen = (neu: unknown) => {
      const zeile = neu as { tisch_id: string; zustand: unknown; aktualisiert: string };
      setStaende((bisher) => ({
        ...bisher,
        [zeile.tisch_id]: { zustand: zeile.zustand, aktualisiert: zeile.aktualisiert }
      }));
    };
    const kanal = supabase
      .channel(`live-seite-${verein.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${verein.id}` },
        (ereignis) => standUebernehmen(ereignis.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${verein.id}` },
        (ereignis) => standUebernehmen(ereignis.new)
      )
      // Beim Loeschen liefert die Datenbank nur den Schluessel (tisch_id), ein
      // Filter auf verein_id greift dann nie - deshalb ungefiltert. Fremde
      // Tische stehen nicht in der Liste und bleiben wirkungslos.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_stand' }, (ereignis) => {
        const alt = ereignis.old as { tisch_id?: string };
        if (!alt.tisch_id) return;
        setStaende((bisher) => {
          if (!(alt.tisch_id! in bisher)) return bisher;
          const kopie = { ...bisher };
          delete kopie[alt.tisch_id!];
          return kopie;
        });
      })
      // Live-Uebertragung ein/aus oder Turnier gestartet/beendet: neu lesen
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turniere', filter: `verein_id=eq.${verein.id}` }, () =>
        void staendeLaden()
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
        {liveAn === false && (
          <p className="hinweis">
            {darfLeiten
              ? 'Live-Übertragung aus: Diese Spielstände sieht nur die Turnierleitung, nicht die Mitglieder und nicht der Fernseher.'
              : KEIN_LIVE_TEXT}
          </p>
        )}
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
        <div className="livetische">
          {tische.map((tisch) => {
            const amTisch = geraete.filter((g) => g.tisch_id === tisch.id);
            // Ein frisch geschriebener Spielstand ist auch ein Lebenszeichen
            const stand = staende[tisch.id];
            const standFrisch = Boolean(stand) && Date.now() - Date.parse(stand.aktualisiert) < ONLINE_MS;
            const online = amTisch.some(istOnline) || (amTisch.length > 0 && standFrisch);
            let k = kachel(staende[tisch.id]?.zustand ?? null, staende[tisch.id]?.aktualisiert ?? null);
            // "bereit" nur, wenn wirklich ein Tablet an ist - ein alter Stand
            // ohne Tablet ist bloss ein Rest.
            if (k.art === 'frei' && k.bereit && !online) k = { art: 'frei', bereit: false };
            return (
            <Tischkachel
              key={tisch.id}
              tisch={tisch}
              k={k}
              turnierLaeuft={turnierLaeuft}
              tabletAus={amTisch.length > 0 && !online}
              neuLaden={
                darfLeiten && online
                  ? () => {
                      setFehler(null);
                      setMeldung(null);
                      setWort('');
                      setFrage(tisch);
                    }
                  : null
              }
              laedtNeu={amTisch.some((g) => offeneBitte(g.neu_laden_am))}
            />
            );
          })}
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
              <button type="button" title="Lädt das Tablet an diesem Tisch neu. Der Spielstand bleibt erhalten." onClick={() => void neuLadenAusloesen()}>
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
    if (!verein || !(await schutzwortPruefen(verein.id, wort))) {
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

// Auch auf der Zuschauerseite (Zuschauen.tsx), dort ohne Knoepfe
export function Tischkachel({
  tisch,
  k,
  neuLaden,
  laedtNeu,
  tabletAus,
  turnierLaeuft
}: {
  tisch: Tisch;
  k: Kachel;
  neuLaden: (() => void) | null;
  laedtNeu: boolean;
  tabletAus: boolean;
  turnierLaeuft: boolean; // dann bekommt ein Spiel ohne Turnierpartie die Marke "Freies Spiel" (wie am TV)
}) {
  const titel = (
    <>
      Tisch {tisch.nummer}
      {tisch.bezeichnung ? ` · ${tisch.bezeichnung}` : ''}
    </>
  );
  const knopf = laedtNeu ? (
    <span className="marke">lädt neu …</span>
  ) : tabletAus ? (
    <span className="hinweis" title="Das zugeordnete Tablet hat sich seit über zwei Minuten nicht gemeldet">
      Tablet aus
    </span>
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
          {turnierLaeuft && !k.turnierspiel && <span className="marke frei">Freies Spiel</span>}
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
