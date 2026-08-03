// ─────────────────────────────────────────────────────────────────
// Typen für das RECHERCHE-Modul (Prospect-Researcher).
// Eigenständig wie das Manuell-Modul — eigene Tabellen mit Prefix
// `research_`. Liest Automation (primesocial_leads) und Manuell
// (manual_*) NUR zum Dedup. Schreibt ausschließlich research_-Tabellen
// und übergibt qualifizierte Prospects per Handoff ins Manuell-Schreiben.
// ─────────────────────────────────────────────────────────────────

// Pipeline-Status eines Prospects (3-Stufen-Modell: Suche → Leads → Schreiben).
export type ProspectStatus =
  | "discovered"   // aus Google Maps, roh (transient, vor dem Scoring)
  | "scored"       // in der SUCHE bewertet (Größe/Branche/Score aus Maps-Daten)
  | "enriched"     // in LEADS angereichert (Website-Summary + Entscheider-Mail)
  | "qualified"    // (Altbestand) Claude-Dossier vorhanden
  | "rejected"     // kein SM-Fit / ausgeschlossen / verworfen
  | "handed_off";  // an das Manuell-Schreiben übergeben

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "discovered", "scored", "enriched", "qualified", "rejected", "handed_off",
];

// Wo der Versand-Trigger einer Recherche herkam.
export type ResearchTrigger = "manual" | "cron";

export type RunStatus = "running" | "done" | "error";

// Hunter-Verify-Status der besten E-Mail (hartes Gate gegen Bounces).
export type EmailVerifyStatus = "deliverable" | "risky" | "undeliverable" | "unknown" | null;

// Grobe Mitarbeiter-Schätzung in Buckets (keine harte Zahl — bewusst ehrlich).
// Buckets um die 30er-Zielschwelle herum geschnitten (Ziel: ab 30 MA).
export type EmployeeBucket = "1-9" | "10-29" | "30-99" | "100+" | "unknown";
export const EMPLOYEE_BUCKETS: EmployeeBucket[] = ["1-9", "10-29", "30-99", "100+", "unknown"];
export const EMPLOYEE_BUCKET_LABELS: Record<EmployeeBucket, string> = {
  "1-9":     "1–9 MA",
  "10-29":   "10–29 MA",
  "30-99":   "30–99 MA",
  "100+":    "100+ MA",
  unknown:   "unbekannt",
};
// Zielgröße: ab 30 Mitarbeitern (große Unternehmen bevorzugt).
export const LARGE_BUCKETS: EmployeeBucket[] = ["30-99", "100+"];
export function isLargeBucket(b: EmployeeBucket | null | undefined): boolean {
  return !!b && LARGE_BUCKETS.includes(b);
}

// Eine einzelne Instagram-Schwäche (Aufhänger-Material für die Mail).
export interface IgWeakness {
  code: string;     // z.B. "no_video" | "stale" | "low_frequency" | "stock_only" | "no_bio_cta"
  label: string;    // menschenlesbar, z.B. "Seit 4 Monaten kein Post"
}

// Eine Recherche-Anfrage = eine (Bundesland, Stadt[, Branche])-Suche.
export interface ResearchRun {
  id: string;
  bundesland: string;
  stadt: string;
  branche: string | null;        // null = breiter Seed-Lauf für die Stadt
  trigger: ResearchTrigger;
  status: RunStatus;
  found_count: number;           // neue (nach Dedup) Prospects aus diesem Lauf
  skipped_count: number;         // Treffer, die schon bekannt waren / ausgeschlossen
  error: string | null;
  created_at: string;
}

// Ein gefundenes Unternehmen, das durch die Pipeline läuft.
export interface ResearchProspect {
  id: string;
  run_id: string | null;
  status: ProspectStatus;

  // ── aus Google Maps (Discover) ──
  company_name: string;
  website: string | null;
  address: string | null;
  city: string | null;
  bundesland: string | null;
  phone: string | null;
  gmaps_category: string | null;
  rating: number | null;
  reviews_count: number | null;

  // ── aus Enrich ──
  gf_name: string | null;
  best_email: string | null;          // für den Versand gewählte Adresse (Marketing → GF → allgemein)
  gf_email: string | null;            // E-Mail des Geschäftsführers/Inhabers
  marketing_email: string | null;     // E-Mail des Marketing-Verantwortlichen
  general_email: string | null;       // allgemeine Firmen-Mail (info@/kontakt@) aus Impressum
  email_verify_status: EmailVerifyStatus;
  instagram_handle: string | null;
  website_summary: string | null;

  // ── aus Qualify (das Dossier) ──
  sm_fit: boolean | null;
  employee_bucket: EmployeeBucket | null;
  branche_final: string | null;
  ig_weaknesses: IgWeakness[] | null;
  hook: string | null;            // fertiger Aufhänger-Satz für die Mail
  score: number | null;           // 0–100
  reject_reason: string | null;

  // ── Merkliste (Workflow: gute Leads sammeln, dann der Reihe nach anschreiben) ──
  shortlisted: boolean;
  instagram_checked: boolean;     // wurde Instagram schon (auf Anfrage) gescraped?

  // ── Dedup ──
  dedup_key: string | null;       // domain + handle, normalisiert
  already_known_in: "leads" | "manual" | "research" | null;

  created_at: string;
  updated_at: string;
}

// Eine ausgeschlossene Branche (UI-editierbar, greift als Filter).
export interface ExcludedBranche {
  id: string;
  term: string;
  created_at: string;
}

// Ergebnis des Dedup-Checks gegen alle bestehenden Quellen.
export interface CoverageResult {
  known: boolean;
  source: "leads" | "manual" | "research" | null;
  detail: string | null;          // z.B. Firmenname / E-Mail des Treffers
}

// Eintrag in der Städte-Liste (data/research-cities.json).
export interface CityEntry {
  bundesland: string;
  stadt: string;
  einwohner?: number;
}
