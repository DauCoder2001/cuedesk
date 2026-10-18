import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { anmeldungOffen, ausschreibungUebersicht, meldeschlussText } from '../ausschreibung';
import type { Person, Turnier, TurnierAnmeldung } from '../datenbank.types';
import type { TurnierEinstellungen } from './Turniere';

// Oben auf der Seite Turniere: alle Turniere mit offener Ausschreibung. Jedes
// Mitglied mit Konto meldet sich hier selbst an oder ab (turnier_anmelden in
// der Datenbank prueft Verein, Spieler und Meldeschluss).

const tagLang = (datum: string) =>
  new Date(`${datum}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function Ausschreibungen({
  turniere,
  hervorheben
}: {
  turniere: Turnier[];
  hervorheben?: string | null; // Turnier aus dem Link der Ausschreibung
}) {
  const { verein, sitzung } = useSitzung();
  const [anmeldungen, setAnmeldungen] = useState<TurnierAnmeldung[]>([]);
  const [teilnehmer, setTeilnehmer] = useState<{ turnier_id: string; person_id: string }[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [eigene, setEigene] = useState<string | null | undefined>(undefined); // undefined: noch nicht geladen
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const offene = useMemo(
    () =>
      turniere
        .filter((t) => t.status === 'geplant' && (t.einstellungen as TurnierEinstellungen)?.ausschreibung?.offen)
        .sort((a, b) => a.datum.localeCompare(b.datum)),
    [turniere]
  );
  const ids = offene.map((t) => t.id).join(',');

  const laden = useCallback(async () => {
    if (!verein || !sitzung || !ids) return;
    const [a, p, e, tn] = await Promise.all([
      supabase.from('turnier_anmeldungen').select('*').in('turnier_id', ids.split(',')),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('benutzer_personen').select('person_id').eq('benutzer_id', sitzung.user.id).eq('verein_id', verein.id),
      supabase.from('turnier_teilnehmer').select('turnier_id, person_id').in('turnier_id', ids.split(','))
    ]);
    if (a.error) setFehler(a.error.message);
    setAnmeldungen(a.data ?? []);
    setTeilnehmer(tn.data ?? []);
    setPersonen(p.data ?? []);
    setEigene(e.data?.[0]?.person_id ?? null);
  }, [verein, sitzung, ids]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Aus dem Link gekommen: dorthin scrollen, den Parameter aus der Adresse nehmen
  useEffect(() => {
    if (!hervorheben || offene.length === 0) return;
    document.getElementById(`ausschreibung-${hervorheben}`)?.scrollIntoView({ block: 'center' });
    const url = new URL(window.location.href);
    if (url.searchParams.has('anmeldung')) {
      url.searchParams.delete('anmeldung');
      window.history.replaceState(null, '', url.toString());
    }
  }, [hervorheben, offene.length]);

  if (offene.length === 0) return null;

  const name = (id: string) => {
    const p = personen.find((x) => x.id === id);
    return p ? personName(p) : '?';
  };

  async function umschalten(t: Turnier, an: boolean) {
    setFehler(null);
    setArbeitet(t.id);
    const { error } = await supabase.rpc('turnier_anmelden', { p_turnier: t.id, p_an: an });
    setArbeitet(null);
    if (error) return setFehler(error.message);
    await laden();
  }

  return (
    <section className="block">
      <h2>Ausschreibungen</h2>
      {eigene === null && (
        <p className="hinweis">
          Dein Konto ist noch mit keinem Spieler verknüpft. Das macht der Vereins-Administrator unter Konten und Rollen.
          Bis dahin trägt dich die Turnierleitung ein.
        </p>
      )}
      {fehler && <p className="fehler">{fehler}</p>}
      <table className="tabelle ausschreibungsliste">
        <tbody>
          {offene.map((t) => {
            const a = (t.einstellungen as TurnierEinstellungen).ausschreibung;
            // Auch von der Turnierleitung eingetragene Spieler zaehlen als Teilnehmer
            const ueber = ausschreibungUebersicht(
              anmeldungen.filter((x) => x.turnier_id === t.id),
              teilnehmer.filter((x) => x.turnier_id === t.id).map((x) => x.person_id),
              eigene ?? null
            );
            const dabeiNamen = ueber.teilnehmer.map(name).sort((x, y) => x.localeCompare(y, 'de'));
            const ich = ueber.ich;
            const offen = anmeldungOffen(a, t.status);
            return (
              <tr key={t.id} id={`ausschreibung-${t.id}`} className={t.id === hervorheben ? 'hervorgehoben' : ''}>
                <td>
                  <strong>{t.name}</strong>
                  <div className="hinweis">
                    {tagLang(t.datum)}
                    {a?.uhrzeit ? ` · ${a.uhrzeit} Uhr` : ''}
                    {a?.meldeschluss ? ` · Meldeschluss ${meldeschlussText(a.meldeschluss, t.datum)}` : ''}
                    {a?.startgeld ? ` · Startgeld ${a.startgeld}` : ''}
                    {` · ${ueber.teilnehmer.length} Teilnehmer`}
                    {a?.hoechstens ? ` (höchstens ${a.hoechstens})` : ''}
                    {ueber.nachruecker.length > 0 ? ` · ${ueber.nachruecker.length} Nachrücker` : ''}
                  </div>
                  {(dabeiNamen.length > 0 || ueber.nachruecker.length > 0) && (
                    <div className="hinweis">
                      {[...dabeiNamen, ...ueber.nachruecker.map((id) => `${name(id)} (Nachrücker)`)].join(', ')}
                    </div>
                  )}
                </td>
                <td className="rechts">
                  {ich && (
                    <span className={ich === 'nachruecker' ? 'marke warnmarke' : 'marke gutmarke'}>
                      {ich === 'nachruecker' ? 'du bist Nachrücker' : 'du bist Teilnehmer'}
                    </span>
                  )}
                  {!offen ? (
                    <div className="hinweis">Meldeschluss vorbei</div>
                  ) : (
                    eigene && (
                      <div>
                        <button
                          type="button"
                          className="klein"
                          title={ich ? 'Deine Anmeldung zurückziehen' : 'Dich für dieses Turnier anmelden'}
                          disabled={arbeitet === t.id}
                          onClick={() => void umschalten(t, !ich)}
                        >
                          {ich ? 'Abmelden' : 'Anmelden'}
                        </button>
                      </div>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
