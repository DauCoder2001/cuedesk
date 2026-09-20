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
      personen: Tabelle<Person, Omit<Person, 'id' | 'erstellt_am' | 'geaendert_am'>>;
      personen_intern: Tabelle<PersonIntern, PersonIntern>;
      einladungen: Tabelle<Einladung, Omit<Einladung, 'id' | 'erstellt_am' | 'angenommen_am'>>;
      tische: Tabelle<Tisch, Omit<Tisch, 'id'>>;
      geraete: Tabelle<Geraet>;
      aenderungen: Tabelle<Aenderung>;
    };
    Views: Record<string, never>;
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
