-- PrimeSocial – Zentrale Unternehmens-Datenbank (Company Knowledge Base)
-- ============================================================
-- Ein Master-Datensatz pro Unternehmen, der über ALLE Module hinweg
-- Daten sammelt und sich über die Zeit anreichert (Research, Automation,
-- Manuell). Dedup-Schlüssel: domain (primär) + instagram_handle.
--
-- RLS wird aktiviert (ohne Policy) → nur der serverseitige Service-Role-Key
-- hat Zugriff, konsistent zur DB-Härtung. Einmalig im SQL-Editor ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_name      TEXT,
  domain            TEXT,            -- normalisiert (ohne www), zentraler Dedup-Schlüssel
  website           TEXT,
  stadt             TEXT,
  bundesland        TEXT,
  branche           TEXT,
  employee_bucket   TEXT,            -- 1-9 | 10-29 | 30-99 | 100+ | unknown

  gf_name           TEXT,
  gf_email          TEXT,
  marketing_email   TEXT,
  general_email     TEXT,
  emails            TEXT[] NOT NULL DEFAULT '{}',   -- alle je gefundenen Mails (gesammelt)
  phone             TEXT,

  instagram_handle  TEXT,
  instagram_data    JSONB,
  rating            NUMERIC,
  reviews_count     INTEGER,

  sources           TEXT[] NOT NULL DEFAULT '{}',   -- {research, automation, manual}
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_companies_domain  ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_ig       ON companies(instagram_handle);
CREATE INDEX IF NOT EXISTS idx_companies_name     ON companies(company_name);
CREATE INDEX IF NOT EXISTS idx_companies_stadt    ON companies(stadt);
CREATE INDEX IF NOT EXISTS idx_companies_updated  ON companies(updated_at DESC);

-- Sicherheit (konsistent zur Härtung): RLS an, keine Policy → nur Service-Role.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
