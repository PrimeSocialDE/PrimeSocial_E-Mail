-- PrimeSocial – Manuelles E-Mail-Modul (Schema)
-- ============================================================
-- STRIKT GETRENNT von der Automation. Diese Tabellen haben den
-- Prefix `manual_` und werden NUR vom Manuell-Modul genutzt.
-- Die Automation (primesocial_leads, emails_sent, pitch_pages, ...)
-- wird hierdurch NICHT berührt.
--
-- Führe dieses SQL im Supabase SQL-Editor aus (einmalig).
-- ============================================================

-- ------------------------------------------------------------
-- manual_contacts — eigene Kontakttabelle, getrennt von leads
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  first_name  TEXT,
  last_name   TEXT,
  company     TEXT,
  branche     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_contacts_email ON manual_contacts(email);

-- ------------------------------------------------------------
-- manual_templates — wiederverwendbare Templates mit Platzhaltern
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  subject          TEXT,
  body             TEXT NOT NULL,
  placeholders     JSONB NOT NULL DEFAULT '[]',  -- z.B. ["firstName","company","branche"]
  source_examples  TEXT,                          -- Original-Beispielmails, aus denen generiert wurde
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- manual_drive_links — reine Linksammlung (kein Drive-API-Zugriff)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_drive_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  category    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- manual_emails — alle manuell versendeten Mails
-- Eigener Tracking-Pfad (tracking_id), NICHT der Automation-Webhook.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_emails (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID REFERENCES manual_contacts(id) ON DELETE SET NULL,
  template_id           UUID REFERENCES manual_templates(id) ON DELETE SET NULL,
  sender                TEXT NOT NULL,                          -- 'max@primesocial.de' (Default) | 'niklas@primesocial.de'
  recipient_email       TEXT NOT NULL,
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  tracking_id           UUID NOT NULL DEFAULT gen_random_uuid(),
  brevo_message_id      TEXT,                                   -- Referenz auf Brevo (nur Info, kein Webhook)
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  open_count            INTEGER NOT NULL DEFAULT 0,
  response_status       TEXT NOT NULL DEFAULT 'no_response',    -- no_response | replied | interested | not_interested
  matched_lead_warning  BOOLEAN NOT NULL DEFAULT FALSE,         -- true, wenn Empfänger auch in primesocial_leads existiert
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_emails_contact  ON manual_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_manual_emails_tracking ON manual_emails(tracking_id);
CREATE INDEX IF NOT EXISTS idx_manual_emails_sent_at  ON manual_emails(sent_at DESC);
