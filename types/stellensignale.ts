// ─────────────────────────────────────────────────────────────────
// Typen für das STELLENSIGNAL-Modul.
// Eigenständig wie das Recherche-Modul — eigene Tabellen (zielfirmen,
// stellen_signale, blacklist_inserenten). Schreibt AUSSCHLIESSLICH diese
// drei Tabellen. Kein Zugriff auf primesocial_leads / research_* / manual_*.
// Kein Mail-Versand — die Versand-Anbindung ist Phase 2.
// ─────────────────────────────────────────────────────────────────

// Status einer Zielfirma. Nur 'aktiv' wird vom Crawler bearbeitet.
export type ZielfirmaStatus = "aktiv" | "cooldown" | "gesperrt" | "kunde";
export const ZIELFIRMA_STATUSES: ZielfirmaStatus[] = ["aktiv", "cooldown", "gesperrt", "kunde"];

// Gewerk — bewusst offener Text (nicht als DB-Enum), damit neue Gewerke ohne
// Migration dazukommen können. Diese Liste ist die UI-/Filter-Referenz.
export type Gewerk = "elektro" | "shk" | "metall" | "bau" | "galabau" | "industrie";
export const GEWERKE: Gewerk[] = ["elektro", "shk", "metall", "bau", "galabau", "industrie"];

// Quelle eines Signals. Discovery-Plattformen + (per-Firma) Karriereseite.
export type SignalQuelle = "karriereseite" | "arbeitsagentur" | "indeed" | "kleinanzeigen";
export const SIGNAL_QUELLEN: SignalQuelle[] = [
  "karriereseite",
  "arbeitsagentur",
  "indeed",
  "kleinanzeigen",
];

export interface Zielfirma {
  id: string;
  firma: string;
  website: string | null;
  karriere_url: string | null;
  gewerk: string | null;
  ort: string | null;
  plz: string | null;
  mitarbeiter_geschaetzt: number | null;
  gf_name: string | null;
  email: string | null;
  email_quelle: string | null;      // anzeige | impressum | pattern | hunter
  email_confidence: number | null;  // 0–100; niedrig = vermutet
  status: ZielfirmaStatus;
  cooldown_bis: string | null; // ISO-Date
  quelle: string | null;
  created_at: string;
  updated_at: string;
}

export interface StellenSignal {
  id: string;
  zielfirma_id: string;
  stellentitel: string;
  quelle: SignalQuelle;
  quelle_url: string | null;
  erstfund: string;      // ISO-Date
  letzter_fund: string;  // ISO-Date
  ist_fachkraft: boolean;
  raw_text: string | null;
  created_at: string;
  updated_at: string;
}

// Zeile der View v_stellen_signale — StellenSignal + Firmen-Kontext +
// berechnete Felder (wochen_offen, ist_heiss). Read-only.
export interface StellenSignalView extends StellenSignal {
  firma: string;
  gewerk: string | null;
  ort: string | null;
  plz: string | null;
  website: string | null;
  firma_status: ZielfirmaStatus;
  wochen_offen: number;
  ist_heiss: boolean;
  tage_seit_letztem_fund: number;
}

export interface BlacklistInserent {
  id: string;
  name: string;
  aktiv: boolean;
  created_at: string;
}

// Rohe Anzeige, wie ein Crawl-Adapter sie liefert — VOR Störer-Filter und
// Fachkraft-Qualifizierung. Noch kein DB-Objekt.
export interface RohAnzeige {
  stellentitel: string;
  quelle: SignalQuelle;
  quelle_url: string | null;
  raw_text: string | null;
  // Optionaler Inserent-Name (v.a. Arbeitsagentur/Indeed) für den Blacklist-Check.
  inserent: string | null;
  // Optionale Bewerbungs-E-Mail-Adresse aus der Anzeige für den Domain-Abgleich.
  bewerbung_email: string | null;
}

// Ergebnis des Störer-Filters — warum eine Anzeige verworfen wurde (oder nicht).
export interface FilterErgebnis {
  akzeptiert: boolean;
  grund: string | null; // null wenn akzeptiert
}

