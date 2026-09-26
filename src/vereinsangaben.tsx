// Gemeinsame Felder fuer die Grunddaten eines Vereins: Web-Adresse mit
// festem "cuedesk.de/" davor und die Angaben zu Spiellokal und Kontakt.
// Genutzt in der Konsole (Bearbeiten, Neuer Verein) und auf der Seite System.
import { webAdresseEingabe } from './mandanten';

export const WEB_PRAEFIX = 'cuedesk.de/';

export type Vereinsangaben = {
  strasse: string;
  plz: string;
  ort: string;
  homepage: string;
  kontakt_email: string;
};

export const angabenAus = (v: {
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  homepage: string | null;
  kontakt_email: string | null;
}): Vereinsangaben => ({
  strasse: v.strasse ?? '',
  plz: v.plz ?? '',
  ort: v.ort ?? '',
  homepage: v.homepage ?? '',
  kontakt_email: v.kontakt_email ?? ''
});

export function WebAdresseFeld({
  wert,
  aendern,
  hinweis,
  nurLesen = false
}: {
  wert: string;
  aendern?: (neu: string) => void;
  hinweis?: string;
  nurLesen?: boolean;
}) {
  return (
    <label className="feld">
      <span>Web-Adresse</span>
      <span className="mitpraefix">
        <span className="praefix">{WEB_PRAEFIX}</span>
        <input
          required={!nurLesen}
          disabled={nurLesen}
          value={wert}
          placeholder="z. B. musterstadt"
          onChange={(e) => aendern?.(webAdresseEingabe(e.target.value))}
        />
      </span>
      <small>{hinweis ?? 'Nur Kleinbuchstaben, Ziffern und Bindestrich.'}</small>
    </label>
  );
}

export function AngabenFelder({
  werte,
  aendern,
  gesperrt = false
}: {
  werte: Vereinsangaben;
  aendern: (neu: Vereinsangaben) => void;
  gesperrt?: boolean;
}) {
  const feld = (schluessel: keyof Vereinsangaben, beschriftung: string, platzhalter: string, typ = 'text') => (
    <label className="feld">
      <span>{beschriftung}</span>
      <input
        type={typ}
        disabled={gesperrt}
        value={werte[schluessel]}
        placeholder={platzhalter}
        onChange={(e) => aendern({ ...werte, [schluessel]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      <div className="feldkopf">Spiellokal</div>
      <div className="felder anschrift">
        {feld('strasse', 'Straße und Hausnummer', 'z. B. Am Markt 1')}
        {feld('plz', 'PLZ', 'z. B. 27211')}
        {feld('ort', 'Ort', 'z. B. Musterstadt')}
      </div>
      <div className="felder">
        {feld('homepage', 'Homepage', 'z. B. www.verein.de')}
        {feld('kontakt_email', 'Kontakt-E-Mail', 'z. B. vorstand@verein.de', 'email')}
      </div>
    </>
  );
}
