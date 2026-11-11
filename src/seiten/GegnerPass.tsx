import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { personName } from '../namen';
import { KEIN_PASS, mannschaftspassLesen, pdfTexte, spielerAbgleichen } from '../mannschaftspass';
import { gastAnzeigename, gegnerName, passendeMannschaften } from '../gegner-pass';
import type { LigaKennung } from '../liga';
import type { Mannschaftspass, PassSpieler, Treffer } from '../mannschaftspass';

// Gegnerische Mannschaft aus ihrem Mannschaftspass (PDF) uebernehmen. Die PDF
// wird nur im Browser gelesen. Vorgeschlagen wird die Mannschaft, die in Liga
// und Staffel zur eigenen passt (src/gegner-pass.ts); "Uebernehmen" gibt die
// Auswahl zurueck, angelegt wird mit gegnerGaesteAnlegen.

export type GegnerSpieler = {
  vorname: string;
  nachname: string;
  passnummer: string | null;
  dbu_nummer: string | null;
  person_id: string | null; // schon als Gast vorhanden
};
export type GegnerAuswahl = { gegner: string; spieler: GegnerSpieler[] };

// Knopf "Aus Pass..." mit Dateiauswahl
export function GegnerPassKnopf({ gelesen, fehler }: { gelesen: (pass: Mannschaftspass) => void; fehler: (text: string) => void }) {
  const dateiwahl = useRef<HTMLInputElement>(null);
  const [liest, setLiest] = useState(false);
  async function einlesen(datei: File) {
    setLiest(true);
    try {
      const pass = mannschaftspassLesen(await pdfTexte(new Uint8Array(await datei.arrayBuffer())));
      if (pass) gelesen(pass);
      else fehler(KEIN_PASS);
    } catch {
      fehler(KEIN_PASS);
    } finally {
      setLiest(false);
    }
  }
  return (
    <>
      <button
        type="button"
        title="Den PDF-Mannschaftspass des Gegners (Club-Cloud, z. B. BLVN) wählen: Gegner und seine Spieler als Gäste übernehmen. Die Datei wird nur im Browser gelesen."
        onClick={() => dateiwahl.current?.click()}
        disabled={liest}
      >
        {liest ? 'Wird gelesen …' : 'Aus Pass…'}
      </button>
      <input
        ref={dateiwahl}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const datei = e.target.files?.[0];
          e.target.value = '';
          if (datei) void einlesen(datei);
        }}
      />
    </>
  );
}

type Gast = { id: string; vorname: string; nachname: string; anzeige: string; passnummer: string | null; dbu_nummer: string | null };

const TREFFER: Record<Treffer['art'], string> = {
  dbu: 'schon Gast (DBU-Nr.)',
  pass: 'schon Gast (Pass-Nr.)',
  name: 'schon Gast (gleicher Name)',
  aehnlich: 'schon Gast (ähnlicher Name)',
  neu: 'wird als Gast angelegt'
};

const DATUM = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

