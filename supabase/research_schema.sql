-- PrimeSocial – RECHERCHE-Modul (Prospect-Researcher) · Schema
-- ============================================================
-- STRIKT GETRENNT von Automation (primesocial_leads, emails_sent, …)
-- und vom Manuell-Modul (manual_*). Eigener Prefix `research_`.
-- Diese Tabellen werden NUR vom Recherche-Modul geschrieben.
-- Automation & Manuell werden hierdurch NICHT berührt; der Researcher
-- liest primesocial_leads / manual_* ausschließlich zum Dedup.
--
-- Einmalig im Supabase-SQL-Editor ausführen.
-- ============================================================

-- ------------------------------------------------------------
-- research_runs — eine Recherche-Anfrage = eine (Bundesland, Stadt[, Branche])
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundesland     TEXT NOT NULL,
  stadt          TEXT NOT NULL,
  branche        TEXT,                                   -- null = breiter Seed-Lauf
  trigger        TEXT NOT NULL DEFAULT 'manual',         -- 'manual' | 'cron'
  status         TEXT NOT NULL DEFAULT 'running',        -- 'running' | 'done' | 'error'
  found_count    INTEGER NOT NULL DEFAULT 0,             -- neue Prospects (nach Dedup)
  skipped_count  INTEGER NOT NULL DEFAULT 0,             -- bereits bekannt / ausgeschlossen
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_research_runs_created ON research_runs(created_at DESC);

-- ------------------------------------------------------------
-- research_prospects — ein gefundenes Unternehmen in der Pipeline
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_prospects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID REFERENCES research_runs(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'discovered', -- discovered|enriched|qualified|rejected|handed_off

  -- aus Google Maps (Discover)
  company_name        TEXT NOT NULL,
  website             TEXT,
  address             TEXT,
  city                TEXT,
  bundesland          TEXT,
  phone               TEXT,
  gmaps_category      TEXT,
  rating              NUMERIC,
  reviews_count       INTEGER,

  -- aus Enrich
  gf_name             TEXT,
  best_email          TEXT,
  email_verify_status TEXT,                               -- deliverable|risky|undeliverable|unknown
  instagram_handle    TEXT,
  website_summary     TEXT,

  -- aus Qualify (Dossier)
  sm_fit              BOOLEAN,
  employee_bucket     TEXT,                               -- solo|2-10|10-50|50+|unknown
  branche_final       TEXT,
  ig_weaknesses       JSONB,                              -- [{code,label}, …]
  hook                TEXT,
  score               INTEGER,                            -- 0–100
  reject_reason       TEXT,

  -- Dedup
  dedup_key           TEXT,                               -- domain + handle, normalisiert
  already_known_in    TEXT,                               -- 'leads'|'manual'|'research'|null

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_research_prospects_status   ON research_prospects(status);
CREATE INDEX IF NOT EXISTS idx_research_prospects_run      ON research_prospects(run_id);
CREATE INDEX IF NOT EXISTS idx_research_prospects_dedup    ON research_prospects(dedup_key);
CREATE INDEX IF NOT EXISTS idx_research_prospects_score    ON research_prospects(score DESC);
CREATE INDEX IF NOT EXISTS idx_research_prospects_created  ON research_prospects(created_at DESC);

-- ------------------------------------------------------------
-- research_excluded_branches — UI-editierbare Ausschluss-Liste
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_excluded_branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Startwerte (aus der Abstimmung mit Niklas). Doppelte vermeiden.
INSERT INTO research_excluded_branches (term)
SELECT t FROM (VALUES
  ('Hotel'),
  ('Restaurant'),
  ('Gaststätte'),
  ('Café'),
  ('Autoaufbereitung'),
  ('Autoaufbereiter'),
  ('Werkstatt'),
  ('Autowerkstatt'),
  ('KFZ-Werkstatt'),
  ('Coach'),
  ('Coaching'),
  ('Social Media Agentur'),
  ('Webdesign'),
  ('Webdesign Agentur'),
  ('Marketingagentur'),
  ('Werbeagentur')
) AS v(t)
WHERE NOT EXISTS (
  SELECT 1 FROM research_excluded_branches e WHERE lower(e.term) = lower(v.t)
);
