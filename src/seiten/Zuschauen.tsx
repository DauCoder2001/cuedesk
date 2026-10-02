import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { KEIN_LIVE_TEXT, kachel, liveAktiv } from '../live';
import { rundeText } from '../archiv';
import { vereinsEinstellungen } from '../vereinseinstellungen';
import { anzeigeWaehlen, chatAn, ligaStand, ortsTag, spiellage, tabellen } from '../zuschauen';
import { Tischkachel } from './Live';
import type { ChatBeitrag, Partie, Person, Tisch, Turnier, TurnierTeilnehmer } from '../datenbank.types';

// Zuschauerseite fuer die Mitglieder des Vereins, fuers Handy gebaut: Tische
// live, das laufende Turnier und der Chat dazu (Stufe 24). Die Rechnung steht
// in src/zuschauen.ts.

type Ansicht = 'tische' | 'turnier' | 'chat';
type Stand = { zustand: unknown; aktualisiert: string };

const CHAT_LAENGE = 300;
const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export default function Zuschauen({
  verlassen,
  verlassenText,
  hilfe
}: {
  verlassen: () => void;
  verlassenText: string;
  hilfe: () => void;
}) {
  const { verein, sitzung, darf } = useSitzung();
  const leitung = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const [ansicht, setAnsicht] = useState<Ansicht>('tische');
  const [tische, setTische] = useState<Tisch[]>([]);
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]); // der gezeigten Begegnungen bzw. des Turniers
  const [heutige, setHeutige] = useState<Partie[]>([]); // alle heute beendeten Partien des Vereins
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [beitraege, setBeitraege] = useState<ChatBeitrag[]>([]);
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [, setTakt] = useState(0);
  const chatEnde = useRef<HTMLDivElement>(null);

  const anzeige = useMemo(() => anzeigeWaehlen(turniere), [turniere]);
  const ids = anzeige ? anzeige.begegnungen.map((t) => t.id) : [];
  const idsText = ids.join(',');
  const chatTurnier = anzeige?.chatTurnier ?? null;
  const mitChat = Boolean(chatTurnier) && vereinsEinstellungen(verein?.einstellungen).chat && chatAn(chatTurnier as Turnier);
  const chatOffen = Boolean(anzeige) && anzeige!.begegnungen.some((t) => t.status === 'laeuft');

  // Tische, Stand, Turniere, Personen; Realtime auf live_stand, turniere, partien
  const turniereLaden = useCallback(async () => {
    if (!verein) return;
    const { data } = await supabase
      .from('turniere')
      .select('*')
      .eq('verein_id', verein.id)
      .or(`status.eq.laeuft,beendet_am.gte.${new Date(Date.now() - 2 * 86400000).toISOString()}`);
    setTurniere(data ?? []);
  }, [verein]);

  const heuteLaden = useCallback(async () => {
    if (!verein) return;
    const morgens = new Date();
    morgens.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('partien')
      .select('*')
      .eq('verein_id', verein.id)
      .eq('status', 'beendet')
      .gte('beendet', morgens.toISOString())
      .order('beendet', { ascending: false })
      .limit(30);
    setHeutige(data ?? []);
  }, [verein]);

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;
    // Staende komplett neu lesen, auch wenn die Live-Uebertragung umschaltet
    const staendeLaden = async () => {
      const { data } = await supabase.from('live_stand').select('tisch_id, zustand, aktualisiert').eq('verein_id', verein.id);
      if (vorbei) return;
      const neu: Record<string, Stand> = {};
      (data ?? []).forEach((z) => (neu[z.tisch_id] = { zustand: z.zustand, aktualisiert: z.aktualisiert }));
      setStaende(neu);
    };
    void (async () => {
      const [t, p] = await Promise.all([
        supabase.from('tische').select('*').eq('verein_id', verein.id).eq('aktiv', true).order('nummer'),
        supabase.from('personen').select('*').eq('verein_id', verein.id)
      ]);
      if (vorbei) return;
      setTische(t.data ?? []);
      setPersonen(p.data ?? []);
      await staendeLaden();
    })();
    void turniereLaden();
    void heuteLaden();
    const standUebernehmen = (neu: unknown) => {
      const z = neu as { tisch_id: string; zustand: unknown; aktualisiert: string };
      setStaende((b) => ({ ...b, [z.tisch_id]: { zustand: z.zustand, aktualisiert: z.aktualisiert } }));
    };
    const kanal = supabase
      .channel(`zuschauen-${verein.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${verein.id}` }, (e) =>
        standUebernehmen(e.new)
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_stand', filter: `verein_id=eq.${verein.id}` }, (e) =>
        standUebernehmen(e.new)
      )
      // Beim Loeschen liefert die Datenbank nur den Schluessel (tisch_id), ein
      // Filter auf verein_id greift dann nie - deshalb ungefiltert. Fremde
      // Tische stehen nicht in der Liste und bleiben wirkungslos.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_stand' }, (e) => {
        const alt = (e.old as { tisch_id?: string }).tisch_id;
        if (!alt) return;
        setStaende((b) => {
          if (!(alt in b)) return b;
          const k = { ...b };
          delete k[alt];
          return k;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turniere', filter: `verein_id=eq.${verein.id}` }, () => {
        void turniereLaden();
        void staendeLaden();
      })
      // Partien des gezeigten Turniers laedt der Effekt weiter unten
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partien', filter: `verein_id=eq.${verein.id}` }, () =>
        void heuteLaden()
      )
      .subscribe();
    const uhr = window.setInterval(() => setTakt((x) => x + 1), 60000);
    return () => {
      vorbei = true;
      window.clearInterval(uhr);
      void supabase.removeChannel(kanal);
    };
  }, [verein, turniereLaden, heuteLaden]);

  // Partien und Teilnehmer des gezeigten Turniers
  const [partienTakt, setPartienTakt] = useState(0);
  useEffect(() => {
    if (!verein || !idsText) {
      setPartien([]);
      setTeilnehmer([]);
      return;
    }
    let vorbei = false;
    void (async () => {
      const liste = idsText.split(',');
      const [p, t] = await Promise.all([
        supabase.from('partien').select('*').in('turnier_id', liste),
        supabase.from('turnier_teilnehmer').select('*').in('turnier_id', liste)
      ]);
      if (vorbei) return;
      setPartien(p.data ?? []);
      setTeilnehmer(t.data ?? []);
    })();
    return () => {
      vorbei = true;
    };
  }, [verein, idsText, partienTakt]);
  // Aenderung an Partien: kurz gesammelt neu laden
  useEffect(() => {
    if (!verein || !idsText) return;
    let zeitgeber: number | null = null;
    const kanal = supabase
      .channel(`zuschauen-partien-${idsText}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partien', filter: `verein_id=eq.${verein.id}` }, () => {
        if (zeitgeber !== null) window.clearTimeout(zeitgeber);
        zeitgeber = window.setTimeout(() => setPartienTakt((x) => x + 1), 300);
      })
      .subscribe();
    return () => {
      if (zeitgeber !== null) window.clearTimeout(zeitgeber);
      void supabase.removeChannel(kanal);
    };
  }, [verein, idsText]);

  // Chat: Beitraege laden und live mitlesen
  const chatId = mitChat ? chatTurnier?.id ?? null : null;
  useEffect(() => {
    if (!chatId) {
      setBeitraege([]);
      return;
    }
    let vorbei = false;
    void (async () => {
      const { data } = await supabase
        .from('chat_beitraege')
        .select('*')
        .eq('turnier_id', chatId)
        .order('erstellt_am')
        .limit(300);
      if (!vorbei) setBeitraege(data ?? []);
    })();
    const kanal = supabase
      .channel(`chat-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_beitraege', filter: `turnier_id=eq.${chatId}` }, (e) =>
        setBeitraege((b) => (b.some((x) => x.id === (e.new as ChatBeitrag).id) ? b : [...b, e.new as ChatBeitrag]))
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_beitraege' }, (e) =>
        setBeitraege((b) => b.filter((x) => x.id !== (e.old as { id: string }).id))
      )
      .subscribe();
    return () => {
      vorbei = true;
      void supabase.removeChannel(kanal);
    };
  }, [chatId]);

  useEffect(() => {
    if (ansicht === 'chat') chatEnde.current?.scrollIntoView({ block: 'end' });
  }, [ansicht, beitraege.length]);

  const name = useCallback(
    (id: string) => {
      const p = personen.find((x) => x.id === id);
      return p ? p.anzeigename || `${p.vorname} ${p.nachname}`.trim() : '?';
    },
    [personen]
  );

  async function senden() {
    if (!chatId || !text.trim()) return;
    setFehler(null);
    const { error } = await supabase.rpc('chat_schreiben', { p_turnier: chatId, p_text: text.trim() });
    if (error) return setFehler(error.message);
    setText('');
    // Falls Realtime hakt: neu laden
    const { data } = await supabase.from('chat_beitraege').select('*').eq('turnier_id', chatId).order('erstellt_am').limit(300);
    setBeitraege(data ?? []);
  }

  async function loeschen(b: ChatBeitrag) {
    setFehler(null);
    const { error } = await supabase.from('chat_beitraege').delete().eq('id', b.id);
    if (error) return setFehler(error.message);
    setBeitraege((liste) => liste.filter((x) => x.id !== b.id));
  }

  if (!verein) return <p className="hinweis">Kein Verein zugeordnet.</p>;

  const heute = ortsTag(new Date().toISOString());
  const lage = spiellage(partien, heute);
  const heuteLage = spiellage(heutige, heute);
  const turnierName = (id: string | null) => turniere.find((t) => t.id === id)?.name ?? '';
  const ergebnis = (p: Partie) => `${p.ergebnis_a ?? 0}:${p.ergebnis_b ?? 0}`;

  return (
    <div className="zuschauen">
      <div className="zuschauenkopf">
        <strong>{verein.name}</strong>
        <span className="knopfpaar">
          <button type="button" className="klein" title="Zu den übrigen Seiten von CueDesk" onClick={verlassen}>
            {verlassenText}
          </button>
          <button type="button" className="hilfeknopf" title="Hilfe zur Zuschauerseite" aria-label="Hilfe" onClick={hilfe}>
            ?
          </button>
        </span>
      </div>
      <span className="umschalter zuschauenwahl">
        <button type="button" className={ansicht === 'tische' ? 'aktiv' : ''} onClick={() => setAnsicht('tische')}>
          Tische
        </button>
        <button type="button" className={ansicht === 'turnier' ? 'aktiv' : ''} onClick={() => setAnsicht('turnier')}>
          Turnier
        </button>
        {mitChat && (
          <button type="button" className={ansicht === 'chat' ? 'aktiv' : ''} onClick={() => setAnsicht('chat')}>
            Chat{beitraege.length > 0 ? ` ${beitraege.length}` : ''}
          </button>
        )}
      </span>
      {fehler && <p className="fehler">{fehler}</p>}

      {ansicht === 'tische' && (
        <section>
          {tische.length === 0 && <p className="hinweis">Es ist noch kein Tisch angelegt.</p>}
          {/* Auch fuer die Leitung: die Seite zeigt, was Mitglieder sehen */}
          {!liveAktiv(turniere) && <p className="hinweis">{KEIN_LIVE_TEXT}</p>}
          <div className="zuschauentische">
            {liveAktiv(turniere) && tische.map((tisch) => (
              <Tischkachel
                key={tisch.id}
                tisch={tisch}
                k={kachel(staende[tisch.id]?.zustand ?? null, staende[tisch.id]?.aktualisiert ?? null)}
                neuLaden={null}
                laedtNeu={false}
                tabletAus={false}
                turnierLaeuft={turniere.some((t) => t.status === 'laeuft')}
              />
            ))}
          </div>
        </section>
      )}

      {ansicht === 'turnier' && (
        <section>
          {!anzeige ? (
            <p className="hinweis">Gerade läuft kein Turnier.</p>
          ) : (
            <>
              <h2>{anzeige.begegnungen[0].name}</h2>
              {anzeige.turnier.modus === 'liga'
                ? anzeige.begegnungen.map((b, i) => {
                    const s = ligaStand(b, partien, verein.name);
                    return (
                      <div key={b.id} className="zuschauenblock">
                        <h3>{i + 1}. Begegnung{b.status === 'beendet' ? ' ✓' : b.status === 'laeuft' ? ' · läuft' : ''}</h3>
                        <div className="zuschauenliga">
                          <span>{s.heim}</span>
                          <strong>
                            {s.partiepunkte[0]} : {s.partiepunkte[1]}
                          </strong>
                          <span>{s.gast}</span>
                        </div>
                        <p className="hinweis">
                          Partiepunkte
                          {s.matchpunkte ? ` · Matchpunkte ${s.matchpunkte[0]} : ${s.matchpunkte[1]}` : ''}
                        </p>
                      </div>
                    );
                  })
                : tabellen(anzeige.turnier, teilnehmer, partien).map((tab) => (
                    <div key={tab.gruppe ?? 'alle'} className="zuschauenblock">
                      {tab.gruppe && <h3>Gruppe {tab.gruppe}</h3>}
                      <table className="tabelle">
                        <thead>
                          <tr>
                            <th></th>
                            <th>Name</th>
                            <th className="rechts" title="Spiele">Sp</th>
                            <th className="rechts" title="Siege">S</th>
                            <th className="rechts" title="Satzdifferenz">Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tab.zeilen.map((z, i) => (
                            <tr key={z.personId}>
                              <td>{i + 1}</td>
                              <td>{name(z.personId)}</td>
                              <td className="rechts">{z.spiele}</td>
                              <td className="rechts">{z.siege}</td>
                              <td className="rechts">{z.diff > 0 ? `+${z.diff}` : z.diff}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              {partien.some((p) => p.phase === 'ko') && (
                <div className="zuschauenblock">
                  <h3>KO-Runde</h3>
                  {partien
                    .filter((p) => p.phase === 'ko')
                    .sort((a, b) => (a.runde ?? 0) - (b.runde ?? 0) || (a.paarung ?? 0) - (b.paarung ?? 0))
                    .map((p) => (
                      <div key={p.id} className="zuschauenspiel">
                        <span className="hinweis">{rundeText(p)}</span>
                        <span>
                          {name(p.spieler_a)} – {name(p.spieler_b)}
                        </span>
                        <span>{p.status === 'beendet' ? `${ergebnis(p)} ✓` : p.status === 'laeuft' ? 'läuft' : ''}</span>
                      </div>
                    ))}
                </div>
              )}
              {lage.laufend.length > 0 && (
                <div className="zuschauenblock">
                  <h3>Läuft gerade</h3>
                  {lage.laufend.map((p) => (
                    <div key={p.id} className="zuschauenspiel">
                      <span>
                        {name(p.spieler_a)} – {name(p.spieler_b)}
                      </span>
                      <span>{tische.find((t) => t.id === p.tisch_id) ? `Tisch ${tische.find((t) => t.id === p.tisch_id)?.nummer}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {lage.naechste.length > 0 && (
                <div className="zuschauenblock">
                  <h3>Als Nächstes</h3>
                  {lage.naechste.map((p) => (
                    <div key={p.id} className="zuschauenspiel">
                      <span>
                        {name(p.spieler_a)} – {name(p.spieler_b)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="zuschauenblock">
            <h3>Heute beendet</h3>
            {heuteLage.heute.length === 0 && <p className="hinweis">Heute ist noch keine Partie zu Ende gegangen.</p>}
            {heuteLage.heute.map((p) => (
              <div key={p.id} className="zuschauenspiel">
                <span className="hinweis">{p.beendet ? uhrzeit(p.beendet) : ''}</span>
                <span>
                  {name(p.spieler_a)} – {name(p.spieler_b)}
                  {p.turnier_id && <small className="hinweis"> · {turnierName(p.turnier_id) || 'Turnier'}</small>}
                </span>
                <strong>{ergebnis(p)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {ansicht === 'chat' && mitChat && chatTurnier && (
        <section className="zuschauenchat">
          <h2>Chat · {chatTurnier.name}</h2>
          {beitraege.length === 0 && <p className="hinweis">Noch keine Beiträge.</p>}
          {beitraege.map((b) => {
            const eigener = b.benutzer_id === sitzung?.user.id;
            return (
              <div key={b.id} className={eigener ? 'chatbeitrag eigener' : 'chatbeitrag'}>
                <div className="chatkopf">
                  <span>
                    <strong>{b.name}</strong> · {uhrzeit(b.erstellt_am)}
                  </span>
                  {(eigener || leitung) && (
                    <button
                      type="button"
                      className="klein"
                      title="Diesen Beitrag löschen"
                      aria-label={`Beitrag von ${b.name} löschen`}
                      onClick={() => void loeschen(b)}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="chattext">{b.text}</div>
              </div>
            );
          })}
          <div ref={chatEnde} />
          {chatOffen ? (
            <form
              className="chateingabe"
              onSubmit={(e) => {
                e.preventDefault();
                void senden();
              }}
            >
              <input
                value={text}
                maxLength={CHAT_LAENGE}
                placeholder={`Nachricht (höchstens ${CHAT_LAENGE} Zeichen)`}
                aria-label="Nachricht"
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" title="Nachricht senden" disabled={!text.trim()}>
                Senden
              </button>
            </form>
          ) : (
            <p className="hinweis">Das Turnier ist beendet; der Chat ist nur noch zu lesen.</p>
          )}
          <p className="hinweis">Beiträge werden 1 Tag nach Turnierende gelöscht.</p>
        </section>
      )}
    </div>
  );
}