// Treffer aus dem DISCOVERY-Scrape einer Plattform. Enthält — anders als
// RohAnzeige — auch die FIRMEN-IDENTITÄT, weil beim Discovery die Firma aus
// der Anzeige erst entsteht (sie steht noch nicht in zielfirmen).
export interface DiscoveryTreffer {
  // Firmen-Identität (aus der Anzeige extrahiert)
  firma: string;
  ort: string | null;
  plz: string | null;
  website: string | null;   // auf Plattformen oft nicht vorhanden
  gewerk: string | null;    // aus dem Such-Kontext (Ziel-Gewerk) ableitbar
  mitarbeiter: number | null; // grobe Schätzung (Obergrenze), falls die Plattform sie liefert
  // Anzeige
  stellentitel: string;
  quelle: SignalQuelle;
  quelle_url: string | null;
  raw_text: string | null;
  inserent: string | null;       // für Blacklist-Check (oft = firma)
  bewerbung_email: string | null;
}

// Ein Discovery-Ziel: Ort + Gewerke, nach denen die Plattformen abgesucht werden.
export interface DiscoveryZiel {
  ort: string;
  plz: string | null;
  gewerke: string[];
}

// Treffer aus der Google-Maps-Firmensuche. Findet Betriebe unabhängig davon,
// ob sie gerade eine Stelle ausschreiben — liefert vor allem die Website.
export interface MapsTreffer {
  firma: string;
  website: string | null;
  ort: string | null;
  plz: string | null;
  telefon: string | null;
  kategorie: string | null;
  bewertungen: number | null; // Anzahl Google-Bewertungen (Indiz für Etabliertheit)
}

// Ergebnis der Email-Findung. quelle sagt, wie günstig/verlässlich die Adresse ist.
export interface EmailFund {
  email: string;
  quelle: "anzeige" | "impressum" | "pattern" | "hunter";
  gf_name: string | null;
  confidence: number; // 0–100
}

// Eine Zeile aus v_firma_outreach: pro Firma die EINE heißeste Stelle +
// Firmen-/Kontaktdaten. Grundlage für Übersicht und Entwurf.
export interface FirmaOutreach {
  zielfirma_id: string;
  firma: string;
  gewerk: string | null;
  ort: string | null;
  plz: string | null;
  website: string | null;
  email: string | null;
  email_quelle: string | null;
  email_confidence: number | null;
  gf_name: string | null;
  firma_status: ZielfirmaStatus;
  signal_id: string;
  stellentitel: string;
  quelle: SignalQuelle;
  quelle_url: string | null;
  raw_text: string | null;
  erstfund: string;
  letzter_fund: string;
  ist_fachkraft: boolean;
  wochen_offen: number;
  ist_heiss: boolean;
  anzahl_signale: number;
}

export type EntwurfStatus = "entwurf" | "freigegeben" | "verworfen" | "gesendet";

export interface StellenEntwurf {
  id: string;
  zielfirma_id: string;
  signal_id: string | null;
  betreff: string;
  text: string;
  status: EntwurfStatus;
  // Sequenz-Felder (Migration 20260803).
  schritt: number;               // 1 = Erstansprache, 2 = Nachfassen, 3 = Abschluss
  faellig_am: string | null;     // frühester Versandzeitpunkt; null = noch nicht terminiert
  // Versand-Felder (Migration 20260728). Null, solange nichts raus ist.
  gesendet_at: string | null;
  gesendet_an: string | null;      // Adresse zum Sendezeitpunkt
  ses_message_id: string | null;   // Zuordnung eingehender Bounce-/Complaint-Events
  versuche: number;
  fehler: string | null;
  created_at: string;
  updated_at: string;
}

// Entwurf + Firmen-Kontext für die Anzeige.
export interface StellenEntwurfMitFirma extends StellenEntwurf {
  firma: string;
  ort: string | null;
  gewerk: string | null;
  email: string | null;
  email_confidence: number | null;
  stellentitel: string | null;
}
