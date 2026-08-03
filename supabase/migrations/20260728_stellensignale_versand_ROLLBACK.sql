-- ═════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260728_stellensignale_versand.sql
--
-- ⚠️ NICHT im Normalbetrieb ausführen. Dieses Skript LÖSCHT die
--    Suppression-Liste samt Inhalt und entfernt die Versand-Spalten
--    inklusive aller darin gespeicherten Versanddaten.
--
-- Es fasst ausschließlich Objekte an, die die zugehörige Migration
-- angelegt hat. Keine andere Tabelle ist betroffen.
-- ═════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER  IF EXISTS trg_stellen_suppression_lower ON stellen_suppression;
DROP TABLE    IF EXISTS stellen_suppression;
DROP FUNCTION IF EXISTS stellen_suppression_lowercase();

DROP INDEX IF EXISTS idx_entwurf_ses_message_id;
DROP INDEX IF EXISTS idx_entwurf_status_created;
DROP INDEX IF EXISTS idx_entwurf_gesendet_at;

ALTER TABLE stellen_entwuerfe
  DROP COLUMN IF EXISTS gesendet_at,
  DROP COLUMN IF EXISTS gesendet_an,
  DROP COLUMN IF EXISTS ses_message_id,
  DROP COLUMN IF EXISTS versuche,
  DROP COLUMN IF EXISTS fehler;

COMMIT;
