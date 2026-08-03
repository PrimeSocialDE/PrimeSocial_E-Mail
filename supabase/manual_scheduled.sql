-- PrimeSocial – Manuelles E-Mail-Modul: geplanter Versand
-- ============================================================
-- Additive Migration. Fügt nur zwei Spalten zu manual_emails hinzu.
-- Berührt KEINE Automation-Tabellen.
-- Einmalig im Supabase-SQL-Editor ausführen.
-- ============================================================

ALTER TABLE manual_emails
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,  -- geplanter Versandzeitpunkt (null = sofort)
  ADD COLUMN IF NOT EXISTS send_error    TEXT;          -- gesetzt, wenn ein geplanter Versand fehlschlug

-- Index für den Cron: schnell die fälligen, noch nicht gesendeten Mails finden.
CREATE INDEX IF NOT EXISTS idx_manual_emails_scheduled
  ON manual_emails(scheduled_for)
  WHERE sent_at IS NULL AND scheduled_for IS NOT NULL;
