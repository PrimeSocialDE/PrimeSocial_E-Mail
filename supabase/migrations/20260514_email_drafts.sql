-- ============================================================
-- email_drafts: vorberechnete 5-Step-Sequenzen pro Lead
-- ============================================================
-- generateAndSaveAllDrafts() schreibt 5 Drafts pro Lead, sendDueDrafts()
-- liest sie pending-sortiert und schickt sie via Brevo. Ohne diese Tabelle
-- läuft die Outreach-Sequenz nicht.

CREATE TABLE IF NOT EXISTS email_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES primesocial_leads(id) ON DELETE CASCADE,
  step_number   INTEGER NOT NULL,
  step_name     TEXT,
  subject       TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  pdf_content   JSONB,                              -- { slide1_headline, slide1_subline, slide1_bullets, slide1_these, case_study_key }
  pdf_url       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',    -- pending|sent|skipped|cancelled
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_lead_id       ON email_drafts(lead_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status        ON email_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_scheduled_for ON email_drafts(scheduled_for ASC);

-- RLS analog zu emails_sent
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON email_drafts FOR ALL USING (true) WITH CHECK (true);
