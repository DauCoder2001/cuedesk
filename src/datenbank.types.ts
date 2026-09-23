// Typen zum Datenbankschema (Stufe 1). Sie sind von Hand gepflegt und muessen
// zu supabase/migrations passen. Zum Abgleich laesst sich jederzeit
//   npx supabase gen types typescript --project-id <id>
// aufrufen und vergleichen.

export type Rolle = 'vereinsadmin' | 'sportwart' | 'turnierleiter' | 'mitglied';
export type PersonenStatus = 'mitglied' | 'gast' | 'ausgetreten';

export type Verein = {
  id: string;
  name: string;
  kurzname: string;
  slug: string;
  logo_url: string | null;
  farbe: string | null;
  aktiv: boolean;
  erstellt_am: string;
};

export type Benutzer = {
  id: string;
  email: string | null;
  anzeigename: string | null;
  systemadmin: boolean;
  aktiv: boolean;
  erstellt_am: string;
  angemeldet_am: string | null;
};

export type BenutzerRecht = {
  benutzer_id: string;
  verein_id: string;
  darf_einladen: boolean;
};

export type BenutzerRolle = {
  benutzer_id: string;
  verein_id: string;
  rolle: Rolle;
};

export type Person = {
  id: string;
  verein_id: string;
  vorname: string;
  nachname: string;
  anzeigename: string | null;
  kuerzel: string | null;
  status: PersonenStatus;
  name_oeffentlich: boolean;
  rating_ausgeblendet: boolean;
  erstellt_am: string;
  geaendert_am: string;
};

export type PersonIntern = {
  person_id: string;
  verein_id: string;
  eintritt: string | null;
  austritt: string | null;
  minderjaehrig: boolean;
  rating_startwert: number | null;
  notiz: string | null;
};

export type BenutzerPerson = {
  benutzer_id: string;
  verein_id: string;
  person_id: string;
};

export type Einladung = {
  id: string;
  verein_id: string;
  email: string;
  rollen: Rolle[];
  person_id: string | null;
  eingeladen_von: string | null;
  erstellt_am: string;
  angenommen_am: string | null;
};

export type Tisch = {
  id: string;
  verein_id: string;
  nummer: number;
  bezeichnung: string | null;
  aktiv: boolean;
};

export type Geraet = {
  id: string;
  verein_id: string;
  auth_id: string;
  name: string;
  tisch_id: string | null;
  aktiv: boolean;
  zuletzt_gesehen: string | null;
  erstellt_am: string;
};

export type Aenderung = {
  id: number;
  zeitpunkt: string;
  benutzer_id: string | null;
  verein_id: string | null;
  tabelle: string;
  datensatz_id: string | null;
  aktion: string;
  vorher: unknown;
  nachher: unknown;
};


export type Disziplin = '8-ball' | '9-ball' | '10-ball' | 'multi-ball' | '14-1';
export type TurnierModus = 'einzelgruppe' | 'zwei-gruppen' | 'gruppen-ko' | 'einzelspiel' | 'liga' | 'sonstiges';
export type TurnierStatus = 'geplant' | 'laeuft' | 'beendet' | 'abgebrochen';
export type PartieStatus = 'geplant' | 'laeuft' | 'beendet' | 'abgebrochen';
export type RatingQuelle =
  | 'eigene-daten' | 'vorlaeufig' | 'andere-disziplin'
  | 'startwert' | 'vereinsschnitt' | 'von-hand' | 'gast';

export type Serie = {
  id: string;
  verein_id: string;
  name: string;
  saison: string | null;
  disziplin: Disziplin;
  streicher: number;
  bonus: number;
  aktiv: boolean;
  alt_id: string | null;
  erstellt_am: string;
};

export type Turnier = {
  id: string;
  verein_id: string;
  name: string;
  datum: string;
  disziplin: Disziplin;
  modus: TurnierModus;
  teilnehmerzahl: number | null;
  serie_id: string | null;
  status: TurnierStatus;
  rating_werten: boolean;
  eingefroren_am: string | null;
  einstellungen: Record<string, unknown>;
  quelle: string;
  alt_id: string | null;
  importiert_am: string | null;
  erstellt_am: string;
};

export type TurnierTeilnehmer = {
  turnier_id: string;
  person_id: string;
  verein_id: string;
  startnummer: number | null;
  gruppe: string | null;
  gesetzt: boolean;
  endplatz: number | null;
  rating_eingefroren: number | null;
  rating_quelle: RatingQuelle | null;
};

export type Partie = {
  id: string;
  verein_id: string;
  turnier_id: string | null;
  disziplin: Disziplin;
  datum: string;
  phase: string | null;
  gruppe: string | null;
  runde: number | null;
  paarung: number | null;
  tisch_id: string | null;
  spieler_a: string;
  spieler_b: string;
  race_to: number | null;
  vorgabe_a: number;
  vorgabe_b: number;
  ergebnis_a: number | null;
  ergebnis_b: number | null;
  status: PartieStatus;
  rating_werten: boolean;
  rating_grund: string | null;
  begonnen: string | null;
  beendet: string | null;
  eingetragen_von: string | null;
  erstellt_am: string;
};

