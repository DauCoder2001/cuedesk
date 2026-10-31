import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { personName } from '../namen';
import { useRueckfrage } from '../rueckfrage';
import type { Person } from '../datenbank.types';
import { useSitzung } from '../sitzung';
import { ratingAn } from '../vereinseinstellungen';

// Spieler -> geoeffneter Spieler -> "Doppelten Eintrag übernehmen": ein
// zweiter Eintrag derselben Person (z. B. aus einem Import) geht in diesem auf.
// Die Arbeit macht die Datenbankfunktion personen_zusammenfuehren in einem
// Schritt; hier gibt es vorher die Uebersicht und das Schutzwort.

type Umfang = { turniere: number; partien: number; kader: number; einwilligungen: number; konto: boolean };

const STATUS = { mitglied: '', gast: ' (Gast)', ausgetreten: ' (ausgetreten)' } as const;
const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

export default function SpielerZusammenfuehren({
  vereinId,
  behalten,
  personen,
  fertig
}: {
  vereinId: string;
  behalten: Person;
  personen: Person[];
  fertig: () => Promise<void> | void;
}) {
  const mitRating = ratingAn(useSitzung().verein);
  const [weg, setWeg] = useState('');
  const [umfang, setUmfang] = useState<Umfang | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [rueckfrage, fragen] = useRueckfrage();

  const auswahl = personen
    .filter((p) => p.id !== behalten.id && !p.anonymisiert_am)
    .sort((a, b) => personName(a).localeCompare(personName(b), 'de'));
  const doppelt = personen.find((p) => p.id === weg) ?? null;

  // Beim Wechsel des Spielers zuruecksetzen
  useEffect(() => {
    setWeg('');
    setUmfang(null);
    setFehler(null);
    setMeldung(null);
  }, [behalten.id]);

  // Vorschau: was am doppelten Eintrag haengt
  useEffect(() => {
    setUmfang(null);
    if (!weg) return;
    let vorbei = false;
    const zaehle = (tabelle: 'turnier_teilnehmer' | 'mannschaft_spieler' | 'einwilligungen' | 'benutzer_personen') =>
      supabase.from(tabelle).select('person_id', { count: 'exact', head: true }).eq('person_id', weg);
    void Promise.all([
      zaehle('turnier_teilnehmer'),
      supabase
        .from('partien')
        .select('id', { count: 'exact', head: true })
        .or(`spieler_a.eq.${weg},spieler_b.eq.${weg},partner_a.eq.${weg},partner_b.eq.${weg}`),
      zaehle('mannschaft_spieler'),
      zaehle('einwilligungen'),
      zaehle('benutzer_personen')
    ]).then(([t, p, k, e, b]) => {
      if (vorbei) return;
      setUmfang({ turniere: t.count ?? 0, partien: p.count ?? 0, kader: k.count ?? 0, einwilligungen: e.count ?? 0, konto: (b.count ?? 0) > 0 });
    });
    return () => {
      vorbei = true;
    };
  }, [weg]);

  async function zusammenfuehren() {
    if (!doppelt || !umfang) return;
    setFehler(null);
    setMeldung(null);
    const text =
      `„${personName(doppelt)}“ in „${personName(behalten)}“ aufgehen lassen?\n\n` +
      `Übernommen werden ${anzahl(umfang.turniere, 'Turnier', 'Turniere')} und ${anzahl(umfang.partien, 'Partie', 'Partien')}` +
      `${umfang.kader ? `, ${umfang.kader}× Kader` : ''}${umfang.einwilligungen ? `, ${anzahl(umfang.einwilligungen, 'Einwilligung', 'Einwilligungen')}` : ''}` +
      `${umfang.konto ? ' und die Konto-Verknüpfung' : ''}. Der Eintrag „${personName(doppelt)}“ wird danach gelöscht.`;
    if (!(await fragen(text, 'Zusammenführen', { schutzwort: vereinId }))) return;
    setLaeuft(true);
    const { data, error } = await supabase.rpc('personen_zusammenfuehren', { p_behalten: behalten.id, p_weg: doppelt.id });
    setLaeuft(false);
    if (error) return setFehler(error.message);
    const erg = (data ?? {}) as { turniere?: number; partien?: number };
    setMeldung(
      `Zusammengeführt: ${anzahl(erg.turniere ?? 0, 'Turnier', 'Turniere')} und ${anzahl(erg.partien ?? 0, 'Partie', 'Partien')} gehören jetzt zu ${personName(behalten)}. ` +
        (mitRating ? 'Danach unter Rating „Jetzt neu berechnen“.' : '')
    );
    setWeg('');
    await fertig();
  }

  return (
    <div className="kasten">
      <div className="feldkopf">Doppelten Eintrag übernehmen</div>
      <p className="hinweis" style={{ marginTop: 0 }}>
        Gibt es diesen Spieler zweimal (z. B. nach einem Import unter anderem Namen), den doppelten Eintrag hier auswählen.
        Turniere, Partien, Kader, Einwilligungen und eine Konto-Verknüpfung gehen auf {personName(behalten)} über, der
        doppelte Eintrag wird gelöscht.
      </p>
      <div className="zeile">
        <select value={weg} onChange={(e) => setWeg(e.target.value)} disabled={laeuft} title="Der doppelte Eintrag, der aufgelöst wird">
          <option value="">doppelten Eintrag wählen …</option>
          {auswahl.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p)}
              {p.anzeigename && p.anzeigename !== personName(p) ? ` · ${p.anzeigename}` : ''}
              {STATUS[p.status]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="gefahrknopf"
          onClick={() => void zusammenfuehren()}
          disabled={laeuft || !umfang}
          title="Den doppelten Eintrag in diesem Spieler aufgehen lassen"
        >
          {laeuft ? 'Führt zusammen …' : 'Zusammenführen'}
        </button>
      </div>
      {doppelt && umfang && (
        <p className="hinweis">
          Wird übernommen: {anzahl(umfang.turniere, 'Turnier', 'Turniere')}, {anzahl(umfang.partien, 'Partie', 'Partien')},{' '}
          {umfang.kader}× Kader, {anzahl(umfang.einwilligungen, 'Einwilligung', 'Einwilligungen')}
          {umfang.konto ? ', Konto-Verknüpfung' : ''}.
        </p>
      )}
      {fehler && <p className="fehler">{fehler}</p>}
      {meldung && <p className="meldung">{meldung}</p>}
      {rueckfrage}
    </div>
  );
}