export function GegnerPassAuswahl({
  vereinId,
  pass,
  liga,
  staffel,
  eigene,
  hinweis,
  knopf = 'Übernehmen',
  naechsterSchritt = false,
  uebernehmen,
  verwerfen
}: {
  vereinId: string;
  pass: Mannschaftspass;
  liga: LigaKennung | null;
  staffel: string | null;
  eigene: string; // Name der eigenen Mannschaft, fuer den Hinweis
  hinweis: string; // was der Knopf bewirkt
  knopf?: string; // Beschriftung des Knopfs
  naechsterSchritt?: boolean; // gruen (faellig): Formular, in dem erst spaeter gespeichert wird
  uebernehmen: (auswahl: GegnerAuswahl) => void;
  verwerfen: () => void;
}) {
  const passend = useMemo(() => passendeMannschaften(pass, liga, staffel), [pass, liga, staffel]);
  const [nummer, setNummer] = useState<number>((passend[0] ?? pass.mannschaften[0])?.nummer ?? 0);
  const mannschaft = pass.mannschaften.find((m) => m.nummer === nummer) ?? null;
  const [gaeste, setGaeste] = useState<Gast[] | null>(null);
  const [aus, setAus] = useState<Set<string>>(new Set()); // abgewaehlte Spieler

  // Vorhandene Gaeste mit ihren Verbandsnummern, damit niemand doppelt entsteht
  useEffect(() => {
    let vorbei = false;
    void (async () => {
      const [p, i] = await Promise.all([
        supabase.from('personen').select('id, vorname, nachname, anzeigename').eq('verein_id', vereinId).eq('status', 'gast'),
        supabase.from('personen_intern').select('person_id, passnummer, dbu_nummer').eq('verein_id', vereinId)
      ]);
      if (vorbei) return;
      const intern = new Map((i.data ?? []).map((x) => [x.person_id, x]));
      setGaeste(
        (p.data ?? []).map((x) => ({
          id: x.id,
          vorname: x.vorname,
          nachname: x.nachname,
          anzeige: x.anzeigename || personName(x),
          passnummer: intern.get(x.id)?.passnummer ?? null,
          dbu_nummer: intern.get(x.id)?.dbu_nummer ?? null
        }))
      );
    })();
    return () => {
      vorbei = true;
    };
  }, [vereinId]);

  const schluessel = (s: PassSpieler) => `${nummer}-${s.position}`;
  const zeilen = (mannschaft?.spieler ?? []).map((s) => ({ s, treffer: gaeste ? spielerAbgleichen(s, gaeste) : null }));
  const gewaehlt = zeilen.filter((z) => !aus.has(schluessel(z.s)));

  function weiter() {
    if (!mannschaft) return;
    uebernehmen({
      gegner: gegnerName(pass, mannschaft),
      spieler: gewaehlt.map(({ s, treffer }) => ({
        vorname: s.vorname,
        nachname: s.nachname,
        passnummer: s.passnummer,
        dbu_nummer: s.dbu_nummer,
        person_id: treffer && treffer.art !== 'neu' ? treffer.person_id : null
      }))
    });
  }

  const passText =
    passend.length === 1 && mannschaft === passend[0]
      ? `passt zu ${eigene}${staffel ? ` (Staffel ${staffel})` : ''}`
      : passend.length > 1
        ? `${passend.length} Mannschaften passen zur Liga, bitte wählen`
        : 'keine Mannschaft in derselben Liga und Staffel gefunden, bitte wählen';

  return (
    <div className="kasten gegnerpass">
      <strong>
        Mannschaftspass {pass.verein} · Saison {pass.saison}
      </strong>
      <div className="zeile raster">
        <label className="feld l">
          <span>Mannschaft</span>
          <select
            value={nummer}
            onChange={(e) => {
              setNummer(Number(e.target.value));
              setAus(new Set());
            }}
          >
            {pass.mannschaften.map((m) => (
              <option key={m.nummer} value={m.nummer}>
                {m.nummer} · {m.ligaText} ({m.spieler.length} Spieler)
              </option>
            ))}
          </select>
        </label>
        <span className="hinweis">{passText}</span>
      </div>
      {gaeste === null ? (
        <p className="hinweis">Vorhandene Gäste werden geladen …</p>
      ) : (
        <table className="tabelle kompakt">
          <thead>
            <tr>
              <th></th>
              <th>Spieler</th>
              <th title="So steht der Spieler auf TV, Live und an den Tablets">Angezeigt als</th>
              <th>DBU-Nr.</th>
              <th title="Ab wann der Spieler laut Pass eingesetzt werden darf">Berechtigt</th>
              <th>In CueDesk</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(({ s, treffer }) => {
              const vorhanden = treffer && treffer.art !== 'neu' ? gaeste.find((g) => g.id === treffer.person_id) : undefined;
              return (
                <tr key={schluessel(s)}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${s.vorname} ${s.nachname} übernehmen`}
                      checked={!aus.has(schluessel(s))}
                      onChange={(e) => {
                        const neu = new Set(aus);
                        if (e.target.checked) neu.delete(schluessel(s));
                        else neu.add(schluessel(s));
                        setAus(neu);
                      }}
                    />
                  </td>
                  <td>
                    {s.vorname} {s.nachname}
                    {s.kapitaen ? ' (K)' : ''}
                  </td>
                  <td>{vorhanden ? vorhanden.anzeige : gastAnzeigename(s.vorname, s.nachname)}</td>
                  <td>{s.dbu_nummer ?? '–'}</td>
                  <td>{DATUM(s.berechtigt_ab)}</td>
                  <td className="hinweis">{treffer ? TREFFER[treffer.art] : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="zeile raster">
        <span className="hinweis">{mannschaft ? hinweis.replace('{gegner}', gegnerName(pass, mannschaft)) : ''}</span>
        <span className="knopfpaar">
          <button type="button" className="gefahrknopf" title="Die eingelesene Datei verwerfen, nichts wird übernommen" onClick={verwerfen}>
            Verwerfen
          </button>
          <button
            type="button"
            className={naechsterSchritt ? 'faellig' : 'hauptaktion'}
            title={naechsterSchritt ? 'Trägt den Gegner ein und merkt die angehakten Spieler vor; gespeichert wird mit Anlegen' : 'Gegner und die angehakten Spieler übernehmen'}
            onClick={weiter}
            disabled={!mannschaft || gaeste === null || gewaehlt.length === 0}
          >
            {knopf}
          </button>
        </span>
      </div>
    </div>
  );
}

// Gaeste anlegen bzw. vorhandene verwenden; Ergebnis sind die Person-IDs in
// der Reihenfolge der Auswahl. Die Verbandsnummern landen in personen_intern,
// soweit die Rolle das darf (Vereins-Admin, Sportwart); sonst wird beim
// naechsten Mal am Namen erkannt.
export async function gegnerGaesteAnlegen(
  vereinId: string,
  spieler: GegnerSpieler[]
): Promise<{ ids: string[]; fehler: string | null }> {
  const ids: string[] = [];
  for (const s of spieler) {
    if (s.person_id) {
      ids.push(s.person_id);
      continue;
    }
    const { data, error } = await supabase
      .from('personen')
      .insert({
        verein_id: vereinId,
        vorname: s.vorname,
        nachname: s.nachname,
        anzeigename: gastAnzeigename(s.vorname, s.nachname),
        status: 'gast'
      })
      .select('id')
      .single();
    if (error || !data) {
      return {
        ids,
        fehler: error?.message.includes('row-level security')
          ? 'Gäste anlegen dürfen Vereins-Admin, Sportwart und Turnierleiter.'
          : error?.message ?? 'Gast nicht angelegt.'
      };
    }
    ids.push(data.id);
    if (s.passnummer || s.dbu_nummer) {
      await supabase
        .from('personen_intern')
        .upsert({ person_id: data.id, verein_id: vereinId, passnummer: s.passnummer, dbu_nummer: s.dbu_nummer });
    }
  }
  return { ids, fehler: null };
}
