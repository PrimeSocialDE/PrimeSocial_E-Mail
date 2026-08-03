-- Migration: 2026-05-12
-- Fügt einen Versuchszähler hinzu, damit der Cron Leads bei Scrape-Fehlern
-- bis zu 3 Mal probiert, bevor sie endgültig als KEININSTAGRAM markiert werden.
--
-- Trennt damit "Apify temporär kaputt" (Retry sinnvoll) von "Handle existiert
-- wirklich nicht" (nach 3 Versuchen klar). Ohne diesen Zähler verbrennt jeder
-- temporäre Apify-Fehler einen Lead endgültig.

ALTER TABLE primesocial_leads
  ADD COLUMN IF NOT EXISTS scrape_attempts INTEGER NOT NULL DEFAULT 0;
