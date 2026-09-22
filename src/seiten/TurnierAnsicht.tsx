import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSitzung } from '../sitzung';
import { personName } from '../namen';
import { vorgabe } from '../vorgabe';
import { useRueckfrage } from '../rueckfrage';
import { prognose, prognoseText } from '../zeitprognose';
import { berichtDateiname, berichtPdf } from '../turnierbericht';
import { herunterladen } from '../pdf';
import { angefangen, auslosen, bergerRunden, hoechstwert, rangliste, spielBeendet } from '../turnier';
import type { Gleichstand, RanglistenPartie, Zeile } from '../turnier';
import { endtabelleZweiGruppen, gruppenRangliste, phase2Paare, verteilen, zielGroessen, zuVieleGesetzt } from '../gruppen';
import { DISZIPLIN_TEXT, MODUS_TEXT, STATUS_TEXT } from './Turniere';
import type { TurnierEinstellungen } from './Turniere';
import type { Partie, Person, RatingQuelle, Turnier, TurnierTeilnehmer } from '../datenbank.types';

// Ein Turnier im Modus Einzelgruppe oder Zwei Gruppen: Teilnehmer, Auslosung,
// Spielplan, Tabellen, bei zwei Gruppen die Platzierungsduelle (Phase 2) und
// der Abschluss. Uebernommene Altturniere werden nur angezeigt.

const GRUPPEN = ['A', 'B'];
// Grenzen wie im Turnierplan Gruppen v64
const ZWEI_GRUPPEN_MIN = 4;
const ZWEI_GRUPPEN_MAX = 16;

type Aenderungszeile = { zeitpunkt: string; nachher: Partial<Partie> | null; aktion: string };
type Rueckgaengig = { partieId: string; vorher: Pick<Partie, 'ergebnis_a' | 'ergebnis_b' | 'status' | 'beendet'> };

const QUELLE_KURZ: Partial<Record<RatingQuelle, string>> = {
  vorlaeufig: 'vorläufig',
  'andere-disziplin': 'aus anderer Disziplin',
  vereinsschnitt: 'Vereinsschnitt',
  'von-hand': 'von Hand',
  gast: 'Gast',
  startwert: 'Startwert'
};

