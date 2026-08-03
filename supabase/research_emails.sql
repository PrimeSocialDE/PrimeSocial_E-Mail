-- PrimeSocial – RECHERCHE: getrennte E-Mail-Felder (GF / Marketing / Allgemein)
-- ============================================================
-- Additive Migration. Ergänzt research_prospects um drei E-Mail-Spalten.
-- best_email bleibt die für den Versand gewählte Adresse. Einmalig ausführen.
-- ============================================================

ALTER TABLE research_prospects
  ADD COLUMN IF NOT EXISTS gf_email        TEXT,  -- E-Mail des Geschäftsführers/Inhabers
  ADD COLUMN IF NOT EXISTS marketing_email TEXT,  -- E-Mail des Marketing-Verantwortlichen
  ADD COLUMN IF NOT EXISTS general_email   TEXT;  -- allgemeine Firmen-Mail (info@/kontakt@) aus Impressum
