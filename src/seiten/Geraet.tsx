import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import type { Geraet as GeraetZeile, Tisch, Verein } from '../datenbank.types';

// Ansicht auf dem Tablet. Das Geraet meldet sich anonym an, zeigt einen
// Kopplungscode und wechselt von selbst auf die Tischansicht, sobald es
// der Vereins-Administrator gekoppelt hat.

export default function Geraet() {
  const [bereit, setBereit] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [geraet, setGeraet] = useState<GeraetZeile | null>(null);
  const [verein, setVerein] = useState<Verein | null>(null);
  const [tische, setTische] = useState<Tisch[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const laeuft = useRef(false);

  const standPruefen = useCallback(async () => {
    const { data: konto } = await supabase.auth.getUser();
    if (!konto?.user) return;

    const { data: zeile } = await supabase
      .from('geraete')
      .select('*')
      .eq('auth_id', konto.user.id)
      .maybeSingle();

    setGeraet(zeile ?? null);

    if (zeile) {
      const [vereinAntwort, tischAntwort] = await Promise.all([
        supabase.from('vereine').select('*').eq('id', zeile.verein_id).maybeSingle(),
        supabase.from('tische').select('*').eq('verein_id', zeile.verein_id).eq('aktiv', true).order('nummer')
      ]);
      setVerein(vereinAntwort.data ?? null);
      setTische(tischAntwort.data ?? []);
      await supabase.rpc('geraet_meldet_sich');
      setCode(null);
    } else if (!code) {
      const { data: neuerCode, error } = await supabase.rpc('kopplung_anfordern');
      if (error) setFehler(error.message);
      else setCode(neuerCode as string);
    }
  }, [code]);

  useEffect(() => {
    if (laeuft.current) return;
    laeuft.current = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          setFehler(
            'Anmeldung des Geräts nicht möglich. Anonyme Anmeldungen müssen eingeschaltet sein.'
          );
          setBereit(true);
          return;
        }
      }
      await standPruefen();
      setBereit(true);
    })();
  }, [standPruefen]);

  // Gekoppelt meldet sich das Geraet jede Minute, ungekoppelt schaut es alle
  // zehn Sekunden nach der Kopplung. Im Hintergrund ruht die Abfrage, damit
  // ein vergessener Reiter nicht dauernd Anfragen stellt.
  useEffect(() => {
    const uhr = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') void standPruefen();
      },
      geraet ? 60000 : 10000
    );
    return () => window.clearInterval(uhr);
  }, [standPruefen, geraet]);

  async function neuerCode() {
    setCode(null);
    const { data, error } = await supabase.rpc('kopplung_anfordern');
    if (error) setFehler(error.message);
    else setCode(data as string);
  }

  async function tischWechseln(tischId: string) {
    const { error } = await supabase.rpc('geraet_tisch_setzen', { p_tisch: tischId || null });
    if (error) {
      setFehler(error.message);
      return;
    }
    await standPruefen();
  }

  if (!bereit) return <div className="geraet"><p className="hinweis">Lädt.</p></div>;

  const tisch = tische.find((eintrag) => eintrag.id === geraet?.tisch_id) ?? null;

  return (
    <div className="geraet">
      <div className="geraetkarte">
        {geraet ? (
          <>
            <div className="klein">{verein?.name ?? 'CueDesk'}</div>
            <div className="gross">{tisch ? `Tisch ${tisch.nummer}` : 'Kein Tisch'}</div>
            <div className="klein">
              {tisch?.bezeichnung ? `${tisch.bezeichnung} · ` : ''}
              {geraet.name}
            </div>
            <label className="feld mittig">
              <span>Tisch wechseln</span>
              <select value={geraet.tisch_id ?? ''} onChange={(e) => void tischWechseln(e.target.value)}>
                <option value="">kein Tisch</option>
                {tische.map((eintrag) => (
                  <option key={eintrag.id} value={eintrag.id}>
                    Tisch {eintrag.nummer}
                    {eintrag.bezeichnung ? ` — ${eintrag.bezeichnung}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {tisch ? (
              <div className="spielwahl">
                <a
                  className="spielknopf pool"
                  href={`${import.meta.env.BASE_URL}scoreboards/Pool_Scoreboard.html?table=${tisch.nummer}`}
                >
                  8/9/10-Ball
                </a>
                <a
                  className="spielknopf vierzehn"
                  href={`${import.meta.env.BASE_URL}scoreboards/14.1_Scoreboard.html?table=${tisch.nummer}`}
                >
                  14.1 endlos
                </a>
              </div>
            ) : (
              <p className="hinweis">Zum Spielen zuerst einen Tisch wählen.</p>
            )}
          </>
        ) : (
          <>
            <div className="klein">Dieses Gerät ist noch keinem Tisch zugeordnet.</div>
            <div className="klein abstand">Code für die Kopplung</div>
            <div className="code">{code ?? '······'}</div>
            <div className="klein">gültig 15 Minuten</div>
            <button type="button" onClick={() => void neuerCode()}>
              Neuen Code anzeigen
            </button>
          </>
        )}
        {fehler && <p className="fehler">{fehler}</p>}
      </div>
    </div>
  );
}
