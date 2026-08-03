-- Migration: 2026-05-19
-- Retry-Timestamps + Website-Summary-Versuchszähler + Reply-Tracking.
--
-- Hintergrund:
-- 1) Apify-Retry und Website-Summary-Retry sollen jeweils mindestens 24h
--    auseinanderliegen, damit kurzfristige Programmfehler (Apify-Outage,
--    Anthropic-Rate-Limit, …) nicht 3 Versuche am gleichen Tag verbrennen.
--    last_scrape_attempt_at + last_summary_attempt_at sind die Zeitstempel,
--    auf die der Cron prüft.
-- 2) Website-Summary braucht ein eigenes Versuchs-Counter (summary_attempts),
--    weil sonst nicht unterscheidbar ist, ob Apify oder die Website-Erfassung
--    fehlgeschlagen ist.
-- 3) replied_at auf emails_sent macht für jede Lead-Antwort sichtbar, welche
--    Mail die Antwort ausgelöst hat (IMAP-Cron schreibt diesen Zeitstempel).

ALTER TABLE primesocial_leads
  ADD COLUMN IF NOT EXISTS summary_attempts        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scrape_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_summary_attempt_at TIMESTAMPTZ;

ALTER TABLE emails_sent
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- Index: Cron fragt nach Leads, die seit >24h keinen Versuch hatten — Index
-- auf last_summary_attempt_at hält das schnell, auch bei vielen Leads.
CREATE INDEX IF NOT EXISTS idx_leads_last_summary_attempt
  ON primesocial_leads (last_summary_attempt_at)
  WHERE summary_attempts > 0 AND summary_attempts < 3;

CREATE INDEX IF NOT EXISTS idx_leads_last_scrape_attempt
  ON primesocial_leads (last_scrape_attempt_at)
  WHERE scrape_attempts > 0 AND scrape_attempts < 3;
