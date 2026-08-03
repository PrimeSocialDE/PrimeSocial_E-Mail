-- ═════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260803_stellensignale_sequenz.sql
--
-- ⚠️ Stellt den Zustand "ein Entwurf je Firma" wieder her. Existieren
--    bereits Entwuerfe mit schritt 2 oder 3, schlaegt das Anlegen des
--    alten Unique-Index fehl — dann muessen diese Zeilen zuerst weg.
--    Bewusst KEIN automatisches Loeschen: das waere Datenverlust ohne
--    Rueckfrage.
-- ═════════════════════════════════════════════════════════════════

BEGIN;

DROP INDEX IF EXISTS idx_entwurf_faellig;
DROP INDEX IF EXISTS uq_entwurf_firma_schritt;

CREATE UNIQUE INDEX IF NOT EXISTS uq_entwurf_firma
  ON stellen_entwuerfe (zielfirma_id);

ALTER TABLE stellen_entwuerfe
  DROP COLUMN IF EXISTS schritt,
  DROP COLUMN IF EXISTS faellig_am;

COMMIT;
