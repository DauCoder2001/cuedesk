import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { useRueckfrage } from '../rueckfrage';
import { ANWENDUNGSADRESSE } from '../adresse';
import { adresseAusName } from '../mandanten';
import type { Benutzer, BenutzerRolle, Einladung, SystemProtokoll, Verein } from '../datenbank.types';

// Konsole des Super-Admins (docs/Mandanten.md, Phase 1): Vereine anlegen,
// sperren und entsperren, ersten Vereins-Administrator einladen, Super-Admins
// verwalten, Protokoll. Vereinsdaten (Spieler, Partien) sieht der Super-Admin
// hier nicht - nur mit Support-Freigabe des Vereins.

const AKTION_TEXT: Record<string, string> = {
  verein_angelegt: 'Verein angelegt',
  verein_gesperrt: 'Verein gesperrt',
  verein_entsperrt: 'Verein entsperrt',
  systemadmin_ernannt: 'Super-Admin ernannt',
  systemadmin_entzogen: 'Super-Admin entzogen',
  support_freigegeben: 'Support-Zugang freigegeben',
  support_beendet: 'Support-Zugang beendet'
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

  const laden = useCallback(async () => {
    const [v, r, k, e, p] = await Promise.all([
      supabase.from('vereine').select('*').order('name'),
      supabase.from('benutzer_rollen').select('*').eq('rolle', 'vereinsadmin'),
      supabase.from('benutzer').select('*'),
      supabase.from('einladungen').select('*').is('angenommen_am', null),
      supabase.from('system_protokoll').select('*').order('zeit', { ascending: false }).limit(40)
    ]);
    const erster = [v, r, k, e, p].find((x) => x.error)?.error;
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
    if (name.trim().length < 2) return setFehler('Der Verein braucht einen Namen.');
    if (!/^[a-z0-9-]{2,30}$/.test(adresse)) return setFehler('Die Adresse besteht aus 2 bis 30 Kleinbuchstaben, Ziffern und Bindestrichen.');
    if (adminMail.trim() && !adminMail.includes('@')) return setFehler('Die E-Mail-Adresse des Vereins-Administrators stimmt nicht.');
    setArbeitet(true);
    const { data: id, error } = await supabase.rpc('verein_anlegen', {
      p_name: name.trim(),
      p_kurzname: kurzname.trim(),
      p_slug: adresse,
      p_test: istTest
    });
    if (error || !id) {
      setArbeitet(false);
      return setFehler(error?.message.includes('vereine_slug_key') ? 'Diese Adresse ist schon vergeben.' : error?.message ?? 'Nicht angelegt.');
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
    erfolg(text);
    await laden();
  }

  async function sperrenBestaetigen() {
    if (!sperren) return;
    const v = vereine.find((x) => x.id === sperren.id);
    if (!(await fragen(`Verein „${v?.name}“ sperren?\nSeine Mitglieder kommen danach nicht mehr hinein, seine Tablets laufen nur noch offline.`, 'Sperren'))) return;
    const { error } = await supabase.rpc('verein_sperren', { p_verein: sperren.id, p_grund: sperren.grund });
    if (error) return setFehler(error.message);
    setSperren(null);
    erfolg(`„${v?.name}“ ist gesperrt.`);
    await laden();
  }

  async function entsperren(v: Verein) {
    if (!(await fragen(`Verein „${v.name}“ wieder freigeben?`, 'Freigeben'))) return;
    const { error } = await supabase.rpc('verein_entsperren', { p_verein: v.id });
    if (error) return setFehler(error.message);
    erfolg(`„${v.name}“ ist wieder freigegeben.`);
    await laden();
  }

  async function einladenAbschicken() {
    if (!einladen) return;
    if (!einladen.email.includes('@')) return setFehler('Bitte eine E-Mail-Adresse eintragen.');
    setArbeitet(true);
    const problem = await adminEinladen(einladen.id, einladen.email);
    setArbeitet(false);
    if (problem) return setFehler(problem);
    setEinladen(null);
    erfolg('Einladung verschickt.');
    await laden();
  }

  async function superAdminSetzen(adresseMail: string, ja: boolean) {
    if (!ja && !(await fragen(`${adresseMail} die Rechte als Super-Admin entziehen?`, 'Entziehen'))) return;
    const { error } = await supabase.rpc('systemadmin_setzen', { p_email: adresseMail, p_ja: ja });
    if (error) return setFehler(error.message);
    setNeuerAdmin('');
    erfolg(ja ? `${adresseMail} ist jetzt Super-Admin.` : `${adresseMail} ist kein Super-Admin mehr.`);
    await laden();
  }

  const superAdmins = konten.filter((k) => k.systemadmin);

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
                        <button type="button" title="Die Sperre aufheben" onClick={() => void entsperren(v)}>
                          Freigeben
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
        <h2>Neuer Verein</h2>
        <div className="felder">
          <label className="feld">
            <span>Name</span>
            <input
              value={name}
              placeholder="Billardverein Musterstadt"
              onChange={(e) => {
                setName(e.target.value);
                if (!adresseVonHand) setAdresse(adresseAusName(e.target.value));
              }}
            />
          </label>
          <label className="feld">
            <span>Kurzname</span>
            <input value={kurzname} placeholder="Musterstadt" onChange={(e) => setKurzname(e.target.value)} />
          </label>
          <label className="feld">
            <span>Adresse (für spätere Vereinsseiten)</span>
            <input
              value={adresse}
              placeholder="musterstadt"
              onChange={(e) => {
                setAdresse(e.target.value.toLowerCase());
                setAdresseVonHand(true);
              }}
            />
          </label>
          <label className="feld">
            <span>E-Mail des Vereins-Administrators (optional)</span>
            <input type="email" value={adminMail} placeholder="name@verein.de" onChange={(e) => setAdminMail(e.target.value)} />
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
            Verein anlegen
          </button>
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
        <div className="zeile">
          <input type="email" placeholder="E-Mail eines vorhandenen Kontos" value={neuerAdmin} onChange={(e) => setNeuerAdmin(e.target.value)} />
          <button type="button" title="Dieses Konto zum Super-Admin machen. Es muss schon ein Konto sein." onClick={() => void superAdminSetzen(neuerAdmin.trim(), true)}>
            Zum Super-Admin machen
          </button>
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
                  <td>{vereinName(p.verein_id) || (typeof p.details.email === 'string' ? p.details.email : '')}</td>
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
