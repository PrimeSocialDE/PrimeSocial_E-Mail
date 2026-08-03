-- Migration: 2026-05-20
-- ToDo-Tabelle für Hot-Signal-Reaktionen im Dashboard.
--
-- Sobald ein Lead auf den Pitch-Link oder Calendly-Button klickt, wird hier
-- ein offener ToDo angelegt. Niklas sieht den im Dashboard, hakt ihn ab wenn
-- er reagiert hat (Anruf, Mail-Antwort, CRM-Eintrag etc.).
--
-- Idempotenz: UNIQUE-Constraint auf (lead_id, type, email_id) verhindert
-- Dupletten, falls Brevo denselben Klick zweimal feuert (passiert manchmal).
-- email_id ist optional weil Pitch-Page-CTA-Klicks keinen direkten Mail-Bezug
-- haben (der CTA wurde auf der Landing-Page selbst geklickt). Für die UNIQUE-
-- Logik nutzen wir COALESCE-Pattern: ein "null email_id" wird wie ein Sentinel-
-- UUID behandelt, damit der Constraint greift.

CREATE TABLE IF NOT EXISTS dashboard_todos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES primesocial_leads(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('pitch_clicked', 'calendly_clicked')),
  email_id      UUID        REFERENCES emails_sent(id) ON DELETE SET NULL,
  source        TEXT        NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'pitch_page')),
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotenz: gleiche Klick-Kombo nur einmal als ToDo anlegen.
-- COALESCE über sentinel UUID, damit auch null-email_id einen sicheren Schlüssel hat.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_todo_signal
  ON dashboard_todos (lead_id, type, COALESCE(email_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Dashboard-Query: offene ToDos sortiert nach Zeit, max 50 Stück.
CREATE INDEX IF NOT EXISTS idx_dashboard_todos_open
  ON dashboard_todos (triggered_at DESC)
  WHERE completed_at IS NULL;

-- RLS-Konvention für dieses Projekt: alle Tabellen haben RLS aktiviert
-- mit einer permissiven Allow-all-Policy (siehe email_drafts). Effektiv
-- gleich wie ohne RLS, aber Supabase-Warnings sind weg und das Setup
-- bleibt konsistent.
ALTER TABLE dashboard_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON dashboard_todos FOR ALL USING (true) WITH CHECK (true);
