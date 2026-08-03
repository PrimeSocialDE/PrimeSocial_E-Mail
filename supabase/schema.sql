-- PrimeSocial E-Mail Outreach – Supabase Schema v2
-- Führe dieses SQL im Supabase SQL-Editor aus.

-- ============================================================
-- primesocial_leads Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS primesocial_leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT NOT NULL,
  contact_name        TEXT,
  contact_first_name  TEXT,
  contact_last_name   TEXT,
  email               TEXT NOT NULL UNIQUE,
  private_email       TEXT,
  city                TEXT,
  website_url         TEXT,
  website_summary     TEXT,
  instagram_handle    TEXT,
  instagram_data      JSONB,
  instagram_problem   TEXT,
  segment             TEXT,                    -- KEININSTAGRAM|INAKTIV|INKONSISTENT|KEINEVIDEO|WENIGREICHWEITE|VIRALAUSREISSER|SOLIDE|KEINFIT
  segment_reasoning   TEXT,
  workflow_step       INTEGER NOT NULL DEFAULT 0,
  workflow_started_at TIMESTAMPTZ,
  next_touchpoint_at  TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'new', -- new|active|paused|replied|converted|bounced|unsubscribed
  scrape_attempts     INTEGER NOT NULL DEFAULT 0,  -- Cron retried max. 3x; danach endgültig KEININSTAGRAM
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_primesocial_leads_status          ON primesocial_leads(status);
CREATE INDEX IF NOT EXISTS idx_primesocial_leads_segment         ON primesocial_leads(segment);
CREATE INDEX IF NOT EXISTS idx_primesocial_leads_next_touchpoint ON primesocial_leads(next_touchpoint_at ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_primesocial_leads_workflow_step   ON primesocial_leads(workflow_step);

-- ============================================================
-- emails_sent Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS emails_sent (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES primesocial_leads(id) ON DELETE CASCADE,
  step_number       INTEGER NOT NULL,
  step_name         TEXT,
  subject           TEXT NOT NULL,
  body_html         TEXT,
  body_text         TEXT NOT NULL,
  pdf_url           TEXT,
  brevo_message_id  TEXT,
  sent_to_email     TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at         TIMESTAMPTZ,
  clicked_at        TIMESTAMPTZ,
  bounced           BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_emails_sent_lead_id ON emails_sent(lead_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_sent_at ON emails_sent(sent_at DESC);
-- Pflicht für den Brevo-Webhook (sonst Full Table Scan bei jedem Tracking-Event):
CREATE INDEX IF NOT EXISTS idx_emails_sent_brevo_message_id
  ON emails_sent(brevo_message_id)
  WHERE brevo_message_id IS NOT NULL;

-- ============================================================
-- email_drafts Tabelle (vorberechnete Sequenzen)
-- ============================================================

CREATE TABLE IF NOT EXISTS email_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES primesocial_leads(id) ON DELETE CASCADE,
  step_number   INTEGER NOT NULL,
  step_name     TEXT,
  subject       TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  pdf_content   JSONB,                              -- { pdf_start, pdf_problem, pdf_lösung }
  pdf_url       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending|sent|skipped|cancelled
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_lead_id       ON email_drafts(lead_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status        ON email_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_scheduled_for ON email_drafts(scheduled_for ASC);

-- ============================================================
-- newsletters Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS newsletters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          TEXT NOT NULL,
  body_html        TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',  -- draft|sending|sent
  sent_at          TIMESTAMPTZ,
  recipient_count  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- newsletter_subscribers Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID REFERENCES primesocial_leads(id) ON DELETE SET NULL,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT,
  subscribed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email   ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_lead_id ON newsletter_subscribers(lead_id);

-- ============================================================
-- prompt_overrides Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS prompt_overrides (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment    TEXT NOT NULL,
  step       INTEGER NOT NULL,
  rules      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(segment, step)
);

ALTER TABLE prompt_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON prompt_overrides FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- updated_at Auto-Update Trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER primesocial_leads_updated_at
  BEFORE UPDATE ON primesocial_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS)
-- Internes Tool – Anon-Key hat vollen Zugriff.
-- In Produktion durch Auth-basierte Policies ersetzen!
-- ============================================================

ALTER TABLE primesocial_leads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_sent            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON primesocial_leads                  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON emails_sent            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON email_drafts           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON newsletters            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON newsletter_subscribers FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- pitch_pages Tabelle (Micro-Pitch-Seiten pro Lead)
-- ============================================================

CREATE TABLE IF NOT EXISTS pitch_pages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID NOT NULL REFERENCES primesocial_leads(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'draft',  -- draft|published|archived

  focus_area          TEXT,                            -- recruiting|meta_ads|organic
  focus_reasoning     TEXT,

  hero_headline       TEXT,
  hero_subline_accent TEXT,
  hero_text           TEXT,
  hero_meta           TEXT,

  konzept_blocks             JSONB,   -- [{ title, description, tags[] }]
  content_strategie_blocks   JSONB,   -- { linkedin:{...}, instagram:{...} }
  content_examples_branche   TEXT,    -- Branchen-Key für Matching
  case_studies_keys          JSONB,   -- Array mit gewählten Case-Study-Keys
  vorgehen_blocks            JSONB,   -- [{ zeitraum, titel, bullets[] }]

  cta_headline        TEXT,
  cta_text            TEXT,

  company_name_display TEXT,

  views                INTEGER NOT NULL DEFAULT 0,
  last_viewed_at       TIMESTAMPTZ,
  total_scroll_depth   INTEGER NOT NULL DEFAULT 0,
  cta_clicks           INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pitch_pages_slug    ON pitch_pages(slug);
CREATE INDEX IF NOT EXISTS idx_pitch_pages_lead_id ON pitch_pages(lead_id);
CREATE INDEX IF NOT EXISTS idx_pitch_pages_status  ON pitch_pages(status);

ALTER TABLE pitch_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON pitch_pages FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER pitch_pages_updated_at
  BEFORE UPDATE ON pitch_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- pitch_page_events Tabelle (View, Scroll, CTA-Klick, Section-View, ...)
-- ============================================================

CREATE TABLE IF NOT EXISTS pitch_page_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_page_id  UUID NOT NULL REFERENCES pitch_pages(id) ON DELETE CASCADE,
  session_id     TEXT NOT NULL,
  event_type     TEXT NOT NULL,  -- page_view|scroll_depth|section_view|cta_click|link_click|time_on_page
  event_data     JSONB,
  user_agent     TEXT,
  referrer       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pitch_events_page_id    ON pitch_page_events(pitch_page_id);
CREATE INDEX IF NOT EXISTS idx_pitch_events_session_id ON pitch_page_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pitch_events_created_at ON pitch_page_events(created_at DESC);

ALTER TABLE pitch_page_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON pitch_page_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Erweiterung primesocial_leads um Pitch-Referenzen
-- ============================================================

ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS pitch_page_id  UUID REFERENCES pitch_pages(id) ON DELETE SET NULL;
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS pitch_page_url TEXT;

-- Falls du schon eine ältere Pitch-Page-Tabelle angelegt hast, Spalten nachziehen:
ALTER TABLE pitch_pages ADD COLUMN IF NOT EXISTS focus_area      TEXT;
ALTER TABLE pitch_pages ADD COLUMN IF NOT EXISTS focus_reasoning TEXT;

-- ============================================================
-- reference_requests Tabelle (Formular-Einsendungen auf /r/[slug])
-- ============================================================

-- Formular fragt nur Name + Telefon ab. E-Mail und Firma kommen aus dem verknüpften Lead (via pitch_pages.lead_id).
CREATE TABLE IF NOT EXISTS reference_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_page_id  UUID REFERENCES pitch_pages(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  company        TEXT,
  email          TEXT,
  message        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_requests_pitch_page_id ON reference_requests(pitch_page_id);
CREATE INDEX IF NOT EXISTS idx_reference_requests_created_at    ON reference_requests(created_at DESC);

ALTER TABLE reference_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON reference_requests FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Pitch v2: neue Spalten in pitch_pages und primesocial_leads
-- ============================================================

-- pitch_pages: Plattform-Strategie + Lead-Type + Third-Card-Type
ALTER TABLE pitch_pages ADD COLUMN IF NOT EXISTS platforms          TEXT[] DEFAULT '{}';      -- ['facebook','instagram','tiktok']
ALTER TABLE pitch_pages ADD COLUMN IF NOT EXISTS platform_strategy  JSONB;                    -- pro Plattform: { intro, bullets[], empfehlung, beispiel_format }
ALTER TABLE pitch_pages ADD COLUMN IF NOT EXISTS lead_type          TEXT;                     -- recruiting|leadgen|branding|mixed
ALTER TABLE pitch_pages ADD COLUMN IF NOT EXISTS third_card_type    TEXT;                     -- career_page|landing_page|community|visibility

-- primesocial_leads: denormalisiertes pitch_lead_type für schnelle Anzeige im Dashboard
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS pitch_lead_type TEXT;

-- ============================================================
-- Pitch v3: Segment-Routing + Ad-Library + Newsletter-Auto-Eintrag
-- ============================================================

-- pause_reason: warum wurde der Lead pausiert/aus dem Mail-Flow genommen?
-- Werte: segment_watch | meta_ads_active | no_instagram | manual | bounced
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Re-Scrape-Marker: wann zuletzt Instagram gescraped → Cron prüft ob > 3 Monate her
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;

-- Ad-Library: wann zuletzt geprüft + strukturiertes Signal (für SOLIDE-Pitch-Personalisierung)
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS last_meta_ads_check_at TIMESTAMPTZ;
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS meta_ads_signal JSONB;

-- Newsletter: wann der Lead nach Mail 7 in newsletter_subscribers übernommen wurde
ALTER TABLE primesocial_leads ADD COLUMN IF NOT EXISTS newsletter_subscribed_at TIMESTAMPTZ;

-- Index für Re-Scrape-Cron
CREATE INDEX IF NOT EXISTS idx_primesocial_leads_pause_reason     ON primesocial_leads(pause_reason);
CREATE INDEX IF NOT EXISTS idx_primesocial_leads_last_scraped_at  ON primesocial_leads(last_scraped_at);

-- ============================================================
-- google_reviews Tabelle (echte Google-Bewertungen für Pitch-Sektion)
-- ============================================================

CREATE TABLE IF NOT EXISTS google_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name       TEXT NOT NULL,
  reviewer_image_url  TEXT,
  review_text         TEXT NOT NULL,
  rating              INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_date         DATE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Falls die Tabelle bereits ohne reviewer_image_url existiert: nachziehen
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reviewer_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_google_reviews_active        ON google_reviews(is_active);
CREATE INDEX IF NOT EXISTS idx_google_reviews_display_order ON google_reviews(display_order);

ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON google_reviews FOR ALL USING (true) WITH CHECK (true);
