-- ═════════════════════════════════════════════════════════════════
-- Migration: 2026-08-03 — 3-Mail-Sequenz fuer das Stellensignal-Modul
--
-- Bisher: genau EIN Entwurf je Firma (Unique-Index auf zielfirma_id).
-- Neu:    drei Entwuerfe je Firma — Erstansprache, Nachfassen, Abschluss.
--
-- WAS DIESE MIGRATION TUT
--   • fuegt stellen_entwuerfe zwei Spalten hinzu: schritt, faellig_am
--   • ersetzt den Unique-Index (zielfirma_id) durch (zielfirma_id, schritt)
--   • setzt bei bestehenden Zeilen schritt = 1
--
-- WAS SIE NICHT TUT
--   • keine andere Tabelle wird angefasst
--   • keine Zeile wird geloescht, kein Text veraendert
--   • kein DROP TABLE, kein DROP COLUMN, kein TRUNCATE
--   • laeuft in EINER Transaktion — bei einem Fehler wird alles zurueckgerollt
--
-- DER EINE EINGRIFF: der alte Unique-Index wird entfernt. Er verhindert
-- mehr als einen Entwurf je Firma und ist mit einer Sequenz unvereinbar.
-- Der neue Index ist strenger als gar keiner: er verhindert weiterhin
-- Doppel-Entwuerfe, jetzt eben je Schritt. Rueckbau siehe eigene Datei.
-- ═════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Vorbedingung ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stellen_entwuerfe'
  ) THEN
    RAISE EXCEPTION 'Tabelle stellen_entwuerfe fehlt.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stellen_entwuerfe'
      AND column_name = 'gesendet_at'
  ) THEN
    RAISE EXCEPTION 'Versand-Migration 20260728 fehlt. Erst die einspielen.';
  END IF;
END $$;

-- ── 1. Neue Spalten ──────────────────────────────────────────────
ALTER TABLE stellen_entwuerfe
  ADD COLUMN IF NOT EXISTS schritt     INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS faellig_am  TIMESTAMPTZ;

COMMENT ON COLUMN stellen_entwuerfe.schritt IS
  '1 = Erstansprache, 2 = Nachfassen (+4 Tage), 3 = Abschluss (+3 Tage nach Schritt 2).';
COMMENT ON COLUMN stellen_entwuerfe.faellig_am IS
  'Fruehester Versandzeitpunkt. Wird nach dem Versand der Vormail gesetzt, NICHT bei der Erstellung — sonst verschiebt sich die Sequenz, wenn eine Mail im Tagesbudget haengen bleibt. NULL bei Schritt 1 = sofort faellig.';

-- Bestehende Entwuerfe brauchen KEIN Update: "NOT NULL DEFAULT 1" fuellt sie
-- beim Hinzufuegen der Spalte automatisch mit 1. Ein zusaetzliches UPDATE
-- waere wirkungslos und wuerde nur unnoetig in eure Daten schreiben.

-- ── 2. Unique-Index umstellen ────────────────────────────────────
-- Erst den neuen anlegen, dann den alten entfernen: so ist zu keinem
-- Zeitpunkt ungeschuetzt, und ein Fehler beim Anlegen bricht sauber ab.
CREATE UNIQUE INDEX IF NOT EXISTS uq_entwurf_firma_schritt
  ON stellen_entwuerfe (zielfirma_id, schritt);

DROP INDEX IF EXISTS uq_entwurf_firma;

-- ── 3. Index fuer den Versand-Cron ───────────────────────────────
-- Er sucht alle 30 Minuten faellige, freigegebene Entwuerfe.
CREATE INDEX IF NOT EXISTS idx_entwurf_faellig
  ON stellen_entwuerfe (status, faellig_am)
  WHERE gesendet_at IS NULL;

COMMIT;

-- ═════════════════════════════════════════════════════════════════
-- Kontrolle danach (nur lesend):
--
--   SELECT schritt, status, count(*)
--   FROM stellen_entwuerfe GROUP BY 1,2 ORDER BY 1,2;
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'stellen_entwuerfe';
--
-- Rueckbau: 20260803_stellensignale_sequenz_ROLLBACK.sql
-- ═════════════════════════════════════════════════════════════════
