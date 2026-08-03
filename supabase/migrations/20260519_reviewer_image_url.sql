-- Migration: 2026-05-19
-- google_reviews: reviewer_image_url-Spalte fehlt in der Live-DB obwohl
-- schema.sql sie definiert. Reviews ohne Bild fallen aktuell auf den
-- generischen Avatar zurueck.

ALTER TABLE google_reviews
  ADD COLUMN IF NOT EXISTS reviewer_image_url TEXT;
