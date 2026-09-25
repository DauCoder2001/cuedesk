import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { useRueckfrage } from '../rueckfrage';
import { ANWENDUNGSADRESSE } from '../adresse';
import {
  DATENBANK_GRENZE_BYTES,
  adresseAusName,
  groesseText,
  ratingWarnung,
  sicherungsWarnung
} from '../mandanten';
import { AUFRAEUMEN_ARTEN, datumText, loeschStand } from '../datenpflege';
import type { AufraeumenArt, AufraeumenZahlen } from '../datenpflege';
import { exportHerunterladen } from '../vereinExport';
import { Pflichthinweis, usePflicht } from '../pflicht';
import type {
  Benutzer,
  BenutzerRolle,
  Einladung,
  KonsoleDatenbank,
  KonsoleVerein,
  SystemEreignis,
  SystemProtokoll,
  Verein
} from '../datenbank.types';

// Konsole des Super-Admins (docs/Mandanten.md, Phasen 1 bis 3): Vereine anlegen,
// sperren und entsperren, ersten Vereins-Administrator einladen, Super-Admins
// verwalten, Kennzahlen, Export und Loeschen, Aufraeumen, Protokoll. Vereinsdaten (Spieler, Partien) sieht der Super-Admin
// hier nicht - nur mit Support-Freigabe des Vereins.

const AKTION_TEXT: Record<string, string> = {
  verein_angelegt: 'Verein angelegt',
  verein_gesperrt: 'Verein gesperrt',
  verein_entsperrt: 'Verein entsperrt',
  systemadmin_ernannt: 'Super-Admin ernannt',
  systemadmin_entzogen: 'Super-Admin entzogen',
  support_freigegeben: 'Support-Zugang freigegeben',
  support_beendet: 'Support-Zugang beendet',
  verein_exportiert: 'Daten exportiert',
  loeschung_vorgemerkt: 'Löschung vorgemerkt',
  loeschung_abgebrochen: 'Löschung abgebrochen',
  verein_geloescht: 'Verein gelöscht',
  demo_zurueckgesetzt: 'Demo zurückgesetzt',
  aufgeraeumt: 'Aufgeräumt'
};

