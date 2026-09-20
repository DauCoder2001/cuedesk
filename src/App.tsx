import { useSitzung } from './sitzung';
import Anmeldung from './seiten/Anmeldung';
import Personen from './seiten/Personen';

export default function App() {
  const { laedt, sitzung, benutzer, verein, rollen, abmelden } = useSitzung();

  if (laedt) return <p className="hinweis">Lädt.</p>;
  if (!sitzung) return <Anmeldung />;

  return (
    <div className="rahmen">
      <header className="kopfzeile">
        <div className="vereinsmarke">
          <span className="zeichen">{(verein?.kurzname ?? 'PC').slice(0, 2).toUpperCase()}</span>
          <strong>{verein?.name ?? 'Pool-Club'}</strong>
          <span className="trenner">Personen</span>
        </div>
        <div className="konto">
          {rollen.length > 0 && <span className="rolle">{rollenText(rollen)}</span>}
          <span className="name">{benutzer?.anzeigename ?? benutzer?.email}</span>
          <button type="button" onClick={() => void abmelden()}>
            Abmelden
          </button>
        </div>
      </header>
      <main>
        <Personen />
      </main>
    </div>
  );
}

function rollenText(rollen: string[]) {
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
