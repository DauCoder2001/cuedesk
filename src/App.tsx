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
  | 'altdaten';

// Tablets und TV rufen die Adresse mit ?geraet auf und bekommen die
// Geraeteansicht statt der Anmeldung.
const istGeraet = new URLSearchParams(window.location.search).has('geraet');

export default function App() {
  const { laedt, sitzung, benutzer, verein, rollen, abmelden, darf } = useSitzung();
  const [bereich, setBereich] = useState<Bereich>('live');
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
    { wert: 'live', name: 'Live', sichtbar: true },
    { wert: 'turniere', name: 'Turniere', sichtbar: true },
    { wert: 'mannschaften', name: 'Mannschaften', sichtbar: true },
    {
      wert: 'personen',
      name: 'Spieler',
      sichtbar: true,
      tipp: 'Alle Spieler des Vereins: Mitglieder, Gäste anderer Vereine und Ausgetretene. Hier werden Namen, Status und Stammdaten gepflegt.'
    },
    { wert: 'rating', name: 'Rating', sichtbar: true },
    { wert: 'serien', name: 'Serien', sichtbar: true },
    { wert: 'ranglisten', name: 'Ranglisten', sichtbar: true },
    { wert: 'statistikPool', name: 'Pool-Statistik', sichtbar: true },
    { wert: 'statistik141', name: '14.1-Statistik', sichtbar: true },
    { wert: 'benutzer', name: 'Benutzer und Rollen', sichtbar: darf('vereinsadmin', 'sportwart') },
    { wert: 'tische', name: 'Tische und Geräte', sichtbar: darf('vereinsadmin', 'turnierleiter') },
    { wert: 'altdaten', name: 'Altdaten übernehmen', sichtbar: darf('vereinsadmin', 'sportwart') }
  ];

  return (
    <div className="rahmen">
      <header className="kopfzeile">
        <div className="vereinsmarke">
          <span className="zeichen">{(verein?.kurzname ?? 'PC').slice(0, 2).toUpperCase()}</span>
          <strong>{verein?.name ?? 'CueDesk'}</strong>
        </div>
        <nav className="reiter">
          {bereiche
            .filter((eintrag) => eintrag.sichtbar)
            .map((eintrag) => (
              <button
                key={eintrag.wert}
                type="button"
                className={[
                  'reiter-knopf',
                  bereich === eintrag.wert ? 'aktiv' : '',
                  eintrag.wert === 'live' && turnierLaeuft ? 'laeuft' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={eintrag.wert === 'live' && turnierLaeuft ? 'Ein Turnier läuft gerade' : eintrag.tipp}
                onClick={() => setBereich(eintrag.wert)}
              >
                {eintrag.name}
              </button>
            ))}
        </nav>
        <div className="konto">
          {rollen.length > 0 && <span className="rolle">{hoechsteRolle(rollen)}</span>}
          <span className="name">{benutzer?.anzeigename ?? benutzer?.email}</span>
          <button type="button" onClick={() => void abmelden()}>
            Abmelden
          </button>
        </div>
      </header>
      <main>
        {bereich === 'live' && <Live />}
        {bereich === 'turniere' && <Turniere />}
        {bereich === 'mannschaften' && <Mannschaften />}
        {bereich === 'personen' && <Personen />}
        {bereich === 'rating' && <Rating />}
        {bereich === 'serien' && <Serien />}
        {bereich === 'ranglisten' && <Ranglisten />}
        {bereich === 'statistikPool' && <StatistikPool />}
        {bereich === 'statistik141' && <Statistik141 />}
        {bereich === 'benutzer' && <BenutzerRollen />}
        {bereich === 'tische' && <TischeGeraete />}
        {bereich === 'altdaten' && <Altdaten />}
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