const zeitText = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export default function TurnierAnsicht({ turnierId, zurueck }: { turnierId: string; zurueck: () => void }) {
  const { verein, darf } = useSitzung();
  const darfLeiten = darf('vereinsadmin', 'sportwart', 'turnierleiter');
  const istAdmin = darf('vereinsadmin');

  const [turnier, setTurnier] = useState<Turnier | null>(null);
  const [teilnehmer, setTeilnehmer] = useState<TurnierTeilnehmer[]>([]);
  const [partien, setPartien] = useState<Partie[]>([]);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [ratings, setRatings] = useState<Map<string, { wert: number; quelle: RatingQuelle }>>(new Map());
  const [tische, setTische] = useState<Map<string, number>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [suche, setSuche] = useState('');
  const [gastName, setGastName] = useState('');
  const [abschnitt, setAbschnitt] = useState<string | null>(null);
  const [tausch, setTausch] = useState<{ raus: string; von: string; nach: string } | null>(null);
  const [verlauf, setVerlauf] = useState<{ partie: Partie; zeilen: Aenderungszeile[] } | null>(null);
  const [stapel, setStapel] = useState<Rueckgaengig[]>([]);
  const [rueckfrage, fragen] = useRueckfrage();
  const [, setTakt] = useState(0);

  // Zeitprognose haengt an der Uhr, nicht nur an Eingaben
  useEffect(() => {
    const uhr = window.setInterval(() => setTakt((x) => x + 1), 60000);
    return () => window.clearInterval(uhr);
  }, []);

  const laden = useCallback(async () => {
    if (!verein) return;
    const [t, tn, p, pe, ti] = await Promise.all([
      supabase.from('turniere').select('*').eq('id', turnierId).maybeSingle(),
      supabase.from('turnier_teilnehmer').select('*').eq('turnier_id', turnierId),
      supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung'),
      supabase.from('personen').select('*').eq('verein_id', verein.id),
      supabase.from('tische').select('id, nummer').eq('verein_id', verein.id)
    ]);
    if (t.error) setFehler(t.error.message);
    setTurnier(t.data ?? null);
    setTeilnehmer(tn.data ?? []);
    setPartien(p.data ?? []);
    setPersonen(pe.data ?? []);
    setTische(new Map((ti.data ?? []).map((x) => [x.id, x.nummer])));

    // Aktuelle Ratings fuer die Anzeige vor der Auslosung (Disziplin, sonst gesamt)
    if (t.data) {
      const { data: stand } = await supabase
        .from('rating_stand')
        .select('stichtag, disziplin, person_id, wert, quelle')
        .eq('verein_id', verein.id)
        .in('disziplin', [t.data.disziplin, 'gesamt'])
        .order('stichtag', { ascending: false })
        .limit(2000);
      const neueste = new Map<string, string>();
      (stand ?? []).forEach((z) => {
        if (!neueste.has(z.disziplin)) neueste.set(z.disziplin, z.stichtag);
      });
      const karte = new Map<string, { wert: number; quelle: RatingQuelle }>();
      for (const art of ['gesamt', t.data.disziplin]) {
        (stand ?? [])
          .filter((z) => z.disziplin === art && z.stichtag === neueste.get(art))
          .forEach((z) => karte.set(z.person_id, { wert: z.wert, quelle: z.quelle }));
      }
      setRatings(karte);
    }
  }, [verein, turnierId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Ergebnisse und Tischwahl von den Tablets sofort uebernehmen
  useEffect(() => {
    let zeitgeber: number | null = null;
    const partienNeu = async () => {
      const { data } = await supabase.from('partien').select('*').eq('turnier_id', turnierId).order('runde').order('paarung');
      if (data) setPartien(data);
    };
    const kanal = supabase
      .channel(`turnier-leitung-${turnierId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partien', filter: `turnier_id=eq.${turnierId}` }, () => {
        if (zeitgeber !== null) window.clearTimeout(zeitgeber);
        zeitgeber = window.setTimeout(() => void partienNeu(), 300);
      })
      .subscribe();
    return () => {
      if (zeitgeber !== null) window.clearTimeout(zeitgeber);
      void supabase.removeChannel(kanal);
    };
  }, [turnierId]);

  const person = useCallback((id: string) => personen.find((p) => p.id === id), [personen]);
  const anzeige = useCallback(
    (id: string) => {
      const p = person(id);
      return p ? p.anzeigename || `${p.vorname} ${p.nachname}`.trim() : '?';
    },
    [person]
  );

  const einstellungen = (turnier?.einstellungen ?? {}) as TurnierEinstellungen;
  const raceTo = einstellungen.raceTo ?? 5;
  const va = einstellungen.vorgabe ?? { aktiv: false, staerke: 75, obergrenze: 0 };

  // Startnummern-Reihenfolge (Position 0 = Startnummer 1)
  const aufstellung = useMemo(
    () => [...teilnehmer].filter((t) => t.startnummer !== null).sort((a, b) => (a.startnummer ?? 0) - (b.startnummer ?? 0)),
    [teilnehmer]
  );
  const posVon = useMemo(() => new Map(aufstellung.map((t, i) => [t.person_id, i])), [aufstellung]);

  const zwei = turnier?.modus === 'zwei-gruppen';
  const race2 = einstellungen.racePhase2 ?? raceTo;
  const beendetBei = (p: Partie) => spielBeendet(p.ergebnis_a, p.ergebnis_b, p.race_to ?? raceTo);

  // Gruppenspiele (Einzelgruppe: alle) und Platzierungsduelle getrennt
  const gruppenPartien = useMemo(() => partien.filter((p) => p.phase !== 'phase2'), [partien]);
  const duelle = useMemo(
    () => partien.filter((p) => p.phase === 'phase2').sort((a, b) => (a.paarung ?? 0) - (b.paarung ?? 0)),
    [partien]
  );

  // Gruppenmitglieder als Positionen der Startliste; die Startnummern sind je
  // Gruppe fortlaufend vergeben, die Reihenfolge ist damit die der Auslosung.
  const gruppen = useMemo(() => {
    const karte: Record<string, number[]> = Object.fromEntries(GRUPPEN.map((g) => [g, [] as number[]]));
    aufstellung.forEach((t, i) => {
      if (t.gruppe && karte[t.gruppe]) karte[t.gruppe].push(i);
    });
    return karte;
  }, [aufstellung]);

  const eingabe: RanglistenPartie[] = useMemo(
    () =>
      gruppenPartien
        .filter((p) => posVon.has(p.spieler_a) && posVon.has(p.spieler_b))
        .map((p) => ({
          a: posVon.get(p.spieler_a) as number,
          b: posVon.get(p.spieler_b) as number,
          standA: p.ergebnis_a,
          standB: p.ergebnis_b,
          vorgabeA: p.vorgabe_a,
          vorgabeB: p.vorgabe_b
        })),
    [gruppenPartien, posVon]
  );

  const tabelle = useMemo(
    () => rangliste(aufstellung.length, eingabe, einstellungen.handReihenfolge ?? {}),
    [eingabe, aufstellung.length, einstellungen.handReihenfolge]
  );
  const gruppenTabellen = useMemo(
    () =>
      Object.fromEntries(
        GRUPPEN.map((g) => [g, gruppenRangliste(gruppen[g] ?? [], eingabe, einstellungen.handReihenfolge ?? {})])
      ),
    [gruppen, eingabe, einstellungen.handReihenfolge]
  );

  const offeneSpiele = partien.filter((p) => !beendetBei(p)).length;
  const offenInGruppe = (g: string) => gruppenPartien.filter((p) => p.gruppe === g && !beendetBei(p)).length;
  const offeneGruppenspiele = gruppenPartien.filter((p) => !beendetBei(p)).length;
  const irgendeinErgebnis = partien.some((p) => angefangen(p.ergebnis_a, p.ergebnis_b, p.vorgabe_a, p.vorgabe_b));

  // Zwei Gruppen: Endtabelle aus den Duellen; ein unberuehrtes Duell steht
  // auf der Vorgabe (wie in v64 vorbelegt)
  const endtabelle = useMemo(() => {
    const p2 = einstellungen.phase2;
    if (!zwei || !p2) return [];
    return endtabelleZweiGruppen(
      p2.A,
      p2.B,
      p2.A.slice(0, Math.min(p2.A.length, p2.B.length)).map((_, i) => {
        const d = duelle.find((x) => x.paarung === i + 1);
        return { standA: d ? d.ergebnis_a ?? d.vorgabe_a : null, standB: d ? d.ergebnis_b ?? d.vorgabe_b : null };
      }),
      race2
    );
  }, [zwei, einstellungen.phase2, duelle, race2]);

  // Abschnitte des Spielplans: Runden, bei zwei Gruppen je Gruppe, dazu Phase 2
  const abschnitte = useMemo(() => {
    const karte = new Map<string, { schluessel: string; zeile: string; titel: string; ordnung: string; partien: Partie[] }>();
    partien.forEach((p) => {
      const r = p.runde ?? 0;
      const [schluessel, zeile, titel, ordnung] =
        p.phase === 'phase2'
          ? ['P2', 'P2', 'Phase 2', 'Z']
          : p.gruppe
            ? [`${p.gruppe}-${r}`, p.gruppe, `Runde ${r}`, `${p.gruppe}${String(r).padStart(3, '0')}`]
            : [`r${r}`, '', `Runde ${r}`, String(r).padStart(3, '0')];
      const a = karte.get(schluessel) ?? { schluessel, zeile, titel, ordnung, partien: [] };
      a.partien.push(p);
      karte.set(schluessel, a);
    });
    return [...karte.values()].sort((a, b) => a.ordnung.localeCompare(b.ordnung));
  }, [partien]);

  if (!verein) return null;
  if (!turnier) {
    return (
      <div className="einspaltig">
        <p className="hinweis">Lädt.</p>
      </div>
    );
  }

  const bearbeitbar = darfLeiten && turnier.status !== 'beendet' && turnier.quelle !== 'import';
  const ratingVon = (id: string) => {
    if (person(id)?.status === 'gast') return { wert: 500, quelle: 'gast' as RatingQuelle };
    return ratings.get(id) ?? { wert: 500, quelle: 'vereinsschnitt' as RatingQuelle };
  };
  // Setzungen vor der Auslosung: Teilnehmer -> Gruppe
  const gesetztKarte = () =>
    Object.fromEntries(teilnehmer.filter((t) => t.gesetzt && t.gruppe).map((t) => [t.person_id, t.gruppe as string]));

  // ---------- Teilnehmer ----------

  async function teilnehmerHinzu(personId: string) {
    if (!turnier) return;
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .insert({ turnier_id: turnier.id, person_id: personId, verein_id: turnier.verein_id });
    if (error) setFehler(error.message);
    setSuche('');
    await laden();
  }

  async function teilnehmerWeg(personId: string) {
    if (!turnier) return;
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .delete()
      .eq('turnier_id', turnier.id)
      .eq('person_id', personId);
    if (error) setFehler(error.message);
    await laden();
  }

  // Zwei Gruppen: Spieler vor der Auslosung fest in eine Gruppe setzen
  async function setzen(personId: string, gruppe: string) {
    if (!turnier) return;
    const { error } = await supabase
      .from('turnier_teilnehmer')
      .update({ gruppe: gruppe || null, gesetzt: Boolean(gruppe) })
      .eq('turnier_id', turnier.id)
      .eq('person_id', personId);
    if (error) setFehler(error.message);
    await laden();
  }

  async function gastAnlegen() {
    if (!turnier) return;
    const text = gastName.trim().replace(/\s+/g, ' ');
    if (text.length < 2) return setFehler('Bitte den Namen des Gastes eingeben.');
    const teile = text.split(' ');
    const nachname = teile.length > 1 ? (teile.pop() as string) : '';
    const { data, error } = await supabase
      .from('personen')
      .insert({ verein_id: turnier.verein_id, vorname: teile.join(' '), nachname, anzeigename: text, status: 'gast' })
      .select('id')
      .single();
    if (error || !data) {
      return setFehler(
        error?.message.includes('row-level security')
          ? 'Gäste anlegen dürfen bisher nur Vereins-Admin und Sportwart.'
          : error?.message ?? 'Gast nicht angelegt.'
      );
    }
    setGastName('');
    await teilnehmerHinzu(data.id);
  }

  // ---------- Auslosung ----------

  async function auslosenUndStarten() {
    if (!turnier) return;
    if (zwei) {
      if (teilnehmer.length < ZWEI_GRUPPEN_MIN || teilnehmer.length > ZWEI_GRUPPEN_MAX) {
        return setFehler(`Zwei Gruppen: ${ZWEI_GRUPPEN_MIN} bis ${ZWEI_GRUPPEN_MAX} Teilnehmer.`);
      }
      const zuviel = zuVieleGesetzt(teilnehmer.length, gesetztKarte(), GRUPPEN);
      if (zuviel.length > 0) return setFehler(`In Gruppe ${zuviel.join(', ')} sind zu viele Spieler fest gesetzt.`);
    } else if (teilnehmer.length < 3) {
      return setFehler('Für ein Turnier braucht es mindestens drei Teilnehmer.');
    }
    const frage = zwei
      ? `${teilnehmer.length} Teilnehmer auf zwei Gruppen auslosen und das Turnier starten?`
      : `${teilnehmer.length} Teilnehmer auslosen und das Turnier starten?`;
    if (!(await fragen(frage, 'Auslosen'))) return;
    setArbeitet(true);
    setFehler(null);

    // Einzelgruppe: eine Gruppe in ausgeloster Reihenfolge. Zwei Gruppen:
    // Gesetzte in ihre Gruppe, die uebrigen ausgelost (v64). Die Startnummern
    // laufen je Gruppe fortlaufend, A zuerst.
    const verteilung: Record<string, string[]> = zwei
      ? verteilen(
          [...teilnehmer].sort((a, b) => anzeige(a.person_id).localeCompare(anzeige(b.person_id), 'de')).map((t) => t.person_id),
          gesetztKarte(),
          GRUPPEN
        )
      : { '': auslosen(teilnehmer.map((t) => t.person_id)) };
    const gerechnet = Object.entries(verteilung).flatMap(([gruppe, ids]) =>
      ids.map((id) => ({ id, gruppe: gruppe || null, ...ratingVon(id) }))
    );

    // Teilnehmer: Startnummer, Gruppe und eingefrorenes Rating
    for (const [i, g] of gerechnet.entries()) {
      const { error } = await supabase
        .from('turnier_teilnehmer')
        .update({ startnummer: i + 1, gruppe: g.gruppe, rating_eingefroren: g.wert, rating_quelle: g.quelle })
        .eq('turnier_id', turnier.id)
        .eq('person_id', g.id);
      if (error) {
        setArbeitet(false);
        return setFehler(error.message);
      }
    }

    // Spielplan je Gruppe nach dem Berger-Kreis, Vorgabe im Startstand
    const zeilen = Object.entries(verteilung).flatMap(([gruppe, ids]) =>
      bergerRunden(ids.length).flatMap((paare, r) =>
        paare
          .map(([a, b], g) => ({ a, b, g }))
          .filter(({ b }) => b !== -1)
          .map(({ a, b, g }) => {
            const [vA, vB] = vorgabePaar(ratingVon(ids[a]).wert, ratingVon(ids[b]).wert, raceTo);
            return {
              verein_id: turnier.verein_id,
              turnier_id: turnier.id,
              disziplin: turnier.disziplin,
              datum: turnier.datum,
              phase: 'gruppe',
              gruppe: gruppe || null,
              runde: r + 1,
              paarung: g + 1,
              spieler_a: ids[a],
              spieler_b: ids[b],
              race_to: raceTo,
              vorgabe_a: vA,
              vorgabe_b: vB,
              status: 'geplant' as const
            };
          })
      )
    );
    const { error: fehlerPartien } = await supabase.from('partien').insert(zeilen);
    if (fehlerPartien) {
      setArbeitet(false);
      return setFehler(fehlerPartien.message);
    }

    const { error } = await supabase
      .from('turniere')
      .update({
        status: 'laeuft',
        eingefroren_am: new Date().toISOString(),
        teilnehmerzahl: gerechnet.length,
        einstellungen: { ...einstellungen, tvAnsicht: 'auslosung' }
      })
      .eq('id', turnier.id);
    if (error) setFehler(error.message);
    setArbeitet(false);
    setAbschnitt(null);
    await laden();
  }

  function vorgabePaar(ratingA: number, ratingB: number, race: number): [number, number] {
    if (!va.aktiv || ratingA === ratingB) return [0, 0];
    const grenze = va.obergrenze > 0 ? va.obergrenze : Infinity;
    const v = vorgabe(Math.max(ratingA, ratingB), Math.min(ratingA, ratingB), race, va.staerke, grenze);
    return ratingA > ratingB ? [0, v] : [v, 0];
  }

  // Rating eines Teilnehmers von Hand aendern (nur solange kein Ergebnis steht)
  async function ratingAendern(personId: string, text: string) {
    if (!turnier) return;
    const wert = Number(text);
    if (!Number.isInteger(wert) || wert < 100 || wert > 1000) return setFehler('Rating zwischen 100 und 1000.');
    await supabase
      .from('turnier_teilnehmer')
      .update({ rating_eingefroren: wert, rating_quelle: 'von-hand' })
      .eq('turnier_id', turnier.id)
      .eq('person_id', personId);
    const werte = new Map(teilnehmer.map((t) => [t.person_id, t.rating_eingefroren ?? 500]));
    werte.set(personId, wert);
    for (const p of partien.filter((x) => x.spieler_a === personId || x.spieler_b === personId)) {
      const [vA, vB] = vorgabePaar(werte.get(p.spieler_a) ?? 500, werte.get(p.spieler_b) ?? 500, p.race_to ?? raceTo);
      await supabase.from('partien').update({ vorgabe_a: vA, vorgabe_b: vB }).eq('id', p.id);
    }
    await laden();
  }

  // ---------- Ergebnisse ----------

  async function ergebnisSetzen(p: Partie, a: number | null, b: number | null, merken = true) {
    const race = p.race_to ?? raceTo;
    // Eine Seite leer, die andere eingetragen: leere Seite steht auf der Vorgabe
    if (a !== null && b === null) b = p.vorgabe_b;
    if (b !== null && a === null) a = p.vorgabe_a;
    if (a !== null && b !== null) {
      if (a > hoechstwert(b, race) || b > hoechstwert(a, race)) {
        return setFehler(`Bei Race to ${race} ist dieser Stand nicht möglich.`);
      }
    }
    const leer = a === null || b === null || !angefangen(a, b, p.vorgabe_a, p.vorgabe_b);
    const fertig = spielBeendet(a, b, race);
    const neu = {
      ergebnis_a: leer ? null : a,
      ergebnis_b: leer ? null : b,
      status: (leer ? 'geplant' : fertig ? 'beendet' : 'laeuft') as Partie['status'],
      beendet: fertig ? p.beendet ?? new Date().toISOString() : null
    };
    setFehler(null);
    const { error } = await supabase.from('partien').update(neu).eq('id', p.id);
    if (error) return setFehler(error.message);
    if (merken) {
      setStapel((s) => [
        ...s.slice(-49),
        { partieId: p.id, vorher: { ergebnis_a: p.ergebnis_a, ergebnis_b: p.ergebnis_b, status: p.status, beendet: p.beendet } }
      ]);
    }
    setPartien((liste) => liste.map((x) => (x.id === p.id ? { ...x, ...neu } : x)));
    if (!leer) await turnierBegonnen();
  }

  // Erstes Ergebnis: Beginn fuer die Zeitprognose merken, TV von der
  // Auslosung auf die Live-Tische umschalten.
  async function turnierBegonnen() {
    if (!turnier) return;
    const aenderung: TurnierEinstellungen = {};
    if (!einstellungen.beginn) aenderung.beginn = new Date().toISOString();
    if (einstellungen.tvAnsicht === 'auslosung') aenderung.tvAnsicht = 'live';
    if (Object.keys(aenderung).length > 0) await einstellungenSetzen(aenderung);
  }

  async function einstellungenSetzen(aenderung: TurnierEinstellungen) {
    if (!turnier) return;
    const neu = { ...einstellungen, ...aenderung };
    const { error } = await supabase.from('turniere').update({ einstellungen: neu }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setTurnier({ ...turnier, einstellungen: neu });
  }

  const uhr = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  function berichtErzeugen() {
    if (!turnier) return;
    const mitRating = va.aktiv;
    const ratingVonPerson = (id: string) => teilnehmer.find((t) => t.person_id === id)?.rating_eingefroren ?? null;
    const z = zeitDaten();
    const zeit = z.art === 'beendet' ? ` · Von ${uhr(z.beginn)} bis ${uhr(z.ende)}` : '';
    const datumText = new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const bytes = berichtPdf({
      titel: turnier.name,
      kopf:
        `${DISZIPLIN_TEXT[turnier.disziplin]} · Race to ${raceTo} · ${aufstellung.length} Spieler · ${datumText}${zeit}` +
        (va.aktiv ? ` · Handicap ${va.staerke} %${va.obergrenze > 0 ? `, Obergrenze ${va.obergrenze}` : ''}` : ''),
      vorlaeufig: turnier.status !== 'beendet',
      zeilen: berichtZeilen().map(({ zeile, platz }) => ({
        platz,
        name: anzeige(aufstellung[zeile.pos]?.person_id ?? ''),
        punkte: zeile.punkte,
        gewonnen: zeile.gewonnen,
        verloren: zeile.verloren,
        diff: zeile.diff,
        rating: mitRating ? aufstellung[zeile.pos]?.rating_eingefroren ?? null : null
      })),
      stichkampf: alleFertig && !zwei
        ? tabelle.gleichstaende.map(
            (g) =>
              `Platz ${g.start + 1}-${g.start + g.mitglieder.length}: ${
                g.entschieden ? 'Reihenfolge durch die Turnierleitung festgelegt' : 'Stichkampf offen, vorläufige Reihenfolge'
              }.`
          )
        : [],
      runden: abschnitte.map((a) => ({
        name: a.zeile === 'P2' ? 'Phase 2' : a.zeile ? `Gruppe ${a.zeile} · ${a.titel}` : a.titel,
        spiele: a.partien.map((s) => ({
          nameA: anzeige(s.spieler_a),
          nameB: anzeige(s.spieler_b),
          standA: s.ergebnis_a,
          standB: s.ergebnis_b,
          vorgabeA: s.vorgabe_a,
          vorgabeB: s.vorgabe_b,
          ratingA: mitRating ? ratingVonPerson(s.spieler_a) : null,
          ratingB: mitRating ? ratingVonPerson(s.spieler_b) : null
        }))
      }))
    });
    herunterladen(bytes, berichtDateiname(turnier.name, turnier.datum));
  }

  // Zeilen des Berichts: Einzelgruppe nach der Tabelle; zwei Gruppen nach der
  // Endtabelle, vor Phase 2 Gruppe A, dann Gruppe B. Die Werte stammen aus der
  // Gruppenphase. (Der eigene Bericht fuer Gruppenturniere folgt in Teil C.)
  function berichtZeilen(): { zeile: Zeile; platz: number }[] {
    if (!zwei) return tabelle.zeilen.map((zeile, i) => ({ zeile, platz: i + 1 }));
    const alle = GRUPPEN.flatMap((g) => gruppenTabellen[g].zeilen);
    if (endtabelle.length === 0) return alle.map((zeile, i) => ({ zeile, platz: i + 1 }));
    return endtabelle.flatMap((z) => {
      const zeile = alle.find((x) => aufstellung[x.pos]?.person_id === z.wer);
      return zeile ? [{ zeile, platz: z.platz }] : [];
    });
  }

  // Beginn: erstes Ergebnis oder erster Spielstart; Ende: letztes beendetes Spiel
  function zeitDaten() {
    const zeiten = (liste: (string | null | undefined)[]) =>
      liste.filter((x): x is string => Boolean(x)).map((x) => Date.parse(x));
    const anfang = zeiten([einstellungen.beginn, ...partien.map((x) => x.begonnen), ...partien.map((x) => x.beendet)]);
    const schluss = zeiten(partien.map((x) => x.beendet));
    // Zwei Gruppen vor Phase 2: die Duelle zaehlen schon mit (v64 phase2Duelle)
    const kommend = zwei && !einstellungen.phase2 ? Math.min(gruppen.A.length, gruppen.B.length) : 0;
    return prognose(
      [
        ...partien.map((x) => ({
          standA: x.ergebnis_a,
          standB: x.ergebnis_b,
          vorgabeA: x.vorgabe_a,
          vorgabeB: x.vorgabe_b,
          raceTo: x.race_to ?? raceTo
        })),
        ...Array.from({ length: kommend }, () => ({ standA: null, standB: null, vorgabeA: 0, vorgabeB: 0, raceTo: race2 }))
      ],
      anfang.length ? Math.min(...anfang) : null,
      schluss.length ? Math.max(...schluss) : null
    );
  }

  async function rueckgaengig() {
    const letzter = stapel[stapel.length - 1];
    if (!letzter) return;
    const { error } = await supabase.from('partien').update(letzter.vorher).eq('id', letzter.partieId);
    if (error) return setFehler(error.message);
    setStapel((s) => s.slice(0, -1));
    setPartien((liste) => liste.map((x) => (x.id === letzter.partieId ? { ...x, ...letzter.vorher } : x)));
    setMeldung('Letzte Eingabe zurückgenommen.');
  }

  async function verlaufZeigen(p: Partie) {
    const { data, error } = await supabase
      .from('aenderungen')
      .select('zeitpunkt, nachher, aktion')
      .eq('tabelle', 'partien')
      .eq('datensatz_id', p.id)
      .order('zeitpunkt', { ascending: false })
      .limit(50);
    if (error) return setFehler(error.message);
    setVerlauf({ partie: p, zeilen: (data ?? []) as Aenderungszeile[] });
  }

  async function standWiederherstellen(p: Partie, z: Aenderungszeile) {
    const alt = z.nachher ?? {};
    await ergebnisSetzen(p, alt.ergebnis_a ?? null, alt.ergebnis_b ?? null);
    setVerlauf(null);
    setMeldung('Stand wiederhergestellt.');
  }

  // ---------- Stichkampf und Abschluss ----------

  async function handReihenfolgeSetzen(schluessel: string, reihenfolge: number[] | null) {
    if (!turnier) return;
    const hand = { ...(einstellungen.handReihenfolge ?? {}) };
    if (reihenfolge) hand[schluessel] = reihenfolge;
    else delete hand[schluessel];
    const neu = { ...einstellungen, handReihenfolge: hand };
    const { error } = await supabase.from('turniere').update({ einstellungen: neu }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    setTurnier({ ...turnier, einstellungen: neu });
  }

  // ---------- Zwei Gruppen: Tausch und Phase 2 ----------

  // Tausch zweier Spieler zwischen den Gruppen, nur vor dem ersten Ergebnis.
  // Beide uebernehmen Startnummer und Plaetze im Spielplan des anderen; die
  // Vorgaben rechnen sich neu, Setzungen wandern mit (v64 applySwap).
  async function gruppeTauschen(raus: string, rein: string) {
    if (!turnier || !tausch) return;
    const a = teilnehmer.find((t) => t.person_id === raus);
    const b = teilnehmer.find((t) => t.person_id === rein);
    if (!a || !b || a.gruppe === b.gruppe || irgendeinErgebnis) return setTausch(null);
    setArbeitet(true);
    const aendern = (t: TurnierTeilnehmer, neu: TurnierTeilnehmer) =>
      supabase
        .from('turnier_teilnehmer')
        .update({ startnummer: neu.startnummer, gruppe: neu.gruppe })
        .eq('turnier_id', turnier.id)
        .eq('person_id', t.person_id);
    await aendern(b, a);
    await aendern(a, b);
    const werte = new Map(teilnehmer.map((t) => [t.person_id, t.rating_eingefroren ?? 500]));
    const tauschen = (id: string) => (id === raus ? rein : id === rein ? raus : id);
    for (const p of gruppenPartien.filter((x) => [raus, rein].includes(x.spieler_a) || [raus, rein].includes(x.spieler_b))) {
      const sa = tauschen(p.spieler_a);
      const sb = tauschen(p.spieler_b);
      const [vA, vB] = vorgabePaar(werte.get(sa) ?? 500, werte.get(sb) ?? 500, p.race_to ?? raceTo);
      // Die Partie bleibt in ihrer Gruppe, nur die Spieler wechseln
      await supabase.from('partien').update({ spieler_a: sa, spieler_b: sb, vorgabe_a: vA, vorgabe_b: vB }).eq('id', p.id);
    }
    await einstellungenSetzen({
      tausch: [
        ...(einstellungen.tausch ?? []),
        { raus, rein, von: a.gruppe ?? '', nach: b.gruppe ?? '', zeit: new Date().toISOString() }
      ]
    });
    setArbeitet(false);
    setTausch(null);
    setMeldung(`Getauscht: ${anzeige(raus)} in Gruppe ${b.gruppe}, ${anzeige(rein)} in Gruppe ${a.gruppe}.`);
    await laden();
  }

  // Phase 2: die Gruppenreihenfolge wird fixiert, danach spielt A1 gegen B1,
  // A2 gegen B2 und so fort (v64 startPhase2)
  async function phase2Starten() {
    if (!turnier) return;
    if (offeneGruppenspiele > 0) {
      return setFehler(`Phase 2 kann noch nicht starten: ${offeneGruppenspiele} Gruppenspiele sind nicht beendet.`);
    }
    const offen = GRUPPEN.flatMap((g) => gruppenTabellen[g].gleichstaende.filter((x) => !x.entschieden)).length;
    if (
      offen > 0 &&
      !(await fragen(
        `In den Gruppen gibt es ${offen} ungeklärte Platzierung(en) (Stichkampf offen). Die angezeigte Reihenfolge wird fixiert. Trotzdem starten?`,
        'Trotzdem starten'
      ))
    )
      return;
    if (offen === 0 && !(await fragen('Phase 2 starten? Die Gruppenplätze werden fixiert.', 'Phase 2 starten'))) return;
    setArbeitet(true);
    const reihe = (g: string) => gruppenTabellen[g].zeilen.map((z) => aufstellung[z.pos].person_id);
    const p2 = { A: reihe('A'), B: reihe('B') };
    const werte = new Map(teilnehmer.map((t) => [t.person_id, t.rating_eingefroren ?? 500]));
    const zeilen = phase2Paare(p2.A, p2.B).duelle.map(([x, y], i) => {
      const [vA, vB] = vorgabePaar(werte.get(x) ?? 500, werte.get(y) ?? 500, race2);
      return {
        verein_id: turnier.verein_id,
        turnier_id: turnier.id,
        disziplin: turnier.disziplin,
        datum: turnier.datum,
        phase: 'phase2',
        paarung: i + 1,
        spieler_a: x,
        spieler_b: y,
        race_to: race2,
        vorgabe_a: vA,
        vorgabe_b: vB,
        status: 'geplant' as const
      };
    });
    const { error } = await supabase.from('partien').insert(zeilen);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    await einstellungenSetzen({ phase2: p2 });
    setArbeitet(false);
    setAbschnitt('P2');
    await laden();
  }

  async function phase2Zuruecksetzen() {
    if (!turnier) return;
    const frage = 'Phase 2 zurücksetzen? Die Duell-Ergebnisse gehen verloren, die Gruppenphase bleibt erhalten.';
    if (!(await fragen(frage, 'Zurücksetzen'))) return;
    const { error } = await supabase.from('partien').delete().eq('turnier_id', turnier.id).eq('phase', 'phase2');
    if (error) return setFehler(error.message);
    const neu = { ...einstellungen };
    delete neu.phase2;
    await supabase.from('turniere').update({ einstellungen: neu }).eq('id', turnier.id);
    setAbschnitt(null);
    setMeldung('Phase 2 zurückgesetzt.');
    await laden();
  }

  async function abschliessen() {
    if (!turnier) return;
    if (zwei && !einstellungen.phase2) return setFehler('Zuerst Phase 2 starten und ausspielen.');
    if (offeneSpiele > 0) return setFehler(`Es sind noch ${offeneSpiele} Spiele offen.`);
    const offen = zwei ? [] : tabelle.gleichstaende.filter((g) => !g.entschieden);
    if (offen.length > 0 && !(await fragen('Ein Stichkampf ist noch nicht entschieden. Trotzdem abschließen?'))) return;
    const frage = 'Turnier abschließen?\nEndplätze werden gespeichert, das Rating wird neu berechnet.';
    if (!(await fragen(frage, 'Abschließen'))) return;
    setArbeitet(true);
    const plaetze: [string, number][] = zwei
      ? endtabelle.map((z) => [z.wer, z.platz])
      : tabelle.zeilen.map((z, i) => [aufstellung[z.pos].person_id, i + 1]);
    for (const [personId, platz] of plaetze) {
      await supabase
        .from('turnier_teilnehmer')
        .update({ endplatz: platz })
        .eq('turnier_id', turnier.id)
        .eq('person_id', personId);
    }
    const { error } = await supabase
      .from('turniere')
      .update({
        status: 'beendet',
        teilnehmerzahl: aufstellung.length,
        einstellungen: { ...einstellungen, tvAnsicht: 'results', pausiert: false }
      })
      .eq('id', turnier.id);
    if (error) {
      setArbeitet(false);
      return setFehler(error.message);
    }
    const rating = await supabase.functions.invoke('rating', { body: { verein_id: turnier.verein_id } });
    setArbeitet(false);
    setMeldung(
      rating.error ? 'Turnier abgeschlossen. Das Rating wird heute Nacht neu berechnet.' : 'Turnier abgeschlossen, Rating neu berechnet.'
    );
    await laden();
  }

  async function wiederOeffnen() {
    if (!turnier || !(await fragen('Turnier wieder öffnen? Ergebnisse lassen sich dann wieder ändern.', 'Wieder öffnen'))) return;
    const { error } = await supabase.from('turniere').update({ status: 'laeuft' }).eq('id', turnier.id);
    if (error) return setFehler(error.message);
    await laden();
  }

  async function loeschen() {
    if (!turnier || !(await fragen(`„${turnier.name}“ mit allen Teilnehmern und Partien löschen?`, 'Löschen'))) return;
    const { error } = await supabase.from('turniere').delete().eq('id', turnier.id);
    if (error) return setFehler(error.message);
    zurueck();
  }

  // ---------- Anzeige ----------

  const teilnehmerIds = new Set(teilnehmer.map((t) => t.person_id));
  const vorschlaege =
    suche.trim().length > 0
      ? personen
          .filter((p) => p.status !== 'ausgetreten' && !teilnehmerIds.has(p.id))
          .filter((p) => `${p.vorname} ${p.nachname} ${p.anzeigename ?? ''}`.toLowerCase().includes(suche.toLowerCase()))
          .sort((a, b) => personName(a).localeCompare(personName(b), 'de'))
          .slice(0, 8)
      : [];

  // Angezeigter Abschnitt: gewaehlt, sonst der erste mit offenem Spiel
  const aktiv =
    abschnitte.find((a) => a.schluessel === abschnitt) ??
    abschnitte.find((a) => a.partien.some((p) => p.status !== 'beendet')) ??
    abschnitte[0];
  const alleFertig = partien.length > 0 && offeneSpiele === 0;
  const zeilenDerAbschnitte = [...new Set(abschnitte.map((a) => a.zeile))];

  // Wer im angezeigten Abschnitt spielfrei ist
  const spielfreiText = (() => {
    if (!aktiv) return '';
    if (aktiv.zeile === 'P2') {
      const p2 = einstellungen.phase2;
      return p2 ? phase2Paare(p2.A, p2.B).spielfrei.map(anzeige).join(', ') : '';
    }
    const kreis = aktiv.zeile ? (gruppen[aktiv.zeile] ?? []) : aufstellung.map((_, i) => i);
    if (kreis.length % 2 === 0) return '';
    const spielen = new Set(aktiv.partien.flatMap((p) => [p.spieler_a, p.spieler_b]));
    return kreis
      .map((pos) => aufstellung[pos].person_id)
      .filter((id) => !spielen.has(id))
      .map(anzeige)
      .join(', ');
  })();

  // Setzungen vor der Auslosung
  const gesetztVorher = gesetztKarte();
  const zuviel = zwei ? zuVieleGesetzt(teilnehmer.length, gesetztVorher, GRUPPEN) : [];
  const ziel = zielGroessen(teilnehmer.length, GRUPPEN);
  const teilnehmerOk = zwei
    ? teilnehmer.length >= ZWEI_GRUPPEN_MIN && teilnehmer.length <= ZWEI_GRUPPEN_MAX && zuviel.length === 0
    : teilnehmer.length >= 3;

  const tabellenname = (pos: number) => anzeige(aufstellung[pos]?.person_id ?? '');

  return (
    <div className="einspaltig">
      <section className="block">
        <div className="bearbeitenkopf">
          <div>
            <button type="button" className="zurueck" onClick={zurueck}>
              ← Turniere
            </button>
            <h2>{turnier.name}</h2>
            <p className="hinweis">
              {new Date(`${turnier.datum}T12:00:00`).toLocaleDateString('de-DE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}{' '}
              · {DISZIPLIN_TEXT[turnier.disziplin]} · {MODUS_TEXT[turnier.modus]}
              {turnier.quelle !== 'import' && (zwei ? ` · Race to ${raceTo}, Phase 2 Race to ${race2}` : ` · Race to ${raceTo}`)}
              {va.aktiv && ` · Vorgabe ${va.staerke} %${va.obergrenze > 0 ? `, höchstens ${va.obergrenze}` : ''}`}
              {!turnier.rating_werten && ' · zählt nicht fürs Rating'}
            </p>
            {turnier.quelle !== 'import' && prognoseText(zeitDaten()) && (
              <p className="hinweis">{prognoseText(zeitDaten())}</p>
            )}
          </div>
          <div className="knopfpaar">
            <span className={`marke ${turnier.status === 'laeuft' ? 'livelaeuft' : ''}`}>{STATUS_TEXT[turnier.status]}</span>
            {bearbeitbar && turnier.status === 'laeuft' && (
              <button type="button" onClick={() => void einstellungenSetzen({ pausiert: !einstellungen.pausiert })}>
                {einstellungen.pausiert ? 'Fortsetzen' : 'Pausieren'}
              </button>
            )}
            {turnier.quelle !== 'import' && turnier.status !== 'geplant' && (
              <button type="button" onClick={berichtErzeugen}>
                Bericht (PDF)
              </button>
            )}
            {bearbeitbar && turnier.status === 'laeuft' && (
              <button type="button" onClick={() => void abschliessen()} disabled={arbeitet}>
                Abschließen
              </button>
            )}
            {istAdmin && turnier.status === 'beendet' && turnier.quelle !== 'import' && (
              <button type="button" onClick={() => void wiederOeffnen()}>
                Wieder öffnen
              </button>
            )}
          </div>
        </div>
        {darfLeiten && turnier.quelle !== 'import' && turnier.status !== 'geplant' && (
          <div className="zeile">
            <span className="hinweis">TV zeigt:</span>
            <span className="umschalter">
              {(
                [
                  ['auslosung', 'Auslosung'],
                  ['live', 'Live-Tische'],
                  ['results', 'Ergebnis']
                ] as const
              ).map(([wert, name]) => (
                <button
                  key={wert}
                  type="button"
                  className={(einstellungen.tvAnsicht ?? 'live') === wert ? 'aktiv' : ''}
                  onClick={() => void einstellungenSetzen({ tvAnsicht: wert })}
                >
                  {name}
                </button>
              ))}
            </span>
          </div>
        )}
        {einstellungen.pausiert && turnier.status === 'laeuft' && (
          <div className="pausehinweis">
            <strong>Turnier pausiert.</strong> An den Tablets kann kein neues Spiel gestartet werden; laufende Spiele gehen
            weiter.
            {bearbeitbar && (
              <button type="button" className="klein" onClick={() => void einstellungenSetzen({ pausiert: false })}>
                Fortsetzen
              </button>
            )}
          </div>
        )}
        {fehler && <p className="fehler">{fehler}</p>}
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      {turnier.quelle === 'import' ? (
        <Altturnier teilnehmer={teilnehmer} partien={partien} anzeige={anzeige} />
      ) : turnier.status === 'geplant' ? (
        <section className="block">
          <h2>Teilnehmer ({teilnehmer.length})</h2>
          <table className="tabelle">
            <tbody>
              {[...teilnehmer]
                .sort((a, b) => anzeige(a.person_id).localeCompare(anzeige(b.person_id), 'de'))
                .map((t) => {
                  const r = ratingVon(t.person_id);
                  return (
                    <tr key={t.person_id}>
                      <td>
                        {anzeige(t.person_id)}
                        {person(t.person_id)?.status === 'gast' && <span className="marke">Gast</span>}
                      </td>
                      <td className="rechts">
                        {r.wert}
                        {QUELLE_KURZ[r.quelle] && <span className="marke">{QUELLE_KURZ[r.quelle]}</span>}
                      </td>
                      {zwei && (
                        <td className="rechts">
                          {bearbeitbar ? (
                            <select
                              title="Fest in eine Gruppe setzen; wer auf „–“ steht, wird ausgelost"
                              value={t.gesetzt ? t.gruppe ?? '' : ''}
                              onChange={(e) => void setzen(t.person_id, e.target.value)}
                            >
                              <option value="">–</option>
                              {GRUPPEN.map((g) => (
                                <option key={g} value={g}>
                                  gesetzt {g}
                                </option>
                              ))}
                            </select>
                          ) : (
                            t.gesetzt && t.gruppe && `gesetzt ${t.gruppe}`
                          )}
                        </td>
                      )}
                      <td className="rechts">
                        {bearbeitbar && (
                          <button type="button" onClick={() => void teilnehmerWeg(t.person_id)}>
                            Entfernen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {teilnehmer.length === 0 && (
                <tr>
                  <td className="hinweis">Noch niemand angemeldet.</td>
                </tr>
              )}
            </tbody>
          </table>

          {bearbeitbar && (
            <>
              <div className="zeile">
                <input placeholder="Mitglied suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
              </div>
              {vorschlaege.length > 0 && (
                <div className="filterzeile">
                  {vorschlaege.map((p) => (
                    <button key={p.id} type="button" className="chip" onClick={() => void teilnehmerHinzu(p.id)}>
                      + {personName(p)}
                      {p.status === 'gast' ? ' (Gast)' : ''}
                    </button>
                  ))}
                </div>
              )}
              <div className="zeile">
                <input placeholder="Neuer Gast: Vor- und Nachname" value={gastName} onChange={(e) => setGastName(e.target.value)} />
                <button type="button" onClick={() => void gastAnlegen()}>
                  Gast hinzufügen
                </button>
              </div>
              <div className="knopfpaar">
                <button type="button" onClick={() => void auslosenUndStarten()} disabled={arbeitet || !teilnehmerOk}>
                  Auslosen und starten
                </button>
                <button type="button" className="gefahrknopf" onClick={() => void loeschen()}>
                  Turnier löschen
                </button>
              </div>
              {zwei ? (
                <>
                  {zuviel.length > 0 && (
                    <p className="fehler">
                      Zu viele Setzungen in Gruppe {zuviel.join(', ')}. Möglich sind{' '}
                      {GRUPPEN.map((g) => `${g}: ${ziel[g]}`).join(', ')} Spieler.
                    </p>
                  )}
                  <p className="hinweis">
                    {ZWEI_GRUPPEN_MIN} bis {ZWEI_GRUPPEN_MAX} Teilnehmer. Beim Auslosen kommen gesetzte Spieler in ihre
                    Gruppe, alle übrigen werden verteilt; bei ungerader Zahl bekommt Gruppe A einen Spieler mehr. Der
                    Spielplan entsteht je Gruppe, die Ratings werden eingefroren. Gäste starten mit 500.
                  </p>
                </>
              ) : (
                <p className="hinweis">
                  Beim Auslosen werden die Startnummern zufällig vergeben, der Spielplan entsteht und die Ratings werden
                  eingefroren. Gäste starten mit 500.
                </p>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <div className="turnierzweier">
            <section className="block">
              <h2>Teilnehmer</h2>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Nr.</th>
                    <th>Name</th>
                    {zwei && <th>Gruppe</th>}
                    <th className="rechts">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {aufstellung.map((t) => (
                    <tr key={t.person_id}>
                      <td>{t.startnummer}</td>
                      <td>
                        {anzeige(t.person_id)}
                        {person(t.person_id)?.status === 'gast' && <span className="marke">Gast</span>}
                      </td>
                      {zwei && (
                        <td>
                          {bearbeitbar && !irgendeinErgebnis && !einstellungen.phase2 ? (
                            <select
                              title="Gruppe wechseln (als Tausch mit einem Spieler der anderen Gruppe)"
                              value={t.gruppe ?? ''}
                              onChange={(e) =>
                                e.target.value !== t.gruppe &&
                                setTausch({ raus: t.person_id, von: t.gruppe ?? '', nach: e.target.value })
                              }
                            >
                              {GRUPPEN.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          ) : (
                            t.gruppe
                          )}
                          {t.gesetzt && <span className="marke">gesetzt</span>}
                        </td>
                      )}
                      <td className="rechts">
                        {bearbeitbar && !irgendeinErgebnis ? (
                          <input
                            className="zahlfeld"
                            defaultValue={t.rating_eingefroren ?? ''}
                            onBlur={(e) => {
                              if (e.target.value !== String(t.rating_eingefroren ?? '')) void ratingAendern(t.person_id, e.target.value);
                            }}
                          />
                        ) : (
                          t.rating_eingefroren
                        )}
                        {t.rating_quelle && QUELLE_KURZ[t.rating_quelle] && (
                          <span className="marke">{QUELLE_KURZ[t.rating_quelle]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hinweis">
                {irgendeinErgebnis
                  ? `Ratings eingefroren am ${turnier.eingefroren_am ? zeitText(turnier.eingefroren_am) : '–'}.`
                  : 'Bis zum ersten Ergebnis lassen sich die Ratings noch von Hand ändern; die Vorgaben rechnen sich neu.'}
              </p>
            </section>

            <section className="block">
              <div className="bearbeitenkopf">
                <h2>Spielplan</h2>
                {bearbeitbar && (
                  <button type="button" onClick={() => void rueckgaengig()} disabled={stapel.length === 0}>
                    Rückgängig{stapel.length > 0 ? ` (${stapel.length})` : ''}
                  </button>
                )}
              </div>
              {zeilenDerAbschnitte.map((zeile) => (
                <div key={zeile} className="filterzeile">
                  {zeile && zeile !== 'P2' && <span className="hinweis">Gruppe {zeile}:</span>}
                  {abschnitte
                    .filter((a) => a.zeile === zeile)
                    .map((a) => (
                      <button
                        key={a.schluessel}
                        type="button"
                        className={a.schluessel === aktiv?.schluessel ? 'chip aktiv' : 'chip'}
                        onClick={() => setAbschnitt(a.schluessel)}
                      >
                        {zeile && zeile !== 'P2' ? a.titel.replace('Runde ', '') : a.titel}
                        {a.partien.every(beendetBei) ? ' ✓' : ''}
                      </button>
                    ))}
                </div>
              ))}
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Spiel</th>
                    <th className="rechts">Vorgabe</th>
                    <th className="rechts">Stand</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(aktiv?.partien ?? []).map((p) => (
                    <Spielzeile
                      key={p.id}
                      partie={p}
                      raceTo={p.race_to ?? raceTo}
                      nameA={anzeige(p.spieler_a)}
                      nameB={anzeige(p.spieler_b)}
                      tisch={p.tisch_id ? tische.get(p.tisch_id) ?? null : null}
                      bearbeitbar={bearbeitbar}
                      speichern={(a, b) => void ergebnisSetzen(p, a, b)}
                      verlauf={() => void verlaufZeigen(p)}
                    />
                  ))}
                </tbody>
              </table>
              {spielfreiText && (
                <p className="hinweis">
                  Spielfrei{aktiv?.zeile === 'P2' ? '' : ` in ${aktiv?.zeile ? `Gruppe ${aktiv.zeile}, ` : ''}${aktiv?.titel}`}:{' '}
                  {spielfreiText}
                </p>
              )}
            </section>
          </div>

          {zwei ? (
            <>
              <div className="turnierzweier">
                {GRUPPEN.map((g) => (
                  <section key={g} className="block">
                    <h2>
                      Gruppe {g}
                      {turnier.status === 'laeuft' && !einstellungen.phase2 ? ' (live)' : ''}
                    </h2>
                    <Tabelle
                      zeilen={gruppenTabellen[g].zeilen}
                      gleichstaende={gruppenTabellen[g].gleichstaende}
                      stichkampf={offenInGruppe(g) === 0 && !einstellungen.phase2}
                      name={tabellenname}
                      bearbeitbar={bearbeitbar}
                      setzen={(k, r) => void handReihenfolgeSetzen(k, r)}
                    />
                    <p className="hinweis">
                      {offenInGruppe(g) > 0
                        ? `Noch ${offenInGruppe(g)} Spiele offen. Ein Stichkampf wird erst angeboten, wenn alle Spiele der Gruppe beendet sind.`
                        : einstellungen.phase2
                          ? 'Gruppenplätze für Phase 2 fixiert.'
                          : 'Reihenfolge: Punkte, Satzdifferenz, direkter Vergleich, danach Stichkampf.'}
                    </p>
                  </section>
                ))}
              </div>

              <section className="block">
                <div className="bearbeitenkopf">
                  <h2>Phase 2: Platzierungsduelle (Race to {race2})</h2>
                  {bearbeitbar && !einstellungen.phase2 && (
                    <button type="button" onClick={() => void phase2Starten()} disabled={arbeitet || offeneGruppenspiele > 0}>
                      Phase 2 starten
                    </button>
                  )}
                  {bearbeitbar && einstellungen.phase2 && (
                    <button type="button" className="gefahrknopf" onClick={() => void phase2Zuruecksetzen()}>
                      Phase 2 zurücksetzen
                    </button>
                  )}
                </div>
                {!einstellungen.phase2 ? (
                  <p className="hinweis">
                    {offeneGruppenspiele > 0
                      ? `Noch ${offeneGruppenspiele} Gruppenspiele nicht beendet. Phase 2 kann erst danach starten.`
                      : 'Alle Gruppenspiele beendet. Phase 2 fixiert die Gruppenplätze: A1 gegen B1, A2 gegen B2 und so fort.'}
                  </p>
                ) : (
                  <>
                    <h3>Endtabelle</h3>
                    <table className="tabelle">
                      <thead>
                        <tr>
                          <th>Pl.</th>
                          <th>Name</th>
                          <th>Gruppe</th>
                          <th className="rechts">Duell</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {endtabelle.map((z) => (
                          <tr key={z.wer} className={z.offen ? '' : 'gespielt'}>
                            <td>{z.platz}</td>
                            <td>{anzeige(z.wer)}</td>
                            <td>
                              {teilnehmer.find((t) => t.person_id === z.wer)?.gruppe}
                              {z.gruppenplatz}
                            </td>
                            <td className="rechts">{z.ergebnis}</td>
                            <td className="hinweis">{z.offen ? 'offen' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hinweis">
                      Sieger von Duell 1 ist Platz 1, Verlierer Platz 2, Sieger von Duell 2 Platz 3 und so fort. Die
                      Duelle stehen im Spielplan unter „Phase 2“.
                    </p>
                  </>
                )}
              </section>
            </>
          ) : (
            <section className="block">
              <h2>Rangliste{turnier.status === 'laeuft' ? ' (live)' : ''}</h2>
              <Tabelle
                zeilen={tabelle.zeilen}
                gleichstaende={tabelle.gleichstaende}
                stichkampf={alleFertig}
                name={tabellenname}
                bearbeitbar={bearbeitbar}
                setzen={(k, r) => void handReihenfolgeSetzen(k, r)}
              />
              <p className="hinweis">
                {offeneSpiele > 0
                  ? `Noch ${offeneSpiele} Spiele offen. Ein Stichkampf wird erst angeboten, wenn alle Spiele beendet sind.`
                  : 'Reihenfolge: Punkte, Satzdifferenz, direkter Vergleich, danach Stichkampf.'}
              </p>
            </section>
          )}
        </>
      )}

      {rueckfrage}
      {tausch && (
        <div className="dialoghintergrund" onClick={() => setTausch(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Gruppe tauschen</h2>
            <p>
              <strong>{anzeige(tausch.raus)}</strong> soll in Gruppe {tausch.nach}. Wer wechselt dafür nach Gruppe{' '}
              {tausch.von}?
            </p>
            <div className="knopfpaar">
              {aufstellung
                .filter((t) => t.gruppe === tausch.nach)
                .map((t) => (
                  <button key={t.person_id} type="button" disabled={arbeitet} onClick={() => void gruppeTauschen(tausch.raus, t.person_id)}>
                    {anzeige(t.person_id)}
                  </button>
                ))}
            </div>
            <p className="hinweis">Die Gruppenstärken bleiben gleich, beide übernehmen den Platz des anderen im Spielplan.</p>
            <button type="button" onClick={() => setTausch(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {verlauf && (
        <div className="dialoghintergrund" onClick={() => setVerlauf(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>
              Verlauf: {anzeige(verlauf.partie.spieler_a)} – {anzeige(verlauf.partie.spieler_b)}
            </h2>
            <table className="tabelle">
              <tbody>
                {verlauf.zeilen.map((z, i) => (
                  <tr key={i}>
                    <td>{zeitText(z.zeitpunkt)}</td>
                    <td className="rechts">
                      {z.nachher?.ergebnis_a ?? '–'} : {z.nachher?.ergebnis_b ?? '–'}
                    </td>
                    <td className="rechts">
                      {i > 0 && bearbeitbar && (
                        <button type="button" onClick={() => void standWiederherstellen(verlauf.partie, z)}>
                          Wiederherstellen
                        </button>
                      )}
                      {i === 0 && <span className="hinweis">aktuell</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setVerlauf(null)}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Tabelle einer Gruppe (Einzelgruppe: des ganzen Turniers) mit Stichkampf.
// Der Stichkampf wird erst angeboten, wenn alle Spiele beendet sind.
function Tabelle(props: {
  zeilen: Zeile[];
  gleichstaende: Gleichstand[];
  stichkampf: boolean;
  name: (pos: number) => string;
  bearbeitbar: boolean;
  setzen: (schluessel: string, reihenfolge: number[] | null) => void;
}) {
  return (
    <table className="tabelle">
      <thead>
        <tr>
          <th>Pl.</th>
          <th>Name</th>
          <th className="rechts">Spiele</th>
          <th className="rechts">Punkte</th>
          <th className="rechts">Sätze</th>
          <th className="rechts">Satz-Diff.</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {props.zeilen.map((z, i) => {
          const gruppe = props.stichkampf
            ? props.gleichstaende.find((g) => i >= g.start && i < g.start + g.mitglieder.length)
            : undefined;
          const inGruppe = gruppe ? i - gruppe.start : -1;
          const schieben = (nach: number) => {
            if (!gruppe) return;
            const r = [...gruppe.mitglieder];
            [r[nach], r[inGruppe]] = [r[inGruppe], r[nach]];
            props.setzen(gruppe.schluessel, r);
          };
          return (
            <tr key={z.pos}>
              <td>{i + 1}</td>
              <td>{props.name(z.pos)}</td>
              <td className="rechts">{z.spiele}</td>
              <td className="rechts">{z.punkte}</td>
              <td className="rechts">
                {z.gewonnen} : {z.verloren}
              </td>
              <td className="rechts">{z.diff > 0 ? `+${z.diff}` : z.diff}</td>
              <td className="rechts">
                {gruppe && (
                  <span className={`marke ${gruppe.entschieden ? '' : 'stichkampf'}`}>
                    {gruppe.entschieden ? 'Stichkampf entschieden' : 'Stichkampf offen'}
                  </span>
                )}
                {gruppe && props.bearbeitbar && (
                  <>
                    <button type="button" className="klein" disabled={inGruppe === 0} title="nach oben" onClick={() => schieben(inGruppe - 1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="klein"
                      disabled={inGruppe === gruppe.mitglieder.length - 1}
                      title="nach unten"
                      onClick={() => schieben(inGruppe + 1)}
                    >
                      ↓
                    </button>
                    {gruppe.entschieden && inGruppe === 0 && (
                      <button type="button" className="klein" onClick={() => props.setzen(gruppe.schluessel, null)}>
                        zurücksetzen
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Eine Spielzeile mit zwei Eingabefeldern. Gespeichert wird beim Verlassen
// des Feldes oder mit Enter.
function Spielzeile(props: {
  partie: Partie;
  raceTo: number;
  nameA: string;
  nameB: string;
  tisch: number | null;
  bearbeitbar: boolean;
  speichern: (a: number | null, b: number | null) => void;
  verlauf: () => void;
}) {
  const { partie: p } = props;
  const text = (w: number | null) => (w === null ? '' : String(w));
  const [a, setA] = useState(text(p.ergebnis_a));
  const [b, setB] = useState(text(p.ergebnis_b));
  const zeile = useRef<HTMLTableRowElement>(null);

  // Neuer Stand von aussen (Rueckgaengig, Verlauf, spaeter Tablet): uebernehmen,
  // solange hier niemand tippt.
  useEffect(() => {
    if (zeile.current?.contains(document.activeElement)) return;
    setA(text(p.ergebnis_a));
    setB(text(p.ergebnis_b));
  }, [p.ergebnis_a, p.ergebnis_b]);

  const zahl = (t: string) => (t.trim() === '' ? null : Number(t));
  // Gespeichert wird erst, wenn der Cursor die Zeile verlaesst, nicht beim
  // Wechsel zwischen den beiden Feldern desselben Spiels.
  const uebernehmen = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.relatedTarget && zeile.current?.contains(e.relatedTarget as Node)) return;
    const na = zahl(a);
    const nb = zahl(b);
    if (na === p.ergebnis_a && nb === p.ergebnis_b) return;
    props.speichern(na, nb);
  };
  const fertig = spielBeendet(p.ergebnis_a, p.ergebnis_b, props.raceTo);
  const vorgabeText = p.vorgabe_a || p.vorgabe_b ? `${p.vorgabe_a} : ${p.vorgabe_b}` : '–';
  const status = fertig
    ? 'fertig'
    : props.tisch !== null
      ? `● Tisch ${props.tisch}`
      : p.status === 'laeuft'
        ? 'läuft'
        : 'offen';

  const feld = (wert: string, setzen: (t: string) => void, platzhalter: number) =>
    props.bearbeitbar ? (
      <input
        className="zahlfeld"
        inputMode="numeric"
        value={wert}
        placeholder={String(platzhalter)}
        onChange={(e) => setzen(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={uebernehmen}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const felder = zeile.current?.querySelectorAll('input') ?? [];
          // Enter im ersten Feld springt ins zweite, im zweiten wird gespeichert
          if (e.target === felder[0] && felder[1]) (felder[1] as HTMLInputElement).focus();
          else (e.target as HTMLInputElement).blur();
        }}
      />
    ) : (
      <span>{wert === '' ? '–' : wert}</span>
    );

  return (
    <tr ref={zeile} className={fertig ? 'gespielt' : ''}>
      <td>
        {props.nameA} – {props.nameB}
      </td>
      <td className="rechts hinweis">{vorgabeText}</td>
      <td className="rechts">
        {feld(a, setA, p.vorgabe_a)} : {feld(b, setB, p.vorgabe_b)}
      </td>
      <td className={fertig ? 'livelaeuft' : 'hinweis'}>{status}</td>
      <td className="rechts">
        <button type="button" className="klein" title="Verlauf" onClick={props.verlauf}>
          Verlauf
        </button>
      </td>
    </tr>
  );
}

// Uebernommenes Altturnier: Endplaetze und Partien, nur lesen
function Altturnier({
  teilnehmer,
  partien,
  anzeige
}: {
  teilnehmer: TurnierTeilnehmer[];
  partien: Partie[];
  anzeige: (id: string) => string;
}) {
  const plaetze = [...teilnehmer].sort((a, b) => (a.endplatz ?? 999) - (b.endplatz ?? 999));
  return (
    <div className="turnierzweier">
      <section className="block">
        <h2>Endstand</h2>
        <table className="tabelle">
          <tbody>
            {plaetze.map((t) => (
              <tr key={t.person_id}>
                <td>{t.endplatz ?? '–'}</td>
                <td>{anzeige(t.person_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="block">
        <h2>Partien ({partien.length})</h2>
        <table className="tabelle">
          <tbody>
            {partien.map((p) => (
              <tr key={p.id}>
                <td className="hinweis">{p.phase ?? ''}</td>
                <td>
                  {anzeige(p.spieler_a)} – {anzeige(p.spieler_b)}
                </td>
                <td className="rechts">
                  {p.ergebnis_a ?? '–'} : {p.ergebnis_b ?? '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hinweis">Übernommen aus Turnier light, nur zum Nachsehen.</p>
      </section>
    </div>
  );
}
