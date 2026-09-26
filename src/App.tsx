import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useSitzung } from './sitzung';
import Anmeldung from './seiten/Anmeldung';
import Personen from './seiten/Personen';
import BenutzerRollen from './seiten/BenutzerRollen';
import TischeGeraete from './seiten/TischeGeraete';
import Geraet from './seiten/Geraet';
import Altdaten from './seiten/Altdaten';
import Rating from './seiten/Rating';
import Serien from './seiten/Serien';
import Ranglisten from './seiten/Ranglisten';
import StatistikPool from './seiten/StatistikPool';
import Statistik141 from './seiten/Statistik141';
import Live from './seiten/Live';
import Turniere from './seiten/Turniere';
import Mannschaften from './seiten/Mannschaften';
import System from './seiten/System';
import Konsole from './seiten/Konsole';
import { vereinsKuerzel } from './vereinseinstellungen';
import { useWechsel } from './ungespeichert';

type Bereich =
  | 'live'
  | 'turniere'
  | 'mannschaften'
  | 'personen'
  | 'rating'
  | 'serien'
  | 'ranglisten'
  | 'statistikPool'
  | 'statistik141'
  | 'benutzer'
  | 'tische'
  | 'altdaten'
  | 'system'
  | 'konsole';

// Tablets und TV rufen die Adresse mit ?geraet auf und bekommen die
// Geraeteansicht statt der Anmeldung.
const istGeraet = new URLSearchParams(window.location.search).has('geraet');

