-- Migration: 2026-05-07
-- Behebt Vercel-Cost-Bug: Webhook /api/webhooks/brevo machte Full Table Scan auf
-- emails_sent.brevo_message_id bei jedem eingehenden Tracking-Event. Bei wachsender
-- Tabelle führte das zu Function-Timeouts → Brevo-Retry-Schleife → Vercel-Kosten.
--
-- Auf Supabase ausführen via SQL Editor oder `supabase db push`.
-- CONCURRENTLY damit keine Schreibsperre auf der Tabelle.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emails_sent_brevo_message_id
  ON emails_sent(brevo_message_id)
  WHERE brevo_message_id IS NOT NULL;
