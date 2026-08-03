// ─────────────────────────────────────────────────────────────────
// Zentrale Unternehmens-Datenbank (Company Knowledge Base).
// Ein Master-Datensatz pro Unternehmen, modulübergreifend angereichert.
// ─────────────────────────────────────────────────────────────────

export type CompanySource = "research" | "automation" | "manual";

export interface Company {
  id: string;
  company_name: string | null;
  domain: string | null;
  website: string | null;
  stadt: string | null;
  bundesland: string | null;
  branche: string | null;
  employee_bucket: string | null;

  gf_name: string | null;
  gf_email: string | null;
  marketing_email: string | null;
  general_email: string | null;
  emails: string[];
  phone: string | null;

  instagram_handle: string | null;
  instagram_data: unknown | null;
  rating: number | null;
  reviews_count: number | null;

  sources: string[];
  notes: string | null;

  created_at: string;
  updated_at: string;
  last_enriched_at: string | null;
}

// Eingabe für die Merge-Engine (alles optional — es wird nur befüllt, was da ist).
export interface CompanyInput {
  company_name?: string | null;
  website?: string | null;
  stadt?: string | null;
  bundesland?: string | null;
  branche?: string | null;
  employee_bucket?: string | null;
  gf_name?: string | null;
  gf_email?: string | null;
  marketing_email?: string | null;
  general_email?: string | null;
  emails?: (string | null | undefined)[];
  phone?: string | null;
  instagram_handle?: string | null;
  instagram_data?: unknown | null;
  rating?: number | null;
  reviews_count?: number | null;
  source?: CompanySource;
}