export default function App() {
  const { laedt, sitzung, benutzer, verein, rollen, abmelden, darf, vereine, gesperrt, istSuperAdmin, vereinWaehlen } =
    useSitzung();
  const [bereich, setBereich] = useState<Bereich>('live');
  const wechselErlaubt = useWechsel();
  // Ohne nutzbaren Verein gibt es nur die Konsole (Super-Admin). Ist der
  // gewaehlte Verein gesperrt, steht zuerst der Hinweis da.
  const nurKonsole = !verein;
  const angezeigt: Bereich = nurKonsole && istSuperAdmin && !gesperrt ? 'konsole' : bereich;
  // Laeuft gerade ein Turnier, faellt der Live-Reiter gruen auf.
  const [turnierLaeuft, setTurnierLaeuft] = useState(false);

  useEffect(() => {
    if (!verein) return;
    let vorbei = false;
    const nachsehen = async () => {
      const { count } = await supabase
        .from('turniere')
        .select('id', { count: 'exact', head: true })
        .eq('verein_id', verein.id)
        .eq('status', 'laeuft');
      if (!vorbei) setTurnierLaeuft((count ?? 0) > 0);
    };
    void nachsehen();
    const kanal = supabase
      .channel(`turnierstand-${verein.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turniere', filter: `verein_id=eq.${verein.id}` },
        () => void nachsehen()
      )
      .subscribe();
    return () => {
      vorbei = true;
      void supabase.removeChannel(kanal);
    };
  }, [verein]);

  // Anonyme Anmeldungen gehoeren immer zu einem Geraet, auch ohne ?geraet in
  // der Adresse. Sonst landet ein Tablet in der Mitgliederansicht.
  const istAnonymesGeraet = Boolean(sitzung?.user?.is_anonymous);

  if (istGeraet || istAnonymesGeraet) return <Geraet />;
  if (laedt) return <p className="hinweis">Lädt.</p>;
  if (!sitzung) return <Anmeldung />;

  const bereiche: { wert: Bereich; name: string; sichtbar: boolean; tipp?: string }[] = [
    {
      wert: 'live',
      name: 'Live',
      sichtbar: true,
      tipp: 'Alle Tische auf einen Blick: laufende Spiele mit Spielstand, freie Tische und ob das Tablet an ist.'
    },
    {
      wert: 'turniere',
      name: 'Turniere',
      sichtbar: true,
      tipp: 'Turniere und Liga-Spieltage anlegen, Spielplan führen, Ergebnisse eintragen und abschließen.'
    },
    {
      wert: 'mannschaften',
      name: 'Mannschaften',
      sichtbar: true,
      tipp: 'Mannschaften einer Saison mit Kader, Stammspielern und Einsätzen, dazu die Saisonübersicht.'
    },
    {
      wert: 'personen',
      name: 'Spieler',
      sichtbar: true,
      tipp: 'Alle Spieler des Vereins: Mitglieder, Gäste anderer Vereine und Ausgetretene. Hier werden Namen, Status und Stammdaten gepflegt.'
    },
    {
      wert: 'rating',
      name: 'Rating',
      sichtbar: true,
      tipp: 'Vereins-Rating je Disziplin. Die Lupe zeigt, welche Partien in den Wert eines Spielers eingegangen sind.'
    },
    {
      wert: 'serien',
      name: 'Serien',
      sichtbar: true,
      tipp: 'Serienwertung: Punkte aus den Platzierungen mehrerer Turniere, mit Streichergebnissen.'
    },
    {
      wert: 'ranglisten',
      name: 'Ranglisten',
      sichtbar: true,
      tipp: 'Siegquote, Bestenliste 14.1, Titel aus Turniersiegen und Platzierungen in den Serien.'
    },
    {
      wert: 'statistikPool',
      name: 'Pool-Statistik',
      sichtbar: true,
      tipp: 'Bilanz, Rating-Verlauf, Form und Gegner eines Spielers in 8-, 9- und 10-Ball. Mitglieder sehen nur sich selbst.'
    },
    {
      wert: 'statistik141',
      name: '14.1-Statistik',
      sichtbar: true,
      tipp: 'Serien, Quoten und Entwicklung aus dem Aufnahme-Protokoll der 14.1-Partien. Mitglieder sehen nur sich selbst.'
    },
    {
      wert: 'benutzer',
      name: 'Benutzer und Rollen',
      sichtbar: darf('vereinsadmin', 'sportwart'),
      tipp: 'Konten einladen, Rollen vergeben und Konten mit Spielern verknüpfen.'
    },
    {
      wert: 'tische',
      name: 'Tische und Geräte',
      sichtbar: darf('vereinsadmin', 'turnierleiter'),
      tipp: 'Tische anlegen und die Tablets an den Tischen koppeln.'
    },
    {
      wert: 'altdaten',
      name: 'Altdaten übernehmen',
      sichtbar: darf('vereinsadmin', 'sportwart'),
      tipp: 'Den Datenbestand aus Turnier light einlesen und den Spielern zuordnen.'
    },
    {
      wert: 'konsole',
      name: 'Konsole',
      sichtbar: istSuperAdmin,
      tipp: 'Nur für Super-Admins: Vereine anlegen, sperren und freigeben, Vereins-Administratoren einladen, Super-Admins verwalten.'
    },
    {
      wert: 'system',
      name: 'System',
      sichtbar: darf('vereinsadmin'),
      tipp: 'Einstellungen des Vereins: Name und Logo, Vorgaben für neue Turniere und Liga-Spieltage, Saisonbeginn, Schutzwort.'
    }
  ];

  return (
    <div className="rahmen">
      <header className="kopfzeile">
        <div className="vereinsmarke">
          <span className="zeichen">
            {(verein ?? gesperrt)?.logo_url ? (
              <img src={(verein ?? gesperrt)?.logo_url ?? ''} alt="" />
            ) : (
              vereinsKuerzel((verein ?? gesperrt)?.kurzname, (verein ?? gesperrt)?.name)
            )}
          </span>
          {vereine.length > 1 ? (
            <select
              className="vereinswahl"
              title="Zwischen deinen Vereinen wechseln"
              value={verein?.id ?? gesperrt?.id ?? ''}
              onChange={(e) => {
                const ziel = e.target.value;
                void (async () => {
                  if (!(await wechselErlaubt())) return;
                  vereinWaehlen(ziel);
                  setBereich('live');
                })();
              }}
            >
              {vereine.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.aktiv ? '' : ' (gesperrt)'}
                </option>
              ))}
            </select>
          ) : (
            <strong>{verein?.name ?? gesperrt?.name ?? 'CueDesk'}</strong>
          )}
        </div>
        <nav className="reiter">
          {bereiche
            .filter((eintrag) => eintrag.sichtbar && (!nurKonsole || eintrag.wert === 'konsole'))
            .map((eintrag) => (
              <button
                key={eintrag.wert}
                type="button"
                className={[
                  'reiter-knopf',
                  angezeigt === eintrag.wert ? 'aktiv' : '',
                  eintrag.wert === 'live' && turnierLaeuft ? 'laeuft' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={eintrag.wert === 'live' && turnierLaeuft ? `Ein Turnier läuft gerade. ${eintrag.tipp}` : eintrag.tipp}
                onClick={() => {
                  if (eintrag.wert === angezeigt) return;
                  void (async () => {
                    if (await wechselErlaubt()) setBereich(eintrag.wert);
                  })();
                }}
              >
                {eintrag.name}
              </button>
            ))}
        </nav>
        <div className="konto">
          {istSuperAdmin && (
            <span
              className="rolle"
              title="Gilt für ganz CueDesk: Vereine anlegen und sperren, Konsole. Keine Rolle im Verein."
            >
              Super-Admin
            </span>
          )}
          {rollen.length > 0 && (
            <span className="rolle" title="Deine höchste Rolle in diesem Verein. Sie bestimmt, was du sehen und ändern darfst.">
              {hoechsteRolle(rollen)}
            </span>
          )}
          <span className="name" title={benutzer?.email ?? undefined}>
            {benutzer?.anzeigename ?? benutzer?.email}
          </span>
          <button
            type="button"
            title="Von CueDesk abmelden"
            onClick={() => {
              void (async () => {
                if (await wechselErlaubt()) await abmelden();
              })();
            }}
          >
            Abmelden
          </button>
        </div>
      </header>
      <main>
        {gesperrt && angezeigt !== 'konsole' ? (
          <div className="einspaltig">
            <section className="block">
              <h2>{gesperrt.name} ist gesperrt</h2>
              <p>
                Der Zugang zu diesem Verein ist zurzeit gesperrt. Wende dich an den Vereins-Administrator oder an den
                Betreiber von CueDesk.
              </p>
              {gesperrt.sperrgrund && <p className="hinweis">Grund: {gesperrt.sperrgrund}</p>}
            </section>
          </div>
        ) : (
          <>
        {angezeigt === 'konsole' && <Konsole />}
        {angezeigt === 'live' && <Live />}
        {angezeigt === 'turniere' && <Turniere />}
        {angezeigt === 'mannschaften' && <Mannschaften />}
        {angezeigt === 'personen' && <Personen />}
        {angezeigt === 'rating' && <Rating />}
        {angezeigt === 'serien' && <Serien />}
        {angezeigt === 'ranglisten' && <Ranglisten />}
        {angezeigt === 'statistikPool' && <StatistikPool />}
        {angezeigt === 'statistik141' && <Statistik141 />}
        {angezeigt === 'benutzer' && <BenutzerRollen />}
        {angezeigt === 'tische' && <TischeGeraete />}
        {angezeigt === 'system' && <System />}
        {angezeigt === 'altdaten' && <Altdaten />}
          </>
        )}
      </main>
    </div>
  );
}

function hoechsteRolle(rollen: string[]) {
  const reihenfolge = ['vereinsadmin', 'sportwart', 'turnierleiter', 'mitglied'];
  const namen: Record<string, string> = {
    vereinsadmin: 'Vereins-Administrator',
    sportwart: 'Sportwart',
    turnierleiter: 'Turnierleiter',
    mitglied: 'Mitglied'
  };
  const hoechste = reihenfolge.find((rolle) => rollen.includes(rolle));
  return hoechste ? namen[hoechste] : '';
}
