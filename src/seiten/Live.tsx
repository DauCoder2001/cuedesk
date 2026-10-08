import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { KEIN_LIVE_TEXT, dauerText, einzelspielAusStand, kachel, liveAktiv, nichtGespeichert } from '../live';
import { schutzwortPruefen } from '../schutzwort';
import { datumText } from '../auskunft';
import type { Kachel, PoolDisziplin } from '../live';
import type { Geraet, Tisch } from '../datenbank.types';

// Live-Tische: eine Kachel je aktivem Tisch, aktualisiert sich bei jedem
// Stoss am Tablet (Realtime auf live_stand). Sichtbar fuer alle Mitglieder.

type Stand = { zustand: unknown; aktualisiert: string };

// Eine Bitte ums Neuladen gilt nach fuenf Minuten als erledigt - falls die
// Quittung des Tablets einmal nicht ankommt, haengt die Anzeige nicht fest.
const BITTE_GILT_MS = 5 * 60 * 1000;

const DISZIPLIN_TEXT: Record<string, string> = { '8-ball': '8-Ball', '9-ball': '9-Ball', '10-ball': '10-Ball', '14-1': '14.1' };
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
  const [turnierDisziplin, setTurnierDisziplin] = useState<string | null>(null); // fuer Turnierspiele ohne eigene Disziplin
  // Liegengebliebener, nie gespeicherter Stand: ohne Tablet speichern oder verwerfen
  const [offenFrage, setOffenFrage] = useState<{
    tisch: Tisch;
    stand: Stand;
    k: NonNullable<ReturnType<typeof nichtGespeichert>>;
    art: 'speichern' | 'verwerfen';
  } | null>(null);
  const [disziplin, setDisziplin] = useState<PoolDisziplin | ''>('');
  const [arbeitet, setArbeitet] = useState(false);

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;

    // Staende komplett neu lesen: auch beim Ein- und Ausschalten der
    // Live-Uebertragung, denn dann aendert sich, was die Datenbank liefert.
    const staendeLaden = async () => {
      const [standAntwort, turnierAntwort] = await Promise.all([
        supabase.from('live_stand').select('tisch_id, zustand, aktualisiert').eq('verein_id', verein.id),
        supabase.from('turniere').select('status, einstellungen, disziplin, modus').eq('verein_id', verein.id).eq('status', 'laeuft')
      ]);
      if (vorbei) return;
      const neu: Record<string, Stand> = {};
      (standAntwort.data ?? []).forEach((z) => {
        neu[z.tisch_id] = { zustand: z.zustand, aktualisiert: z.aktualisiert };
      });
      setStaende(neu);
      setLiveAn(liveAktiv(turnierAntwort.data ?? []));
      setTurnierLaeuft((turnierAntwort.data ?? []).length > 0);
      // Disziplin eines laufenden Turniers (nicht Liga: dort steht sie je Partie im Stand)
      const turnier = (turnierAntwort.data ?? []).find((t) => t.modus !== 'liga' && t.disziplin !== 'multi-ball');
      setTurnierDisziplin(turnier ? DISZIPLIN_TEXT[turnier.disziplin] ?? null : null);
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
            // Liegengeblieben, aber nie gespeichert: Die Turnierleitung soll es merken
            const offen = darfLeiten && stand ? nichtGespeichert(stand.zustand, stand.aktualisiert) : null;
            if (offen) k = offen;
            return (
            <Tischkachel
              key={tisch.id}
              tisch={tisch}
              k={k}
              turnierLaeuft={turnierLaeuft}
              turnierDisziplin={turnierDisziplin}
              tischform
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
              ungespeichertSeit={offen ? stand!.aktualisiert : null}
              ungespeichert={
                offen
                  ? {
                      speichern: einzelspielAusStand(stand!.zustand, stand!.aktualisiert, '9-ball', verein.id, tisch.id)
                        ? () => offenOeffnen(tisch, stand!, offen, 'speichern')
                        : null,
                      verwerfen: () => offenOeffnen(tisch, stand!, offen, 'verwerfen')
                    }
                  : null
              }
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
      {offenFrage && (
        <div className="dialoghintergrund" onClick={() => !arbeitet && setOffenFrage(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{offenFrage.art === 'speichern' ? 'Ergebnis speichern' : 'Stand verwerfen'}</h2>
            <p>
              Tisch {offenFrage.tisch.nummer}: {offenFrage.k.spieler1} {offenFrage.k.stand1} : {offenFrage.k.stand2}{' '}
              {offenFrage.k.spieler2}
              {offenFrage.k.raceTo !== null ? `, Race to ${offenFrage.k.raceTo}` : ''}, Stand vom{' '}
              {datumText(offenFrage.stand.aktualisiert, true)} Uhr.
            </p>
            {offenFrage.art === 'speichern' ? (
              <>
                <p>
                  Gespeichert wird als Einzelspiel{offenFrage.k.laeuft ? ', abgebrochen, weil das Race nicht erreicht ist' : ''}.
                  Für das Rating zählt es nicht. Danach ist der Tisch frei.
                </p>
                <div className="felder">
                  <label className="feld s">
                    <span>Disziplin</span>
                    <select value={disziplin} onChange={(e) => setDisziplin(e.target.value as PoolDisziplin | '')}>
                      <option value="">bitte wählen</option>
                      <option value="8-ball">8-Ball</option>
                      <option value="9-ball">9-Ball</option>
                      <option value="10-ball">10-Ball</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <p>Der Stand wird gelöscht und nicht gespeichert. Danach ist der Tisch frei.</p>
            )}
            {fehler && <p className="fehler">{fehler}</p>}
            <div className="zeile">
              {offenFrage.art === 'speichern' ? (
                <button type="button" disabled={arbeitet || !disziplin} onClick={() => void offenErledigen()}>
                  Speichern
                </button>
              ) : (
                <button type="button" className="gefahrknopf" disabled={arbeitet} onClick={() => void offenErledigen()}>
                  Verwerfen
                </button>
              )}
              <button type="button" disabled={arbeitet} onClick={() => setOffenFrage(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function offenOeffnen(tisch: Tisch, stand: Stand, k: NonNullable<ReturnType<typeof nichtGespeichert>>, art: 'speichern' | 'verwerfen') {
    const vorgabe = (stand.zustand as { disziplin?: unknown } | null)?.disziplin;
    setDisziplin(vorgabe === '8-ball' || vorgabe === '9-ball' || vorgabe === '10-ball' ? vorgabe : '');
    setFehler(null);
    setMeldung(null);
    setOffenFrage({ tisch, stand, k, art });
  }

  // Liegengebliebenen Stand ohne Tablet erledigen: speichern oder verwerfen,
  // in beiden Faellen ist der Tisch danach frei.
  async function offenErledigen() {
    if (!offenFrage || !verein) return;
    const { tisch, stand, art } = offenFrage;
    setArbeitet(true);
    setFehler(null);
    if (art === 'speichern') {
      const zeile = disziplin ? einzelspielAusStand(stand.zustand, stand.aktualisiert, disziplin, verein.id, tisch.id) : null;
      if (!zeile) {
        setArbeitet(false);
        return setFehler('Dieses Spiel lässt sich nur am Tablet speichern.');
      }
      const { error } = await supabase.from('partien').insert(zeile);
      if (error) {
        setArbeitet(false);
        return setFehler(error.message);
      }
    }
    const { error } = await supabase.from('live_stand').delete().eq('tisch_id', tisch.id);
    setArbeitet(false);
    if (error) {
      return setFehler(
        art === 'speichern' ? `Gespeichert, aber der Tisch ist noch belegt: ${error.message}` : error.message
      );
    }
    setStaende((bisher) => {
      const kopie = { ...bisher };
      delete kopie[tisch.id];
      return kopie;
    });
    setOffenFrage(null);
    setMeldung(
      art === 'speichern'
        ? `Tisch ${tisch.nummer}: Ergebnis als Einzelspiel gespeichert, der Tisch ist frei.`
        : `Tisch ${tisch.nummer}: Stand verworfen, der Tisch ist frei.`
    );
  }

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

// Rahmen der Tischform: sechs Taschen, je Langbande sechs und je Kopfbande drei
// Diamanten (Positionen in Prozent, damit sie bei jeder Kachelbreite passen)
// (Masse passend zu .tischform in stil.css: Spielflaeche 16px innen, Taschen 16px)
const TASCHEN: CSSProperties[] = [{ top: 8 }, { bottom: 8 }].flatMap((hoehe) => [
  { ...hoehe, left: 8 },
  { ...hoehe, left: 'calc(50% - 8px)' },
  { ...hoehe, right: 8 }
]);
const DIAMANTEN: CSSProperties[] = [
  ...[12.5, 25, 37.5, 62.5, 75, 87.5].flatMap((x) => [
    { left: `calc(${x}% - 2.5px)`, top: 4.5 },
    { left: `calc(${x}% - 2.5px)`, bottom: 4.5 }
  ]),
  ...[25, 50, 75].flatMap((y) => [
    { top: `calc(${y}% - 2.5px)`, left: 4.5 },
    { top: `calc(${y}% - 2.5px)`, right: 4.5 }
  ])
];

function Tischrahmen() {
  return (
    <>
      {TASCHEN.map((stil, i) => (
        <span key={`t${i}`} className="tasche" style={stil} aria-hidden="true" />
      ))}
      {DIAMANTEN.map((stil, i) => (
        <span key={`d${i}`} className="diamant" style={stil} aria-hidden="true" />
      ))}
    </>
  );
}

// Auch auf der Zuschauerseite und dem oeffentlichen Live-Link (ZuschauenTeile.tsx), dort ohne Knoepfe
export function Tischkachel({
  tisch,
  k,
  neuLaden,
  laedtNeu,
  tabletAus,
  turnierLaeuft,
  tischform = false,
  turnierDisziplin = null,
  ungespeichertSeit = null,
  ungespeichert = null,
  protokollLink = true
}: {
  tisch: Tisch;
  k: Kachel;
  neuLaden: (() => void) | null;
  laedtNeu: boolean;
  tabletAus: boolean;
  turnierLaeuft: boolean; // dann bekommt ein Spiel ohne Turnierpartie die Marke "Freies Spiel" (wie am TV)
  tischform?: boolean; // Kachel als Billardtisch zeichnen (Live und Zuschauen)
  turnierDisziplin?: string | null; // Disziplin des laufenden Turniers, wenn der Stand keine eigene hat
  ungespeichertSeit?: string | null; // liegengebliebener Stand, Ergebnis nie gespeichert (nur Turnierleitung)
  ungespeichert?: { speichern: (() => void) | null; verwerfen: () => void } | null; // Knoepfe dazu
  protokollLink?: boolean; // "Protokoll live" bei 14.1; nicht auf dem oeffentlichen Live-Link
}) {
  const klasse = tischform ? 'livekachel tischform' : 'livekachel';
  const rahmen = tischform && <Tischrahmen />;
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
      <div className={klasse}>
        {rahmen}
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
    <div className={klasse}>
      {rahmen}
      <div className="livekopf">
        <span>
          {titel}
          <span className="marke">{k.disziplin ?? (k.turnierspiel ? turnierDisziplin : null) ?? 'Pool'}</span>
          {k.raceTo !== null && <span className="marke">Race to {k.raceTo}</span>}
          {turnierLaeuft && !k.turnierspiel && <span className="marke frei">Freies Spiel</span>}
        </span>
        {ungespeichertSeit ? (
          <span className="marke warnmarke">nicht gespeichert</span>
        ) : (
          <span className={k.laeuft ? 'livelaeuft' : ''}>{k.laeuft ? `● ${dauerText(k.seit)}` : 'beendet'}</span>
        )}
      </div>
      <div className="livestand">
        <span className="rot rechts">{k.spieler1}</span>
        <span className="zahl">
          <span className="rot">{k.stand1}</span> : <span className="blau">{k.stand2}</span>
        </span>
        <span className="blau">{k.spieler2}</span>
      </div>
      {ungespeichertSeit && (
        <div className="livefuss ungespeichert">
          Ergebnis nicht gespeichert, Stand vom {datumText(ungespeichertSeit, true)} Uhr.
        </div>
      )}
      <div className="livefuss">
        {k.hinweis}
        {k.ziel ? ` · ${k.ziel}` : ''}
        {k.art === '14.1' && protokollLink && (
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
      {ungespeichert ? (
        <div className="livefuss livefussknoepfe">
          <span>
            {ungespeichert.speichern && (
              <button type="button" className="klein" onClick={ungespeichert.speichern}>
                Ergebnis speichern
              </button>
            )}
            <button type="button" className="klein" onClick={ungespeichert.verwerfen}>
              Verwerfen
            </button>
          </span>
          {knopf}
        </div>
      ) : (
        knopf && <div className="livefuss rechts">{knopf}</div>
      )}
    </div>
  );
}
