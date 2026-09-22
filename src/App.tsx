import { useState } from 'react';
import { useSitzung } from './sitzung';
import Anmeldung from './seiten/Anmeldung';
import Personen from './seiten/Personen';
import BenutzerRollen from './seiten/BenutzerRollen';
import TischeGeraete from './seiten/TischeGeraete';
import Geraet from './seiten/Geraet';
import Altdaten from './seiten/Altdaten';
import Rating from './seiten/Rating';
import Serien from './seiten/Serien';
import Statistik141 from './seiten/Statistik141';
import Live from './seiten/Live';
import Turniere from './seiten/Turniere';

type Bereich = 'live' | 'turniere' | 'personen' | 'rating' | 'serien' | 'statistik141' | 'benutzer' | 'tische' | 'altdaten';

// Tablets und TV rufen die Adresse mit ?geraet auf und bekommen die
// Geraeteansicht statt der Anmeldung.
const istGeraet = new URLSearchParams(window.location.search).has('geraet');

export default function App() {
  const { laedt, sitzung, benutzer, verein, rollen, abmelden, darf } = useSitzung();
  const [bereich, setBereich] = useState<Bereich>('live');

  // Anonyme Anmeldungen gehoeren immer zu einem Geraet, auch ohne ?geraet in
  // der Adresse. Sonst landet ein Tablet in der Mitgliederansicht.
  const istAnonymesGeraet = Boolean(sitzung?.user?.is_anonymous);

  if (istGeraet || istAnonymesGeraet) return <Geraet />;
  if (laedt) return <p className="hinweis">Lädt.</p>;
  if (!sitzung) return <Anmeldung />;

  const bereiche: { wert: Bereich; name: string; sichtbar: boolean }[] = [
    { wert: 'live', name: 'Live', sichtbar: true },
    { wert: 'turniere', name: 'Turniere', sichtbar: true },
    { wert: 'personen', name: 'Personen', sichtbar: true },
    { wert: 'rating', name: 'Rating', sichtbar: true },
    { wert: 'serien', name: 'Serien', sichtbar: true },
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
                className={bereich === eintrag.wert ? 'reiter-knopf aktiv' : 'reiter-knopf'}
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
        {bereich === 'personen' && <Personen />}
        {bereich === 'rating' && <Rating />}
        {bereich === 'serien' && <Serien />}
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
