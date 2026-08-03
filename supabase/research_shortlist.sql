-- PrimeSocial – RECHERCHE-Modul: Merkliste + Instagram-on-request
-- ============================================================
-- Additive Migration. Fügt nur zwei Spalten zu research_prospects hinzu.
-- Berührt keine anderen Tabellen. Einmalig im Supabase-SQL-Editor ausführen.
-- ============================================================

ALTER TABLE research_prospects
  ADD COLUMN IF NOT EXISTS shortlisted       BOOLEAN NOT NULL DEFAULT FALSE,  -- gemerkt = soll angeschrieben werden
  ADD COLUMN IF NOT EXISTS instagram_checked BOOLEAN NOT NULL DEFAULT FALSE;  -- Instagram wurde (auf Anfrage) gescraped

-- Index für die Merkliste-Ansicht (offene, gemerkte Prospects schnell finden).
CREATE INDEX IF NOT EXISTS idx_research_prospects_shortlist
  ON research_prospects(shortlisted)
  WHERE shortlisted = TRUE;