export type LiveStand = {
  tisch_id: string;
  verein_id: string;
  zustand: unknown; // Stand, wie das Scoreboard ihn schreibt
  besitzer: string | null;
  aktualisiert: string;
};

export type Partie141 = {
  partie_id: string;
  verein_id: string;
  ziel_punkte: number;
  ziel_aufnahmen: number;
  aufnahmen_a: number;
  aufnahmen_b: number;
  hoechstserie_a: number;
  hoechstserie_b: number;
  dauer_sek: number | null;
};

export type Aufnahme141 = {
  id: number;
  partie_id: string;
  verein_id: string;
  lfd_nr: number;
  spieler: string;
  baelle: number;
  punkte: number;
  gesamt: number;
  art: 'serie' | 'sicherheit' | 'foul' | 'foul3' | 'eroeffnungsfoul' | 'ende';
  markierung: '' | '/' | '//' | '3F' | '-2';
  rack_segmente: number[];
  rack_nr: number;
  zeitpunkt: string | null;
};

export type RatingEinstellungen = {
  verein_id: string;
  zeitraum_monate: number;
  mindest_racks: number;
  rueckgriff_monate: number;
  gewicht: number;
  staerke_prozent: number;
  vereinsschnitt: number;
};

export type RatingStand = {
  verein_id: string;
  stichtag: string;
  disziplin: string;
  person_id: string;
  wert: number;
  racks: number;
  quelle: RatingQuelle;
};

export type RatingPartie = {
  id: string;
  verein_id: string;
  turnier_id: string | null;
  disziplin: Disziplin;
  datum: string;
  spieler_a: string;
  spieler_b: string;
  racks_a: number;
  racks_b: number;
};

type Tabelle<Zeile, Neu = Partial<Zeile>, Aenderung = Partial<Zeile>> = {
  Row: Zeile;
  Insert: Neu;
  Update: Aenderung;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      vereine: Tabelle<Verein>;
      benutzer: Tabelle<Benutzer>;
      benutzer_rollen: Tabelle<BenutzerRolle, BenutzerRolle>;
      benutzer_rechte: Tabelle<BenutzerRecht, BenutzerRecht>;
      benutzer_personen: Tabelle<BenutzerPerson, BenutzerPerson>;
      personen: Tabelle<Person, Partial<Person> & Pick<Person, 'verein_id' | 'vorname' | 'nachname'>>;
      personen_intern: Tabelle<PersonIntern, Partial<PersonIntern> & Pick<PersonIntern, 'person_id' | 'verein_id'>>;
      einladungen: Tabelle<Einladung, Omit<Einladung, 'id' | 'erstellt_am' | 'angenommen_am'>>;
      tische: Tabelle<Tisch, Omit<Tisch, 'id'>>;
      geraete: Tabelle<Geraet>;
      aenderungen: Tabelle<Aenderung>;
      serien: Tabelle<Serie, Partial<Serie> & Pick<Serie, 'verein_id' | 'name'>>;
      turniere: Tabelle<Turnier, Partial<Turnier> & Pick<Turnier, 'verein_id' | 'name' | 'datum'>>;
      turnier_teilnehmer: Tabelle<TurnierTeilnehmer, Partial<TurnierTeilnehmer> & Pick<TurnierTeilnehmer, 'turnier_id' | 'person_id' | 'verein_id'>>;
      partien: Tabelle<Partie, Partial<Partie> & Pick<Partie, 'verein_id' | 'datum' | 'spieler_a' | 'spieler_b'>>;
      live_stand: Tabelle<LiveStand, Partial<LiveStand> & Pick<LiveStand, 'tisch_id' | 'verein_id'>>;
      partien_141: Tabelle<Partie141, Partial<Partie141> & Pick<Partie141, 'partie_id' | 'verein_id'>>;
      aufnahmen_141: Tabelle<Aufnahme141, Omit<Aufnahme141, 'id'>>;
      rating_einstellungen: Tabelle<RatingEinstellungen, Partial<RatingEinstellungen> & Pick<RatingEinstellungen, 'verein_id'>>;
      rating_stand: Tabelle<RatingStand, RatingStand>;
    };
    Views: { rating_partien: Tabelle<RatingPartie, never, never> };
    Functions: {
      ist_systemadmin: { Args: Record<string, never>; Returns: boolean };
      hat_rolle: { Args: { p_verein: string; p_rollen: Rolle[] }; Returns: boolean };
      ist_im_verein: { Args: { p_verein: string }; Returns: boolean };
      darf_einladen: { Args: { p_verein: string }; Returns: boolean };
      geraet_verein: { Args: Record<string, never>; Returns: string };
      kopplung_anfordern: { Args: Record<string, never>; Returns: string };
      geraet_meldet_sich: { Args: Record<string, never>; Returns: undefined };
      geraet_tisch_setzen: { Args: { p_tisch: string | null }; Returns: undefined };
      geraet_koppeln: {
        Args: { p_code: string; p_verein: string; p_name: string; p_tisch?: string };
        Returns: string;
      };
    };
    Enums: { rolle: Rolle; personen_status: PersonenStatus };
    CompositeTypes: Record<string, never>;
  };
};
