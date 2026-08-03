-- Migration: 2026-05-19
-- email_drafts: pdf_attempts + error_reason für robusteres Fehler-Handling.
--
-- Hintergrund: Wenn renderSlidesPdf() crashed (z.B. fehlende Schrift, kaputtes
-- Bild), bleibt der Draft endlos pending und wird täglich neu probiert. Mit
-- pdf_attempts zählen wir die Versuche und setzen nach 3 Fehlschlägen status
-- auf "failed". error_reason hält die Begründung für den User im Dashboard.

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS pdf_attempts INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_reason TEXT;