const zeit = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Konsole() {
  const { istSuperAdmin, benutzer } = useSitzung();
  const [vereine, setVereine] = useState<Verein[]>([]);
  const [rollen, setRollen] = useState<BenutzerRolle[]>([]);
  const [konten, setKonten] = useState<Benutzer[]>([]);
  const [einladungen, setEinladungen] = useState<Einladung[]>([]);
  const [protokoll, setProtokoll] = useState<SystemProtokoll[]>([]);
  const [zahlen, setZahlen] = useState<KonsoleVerein[]>([]);
  const [datenbank, setDatenbank] = useState<KonsoleDatenbank | null>(null);
  const [sicherung, setSicherung] = useState<SystemEreignis | null>(null);
  const [aufraeumen, setAufraeumen] = useState<AufraeumenZahlen | null>(null);
  const [auswahl, setAuswahl] = useState<Set<AufraeumenArt>>(
    () => new Set(AUFRAEUMEN_ARTEN.filter((a) => a.vorgewaehlt).map((a) => a.art))
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [rueckfrage, fragen] = useRueckfrage();

  // Neuer Verein
  const [name, setName] = useState('');
  const [kurzname, setKurzname] = useState('');
  const [adresse, setAdresse] = useState('');
  const [adresseVonHand, setAdresseVonHand] = useState(false);
  const [istTest, setIstTest] = useState(false);
  const [adminMail, setAdminMail] = useState('');

  // Zeilenaktionen
  const [sperren, setSperren] = useState<{ id: string; grund: string } | null>(null);
  const [einladen, setEinladen] = useState<{ id: string; email: string } | null>(null);
  const [neuerAdmin, setNeuerAdmin] = useState('');
  const [sofortLoeschen, setSofortLoeschen] = useState<{ id: string; name: string } | null>(null);
  const neuPflicht = usePflicht<HTMLElement>();
  const adminPflicht = usePflicht<HTMLDivElement>();

  const laden = useCallback(async () => {
    const [v, r, k, e, p, z, d, s, a] = await Promise.all([
      supabase.from('vereine').select('*').order('name'),
      supabase.from('benutzer_rollen').select('*').eq('rolle', 'vereinsadmin'),
      supabase.from('benutzer').select('*'),
      supabase.from('einladungen').select('*').is('angenommen_am', null),
      supabase.from('system_protokoll').select('*').order('zeit', { ascending: false }).limit(40),
      supabase.rpc('konsole_vereine'),
      supabase.rpc('konsole_datenbank'),
      supabase.from('system_ereignisse').select('*').eq('art', 'sicherung').order('zeit', { ascending: false }).limit(1),
      supabase.rpc('aufraeumen_vorschau')
    ]);
    const erster = [v, r, k, e, p, z, d, s, a].find((x) => x.error)?.error;
    setAufraeumen((a.data ?? null) as AufraeumenZahlen | null);
    setZahlen((z.data ?? []) as KonsoleVerein[]);
    setDatenbank((d.data ?? null) as KonsoleDatenbank | null);
    setSicherung(s.data?.[0] ?? null);
    if (erster) setFehler(erster.message);
    setVereine(v.data ?? []);
    setRollen(r.data ?? []);
    setKonten(k.data ?? []);
    setEinladungen(e.data ?? []);
    setProtokoll(p.data ?? []);
  }, []);

  useEffect(() => {
    if (istSuperAdmin) void laden();
  }, [istSuperAdmin, laden]);

  if (!istSuperAdmin) return <p className="hinweis">Diese Seite ist den Super-Admins vorbehalten.</p>;

  const email = (id: string | null) => konten.find((k) => k.id === id)?.email ?? '–';
  const vereinName = (id: string | null) => vereine.find((v) => v.id === id)?.name ?? '';
  const erfolg = (text: string) => {
    setFehler(null);
    setMeldung(text);
  };
  const zeigeFehler = (text: string) => {
    setMeldung(null);
    setFehler(text);
  };

  // Einladung des Vereins-Administrators ueber die Serverfunktion
  async function adminEinladen(vereinId: string, adresseMail: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('einladung', {
      body: { verein_id: vereinId, email: adresseMail.trim(), rollen: ['vereinsadmin'], weiterleitung: ANWENDUNGSADRESSE }
    });
    if (error) return error.message;
    if (data?.fehler) return String(data.fehler);
    return null;
  }

  async function vereinAnlegen() {
    if (!neuPflicht.pruefen()) return;
    if (name.trim().length < 2) return neuPflicht.melden('Der Name braucht mindestens zwei Zeichen.');
    if (!/^[a-z0-9-]{2,30}$/.test(adresse)) return neuPflicht.melden('Die Adresse besteht aus 2 bis 30 Kleinbuchstaben, Ziffern und Bindestrichen.');
    if (adminMail.trim() && !adminMail.includes('@')) return neuPflicht.melden('Die E-Mail-Adresse des Vereins-Administrators stimmt nicht.');
    setArbeitet(true);
    const { data: id, error } = await supabase.rpc('verein_anlegen', {
      p_name: name.trim(),
      p_kurzname: kurzname.trim(),
      p_slug: adresse,
      p_test: istTest
    });
    if (error || !id) {
      setArbeitet(false);
      return neuPflicht.melden(error?.message.includes('vereine_slug_key') ? 'Diese Adresse ist schon vergeben.' : error?.message ?? 'Nicht angelegt.');
    }
    let text = `Verein „${name.trim()}“ angelegt.`;
    if (adminMail.trim()) {
      const problem = await adminEinladen(id, adminMail);
      text += problem ? ` Die Einladung ist gescheitert: ${problem}` : ` Einladung an ${adminMail.trim()} verschickt.`;
    }
    setArbeitet(false);
    setName('');
    setKurzname('');
    setAdresse('');
    setAdresseVonHand(false);
    setIstTest(false);
    setAdminMail('');
    neuPflicht.zuruecksetzen();
    erfolg(text);
    await laden();
  }

  async function sperrenBestaetigen() {
    if (!sperren) return;
    const v = vereine.find((x) => x.id === sperren.id);
    if (!(await fragen(`Verein „${v?.name}“ sperren?\nSeine Mitglieder kommen danach nicht mehr hinein, seine Tablets laufen nur noch offline.`, 'Sperren'))) return;
    const { error } = await supabase.rpc('verein_sperren', { p_verein: sperren.id, p_grund: sperren.grund });
    if (error) return zeigeFehler(error.message);
    setSperren(null);
    erfolg(`„${v?.name}“ ist gesperrt.`);
    await laden();
  }

  async function entsperren(v: Verein) {
    if (!(await fragen(`Verein „${v.name}“ wieder freigeben?`, 'Freigeben'))) return;
    const { error } = await supabase.rpc('verein_entsperren', { p_verein: v.id });
    if (error) return zeigeFehler(error.message);
    erfolg(`„${v.name}“ ist wieder freigegeben.`);
    await laden();
  }

  async function exportieren(v: Verein) {
    setArbeitet(true);
    const problem = await exportHerunterladen(v.id, v.slug);
    setArbeitet(false);
    if (problem) return zeigeFehler(problem);
    erfolg(`Export von „${v.name}“ heruntergeladen.`);
    await laden();
  }

  async function loeschenVormerken(v: Verein) {
    if (!(await fragen(`„${v.name}“ zum Löschen vormerken?\nNach 30 Tagen löscht ein nächtlicher Lauf den Verein mit allen Daten und den Konten, die nur dort eine Rolle haben. Bis dahin lässt sich das abbrechen.`, 'Vormerken'))) return;
    const { data: ab, error } = await supabase.rpc('verein_loeschen_vormerken', { p_verein: v.id });
    if (error) return zeigeFehler(error.message);
    erfolg(`„${v.name}“ wird ab dem ${datumText(ab ?? '')} gelöscht.`);
    await laden();
  }

  async function loeschenAbbrechen(v: Verein) {
    const { error } = await supabase.rpc('verein_loeschen_abbrechen', { p_verein: v.id });
    if (error) return zeigeFehler(error.message);
    erfolg(`Die Löschung von „${v.name}“ ist abgebrochen. Der Verein bleibt gesperrt.`);
    await laden();
  }

  async function sofortLoeschenBestaetigen(v: Verein) {
    if (!sofortLoeschen) return;
    if (sofortLoeschen.name.trim() !== v.name) return zeigeFehler('Der Name stimmt nicht.');
    setArbeitet(true);
    const { error } = await supabase.rpc('verein_sofort_loeschen', { p_verein: v.id, p_name: sofortLoeschen.name.trim() });
    setArbeitet(false);
    if (error) return zeigeFehler(error.message);
    setSofortLoeschen(null);
    erfolg(`„${v.name}“ ist gelöscht.`);
    await laden();
  }

  async function demoZuruecksetzen(v: Verein) {
    if (!(await fragen(`Demo „${v.name}“ zurücksetzen?\nTurniere, Partien, Rating, Mannschaften und die Spieler ohne Konto werden gelöscht und durch Beispieldaten ersetzt. Konten, Tablets, Tische und Einstellungen bleiben.`, 'Zurücksetzen'))) return;
    setArbeitet(true);
    const { error } = await supabase.rpc('demo_zuruecksetzen', { p_verein: v.id });
    setArbeitet(false);
    if (error) return zeigeFehler(error.message);
    erfolg(`„${v.name}“ hat wieder die Beispieldaten.`);
    await laden();
  }

  async function aufraeumenAusfuehren() {
    const arten = AUFRAEUMEN_ARTEN.filter((a) => auswahl.has(a.art) && (aufraeumen?.[a.art] ?? 0) > 0);
    if (arten.length === 0) return zeigeFehler('Bei den angehakten Punkten ist nichts aufzuräumen.');
    const liste = arten.map((a) => `${aufraeumen?.[a.art]} × ${a.text}`).join('\n');
    if (!(await fragen(`Endgültig löschen?\n${liste}`, 'Aufräumen'))) return;
    setArbeitet(true);
    const { error } = await supabase.rpc('aufraeumen', { p_arten: arten.map((a) => a.art) });
    setArbeitet(false);
    if (error) return zeigeFehler(error.message);
    erfolg('Aufgeräumt.');
    await laden();
  }

  async function einladenAbschicken() {
    if (!einladen) return;
    if (!einladen.email.includes('@')) return zeigeFehler('Bitte eine E-Mail-Adresse eintragen.');
    setArbeitet(true);
    const problem = await adminEinladen(einladen.id, einladen.email);
    setArbeitet(false);
    if (problem) return zeigeFehler(problem);
    setEinladen(null);
    erfolg('Einladung verschickt.');
    await laden();
  }

  async function superAdminSetzen(adresseMail: string, ja: boolean) {
    if (!ja && !(await fragen(`${adresseMail} die Rechte als Super-Admin entziehen?`, 'Entziehen'))) return;
    const { error } = await supabase.rpc('systemadmin_setzen', { p_email: adresseMail, p_ja: ja });
    if (error) return zeigeFehler(error.message);
    setNeuerAdmin('');
    erfolg(ja ? `${adresseMail} ist jetzt Super-Admin.` : `${adresseMail} ist kein Super-Admin mehr.`);
    await laden();
  }

  const superAdmins = konten.filter((k) => k.systemadmin);
  const jetzt = new Date();
  const warnungSicherung = sicherungsWarnung(sicherung, jetzt);
  const laeufe = datenbank?.rating_laeufe ?? [];
  const warnungRating = ratingWarnung(laeufe, jetzt);
  const anteil = datenbank ? datenbank.groesse_bytes / DATENBANK_GRENZE_BYTES : 0;

  return (
    <div className="einspaltig">
      <section className="block">
        <h2>Konsole</h2>
        <p className="hinweis">
          Verwaltung aller Vereine. Namen, Spieler und Ergebnisse eines Vereins sind hier bewusst nicht zu sehen; dafür
          gibt der Vereins-Administrator einen befristeten Support-Zugang frei.
        </p>
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      <section className="block">
        <h2>Vereine</h2>
        <table className="tabelle">
          <thead>
            <tr>
              <th>Verein</th>
              <th>Adresse</th>
              <th>Vereins-Administrator</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vereine.map((v) => {
              const admins = rollen.filter((r) => r.verein_id === v.id).map((r) => email(r.benutzer_id));
              const offen = einladungen.filter((e) => e.verein_id === v.id && e.rollen.includes('vereinsadmin')).map((e) => e.email);
              return (
                <tr key={v.id}>
                  <td>
                    {v.name}
                    {v.ist_test && <span className="marke">Test</span>}
                  </td>
                  <td>{v.slug}</td>
                  <td>
                    {admins.join(', ') || '–'}
                    {offen.length > 0 && <small className="hinweis"> · eingeladen: {offen.join(', ')}</small>}
                    {einladen?.id === v.id && (
                      <div className="zeile">
                        <input
                          type="email"
                          placeholder="name@verein.de"
                          value={einladen.email}
                          autoFocus
                          onChange={(e) => setEinladen({ id: v.id, email: e.target.value })}
                        />
                        <button type="button" title="Einladung als Vereins-Administrator verschicken" onClick={() => void einladenAbschicken()} disabled={arbeitet}>
                          Einladen
                        </button>
                        <button type="button" title="Nicht einladen" onClick={() => setEinladen(null)}>
                          Abbrechen
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    {v.aktiv ? (
                      <span className="marke ausgang-sieg">aktiv</span>
                    ) : (
                      <span className="marke ausgang-niederlage" title={v.sperrgrund ?? undefined}>
                        gesperrt{v.gesperrt_am ? ` seit ${zeit(v.gesperrt_am)}` : ''}
                      </span>
                    )}
                    {v.loeschen_ab && (
                      <span className="marke warnmarke" title="Ein nächtlicher Lauf löscht den Verein ab diesem Tag">
                        Löschung ab {datumText(v.loeschen_ab)}
                      </span>
                    )}
                    {!v.aktiv && (
                      <>
                        <small className="hinweis">
                          {' '}
                          · {v.export_am ? `Export vom ${zeit(v.export_am)}` : 'noch kein Export'}
                        </small>
                        <div className="knopfpaar">
                          <button type="button" className="klein" title="Alle Daten des Vereins als Datei herunterladen" onClick={() => void exportieren(v)} disabled={arbeitet}>
                            Export
                          </button>
                          {loeschStand(v) === 'bereit' && (
                            <button type="button" className="klein gefahrknopf" title="In 30 Tagen endgültig löschen" onClick={() => void loeschenVormerken(v)}>
                              Löschen vormerken
                            </button>
                          )}
                          {loeschStand(v) === 'export_fehlt' && (
                            <button type="button" className="klein gefahrknopf" title="Erst exportieren, dann lässt sich die Löschung vormerken" onClick={() => zeigeFehler(`Vor dem Löschen die Daten von „${v.name}“ exportieren.`)}>
                              Löschen vormerken
                            </button>
                          )}
                          {loeschStand(v) === 'vorgemerkt' && (
                            <button type="button" className="klein" title="Die vorgemerkte Löschung aufheben; der Verein bleibt gesperrt" onClick={() => void loeschenAbbrechen(v)}>
                              Löschung abbrechen
                            </button>
                          )}
                          {v.ist_test && (
                            <button type="button" className="klein gefahrknopf" title="Test-Verein ohne Frist löschen; der Name muss zur Bestätigung eingetippt werden" onClick={() => setSofortLoeschen({ id: v.id, name: '' })}>
                              Sofort löschen
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {sofortLoeschen?.id === v.id && (
                      <div className="zeile">
                        <input
                          placeholder={`zur Bestätigung: ${v.name}`}
                          value={sofortLoeschen.name}
                          autoFocus
                          onChange={(e) => setSofortLoeschen({ id: v.id, name: e.target.value })}
                        />
                        <button type="button" className="gefahrknopf" title="Den Test-Verein jetzt mit allen Daten löschen" onClick={() => void sofortLoeschenBestaetigen(v)} disabled={arbeitet}>
                          Endgültig löschen
                        </button>
                        <button type="button" title="Nicht löschen" onClick={() => setSofortLoeschen(null)}>
                          Abbrechen
                        </button>
                      </div>
                    )}
                    {sperren?.id === v.id && (
                      <div className="zeile">
                        <input
                          placeholder="Grund (sehen die Mitglieder)"
                          value={sperren.grund}
                          autoFocus
                          onChange={(e) => setSperren({ id: v.id, grund: e.target.value })}
                        />
                        <button type="button" className="gefahrknopf" title="Den Verein jetzt sperren" onClick={() => void sperrenBestaetigen()}>
                          Sperren
                        </button>
                        <button type="button" title="Nicht sperren" onClick={() => setSperren(null)}>
                          Abbrechen
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="rechts">
                    <div className="knopfpaar rechts">
                      <button type="button" title="Einen Vereins-Administrator per E-Mail einladen" onClick={() => setEinladen({ id: v.id, email: '' })}>
                        Admin einladen
                      </button>
                      {v.aktiv ? (
                        <button type="button" className="gefahrknopf" title="Den Verein sperren; es folgt die Frage nach dem Grund" onClick={() => setSperren({ id: v.id, grund: '' })}>
                          Sperren
                        </button>
                      ) : (
                        <button type="button" title="Die Sperre aufheben; eine vorgemerkte Löschung entfällt damit" onClick={() => void entsperren(v)}>
                          Freigeben
                        </button>
                      )}
                      {v.ist_test && (
                        <button type="button" title="Inhalte löschen und Beispieldaten neu anlegen" onClick={() => void demoZuruecksetzen(v)} disabled={arbeitet}>
                          Demo zurücksetzen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="block">
        <h2>Nutzung</h2>
        <p className="hinweis">Nur Zahlen. Test-Vereine sind markiert und zählen später in keiner Auswertung.</p>
        <table className="tabelle">
          <thead>
            <tr>
              <th>Verein</th>
              <th className="rechts" title="Konten mit einer Rolle im Verein">Konten</th>
              <th title="Jüngste Anmeldung eines dieser Konten">zuletzt angemeldet</th>
              <th className="rechts" title="Spieler mit Status Mitglied, dahinter die Gäste">Mitglieder / Gäste</th>
              <th className="rechts" title="Turniere und Spieltage der letzten 30 Tage">Turniere 30 T.</th>
              <th className="rechts" title="Beendete Partien der letzten 30 Tage, dahinter alle">Partien 30 T. / alle</th>
              <th className="rechts" title="Tablets, die sich in den letzten 2 Minuten gemeldet haben, dahinter alle gekoppelten">Tablets an / alle</th>
              <th className="rechts" title="Grobe Größe: Zeilen in den Vereinstabellen">Datensätze</th>
            </tr>
          </thead>
          <tbody>
            {vereine.map((v) => {
              const z = zahlen.find((x) => x.verein_id === v.id);
              return (
                <tr key={v.id}>
                  <td>
                    {v.name}
                    {v.ist_test && <span className="marke">Test</span>}
                    {!v.aktiv && <span className="marke ausgang-niederlage">gesperrt</span>}
                  </td>
                  <td className="rechts">{z?.konten ?? '–'}</td>
                  <td>{z?.letzte_anmeldung ? zeit(z.letzte_anmeldung) : '–'}</td>
                  <td className="rechts">{z ? `${z.mitglieder} / ${z.gaeste}` : '–'}</td>
                  <td className="rechts">{z?.turniere_30 ?? '–'}</td>
                  <td className="rechts">{z ? `${z.partien_30} / ${z.partien_gesamt}` : '–'}</td>
                  <td className="rechts">{z ? `${z.tablets_online} / ${z.tablets}` : '–'}</td>
                  <td className="rechts">{z ? z.datensaetze.toLocaleString('de-DE') : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="block">
        <h2>Sicherung und Rating</h2>
        <div className="kennzahlen">
          <div className={warnungSicherung ? 'warnkachel' : ''}>
            <span>Wöchentliche Sicherung</span>
            <strong>{sicherung ? zeit(sicherung.zeit) : '–'}</strong>
            <small>
              {warnungSicherung ??
                `erfolgreich${sicherung?.groesse_bytes ? `, ${groesseText(sicherung.groesse_bytes)}` : ''}`}
            </small>
          </div>
          <div className={warnungRating ? 'warnkachel' : ''}>
            <span>Nächtliches Rating</span>
            <strong>{laeufe[0] ? zeit(laeufe[0].start) : '–'}</strong>
            <small>{warnungRating ?? 'erfolgreich'}</small>
          </div>
        </div>
        {laeufe.some((l) => l.status !== 'succeeded') && (
          <p className="hinweis">
            In den letzten {laeufe.length} Läufen fehlgeschlagen:{' '}
            {laeufe
              .filter((l) => l.status !== 'succeeded')
              .map((l) => `${zeit(l.start)} (${(l.meldung ?? '').split('\n')[0]})`)
              .join(' · ')}
          </p>
        )}
      </section>

      <section className="block">
        <h2>Datenbank</h2>
        {datenbank ? (
          <>
            <div className="kennzahlen">
              <div className={anteil > 0.8 ? 'warnkachel' : ''}>
                <span>Größe</span>
                <strong>{groesseText(datenbank.groesse_bytes)}</strong>
                <small>
                  {(anteil * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} % von {groesseText(DATENBANK_GRENZE_BYTES)} (Gratis-Tarif)
                </small>
                <meter min={0} max={1} low={0.6} high={0.8} optimum={0} value={anteil} />
              </div>
              <div>
                <span>Verbindungen</span>
                <strong>{datenbank.verbindungen}</strong>
                <small>gerade offen, auch die der Serverfunktionen</small>
              </div>
            </div>
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Größte Tabellen</th>
                  <th className="rechts">Größe</th>
                  <th className="rechts">Zeilen (geschätzt)</th>
                </tr>
              </thead>
              <tbody>
                {datenbank.tabellen.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td className="rechts">{groesseText(t.bytes)}</td>
                    <td className="rechts">{t.zeilen < 0 ? '–' : t.zeilen.toLocaleString('de-DE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="hinweis">Lädt.</p>
        )}
      </section>

      <section className="block">
        <h2>Aufräumen</h2>
        <p className="hinweis">Über alle Vereine. Erst zählen, dann die angehakten Punkte löschen.</p>
        <table className="tabelle">
          <tbody>
            {AUFRAEUMEN_ARTEN.map((a) => (
              <tr key={a.art}>
                <td>
                  <label className="ankreuz">
                    <input
                      type="checkbox"
                      checked={auswahl.has(a.art)}
                      onChange={(e) => {
                        const neu = new Set(auswahl);
                        if (e.target.checked) neu.add(a.art);
                        else neu.delete(a.art);
                        setAuswahl(neu);
                      }}
                    />
                    <span>{a.text}</span>
                  </label>
                </td>
                <td className="rechts">{aufraeumen?.[a.art] ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="knopfpaar">
          <button type="button" title="Die Zahlen neu ermitteln" onClick={() => void laden()}>
            Neu zählen
          </button>
          <button type="button" title="Die angehakten Punkte endgültig löschen; vorher kommt eine Rückfrage" onClick={() => void aufraeumenAusfuehren()} disabled={arbeitet}>
            Ausgewählte aufräumen ({AUFRAEUMEN_ARTEN.filter((a) => auswahl.has(a.art)).reduce((n, a) => n + (aufraeumen?.[a.art] ?? 0), 0)})
          </button>
        </div>
      </section>

      <section className="block" ref={neuPflicht.bereich}>
        <h2>Neuer Verein</h2>
        <div className="felder">
          <label className="feld">
            <span>Name</span>
            <input
              required
              value={name}
              placeholder="z. B. Billardverein Musterstadt"
              onChange={(e) => {
                setName(e.target.value);
                if (!adresseVonHand) setAdresse(adresseAusName(e.target.value));
              }}
            />
          </label>
          <label className="feld">
            <span>Kurzname</span>
            <input value={kurzname} placeholder="leer = wie der Name" onChange={(e) => setKurzname(e.target.value)} />
          </label>
          <label className="feld">
            <span>Adresse (für spätere Vereinsseiten)</span>
            <input
              required
              value={adresse}
              placeholder="wird aus dem Namen erzeugt"
              onChange={(e) => {
                setAdresse(e.target.value.toLowerCase());
                setAdresseVonHand(true);
              }}
            />
          </label>
          <label className="feld">
            <span>E-Mail des Vereins-Administrators</span>
            <input type="email" value={adminMail} placeholder="optional, z. B. name@verein.de" onChange={(e) => setAdminMail(e.target.value)} />
          </label>
        </div>
        <label className="ankreuz">
          <input type="checkbox" checked={istTest} onChange={(e) => setIstTest(e.target.checked)} />
          <span>
            Test-Verein
            <small>Taucht später in keiner Statistik auf und lässt sich mit Beispieldaten zurücksetzen.</small>
          </span>
        </label>
        <div className="knopfpaar">
          <button type="button" title="Den Verein anlegen und, falls angegeben, den Vereins-Administrator einladen" onClick={() => void vereinAnlegen()} disabled={arbeitet}>
            {arbeitet ? 'Wird angelegt …' : 'Verein anlegen'}
          </button>
          <Pflichthinweis hinweis={neuPflicht.hinweis} />
        </div>
      </section>

      <section className="block">
        <h2>Super-Admins</h2>
        <ul className="schlicht">
          {superAdmins.map((k) => (
            <li key={k.id} className="zeile">
              <span>{k.email}{k.id === benutzer?.id ? ' (du)' : ''}</span>
              <button type="button" className="klein" title="Die Rechte als Super-Admin entziehen" onClick={() => void superAdminSetzen(k.email ?? '', false)}>
                entziehen
              </button>
            </li>
          ))}
        </ul>
        <div className="zeile" ref={adminPflicht.bereich}>
          <input
            type="email"
            required
            aria-label="E-Mail eines vorhandenen Kontos"
            placeholder="E-Mail eines vorhandenen Kontos"
            value={neuerAdmin}
            onChange={(e) => setNeuerAdmin(e.target.value)}
          />
          <button
            type="button"
            title="Dieses Konto zum Super-Admin machen. Es muss schon ein Konto sein."
            onClick={() => {
              if (adminPflicht.pruefen()) void superAdminSetzen(neuerAdmin.trim(), true);
            }}
          >
            Zum Super-Admin machen
          </button>
          <Pflichthinweis hinweis={adminPflicht.hinweis} ohneLegende />
        </div>
        <p className="hinweis">Nur vorhandene Konten; wer noch keines hat, meldet sich zuerst einmal an oder wird in einen Verein eingeladen.</p>
      </section>

      <section className="block">
        <h2>Protokoll</h2>
        {protokoll.length === 0 ? (
          <p className="hinweis">Noch keine Einträge.</p>
        ) : (
          <table className="tabelle">
            <tbody>
              {protokoll.map((p) => (
                <tr key={p.id}>
                  <td>{zeit(p.zeit)}</td>
                  <td>{AKTION_TEXT[p.aktion] ?? p.aktion}</td>
                  <td>
                    {vereinName(p.verein_id) ||
                      (typeof p.details.name === 'string' ? p.details.name : '') ||
                      (typeof p.details.email === 'string' ? p.details.email : '')}
                  </td>
                  <td className="hinweis">{email(p.benutzer_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {rueckfrage}
    </div>
  );
}
