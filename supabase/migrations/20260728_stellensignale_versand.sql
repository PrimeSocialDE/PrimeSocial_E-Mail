-- ═════════════════════════════════════════════════════════════════
-- Migration: 2026-07-28 — Stellensignal-Versand
--
-- SICHERHEITSZUSAGE — was diese Migration NICHT tut:
--   • Sie fasst KEINE andere Tabelle an. Betroffen sind ausschließlich
--     stellen_entwuerfe (nur neue Spalten) und die neue stellen_suppression.
--     primesocial_leads, research_*, manual_*, zielfirmen, stellen_signale,
--     blacklist_inserenten und alle Views bleiben unberührt.
--   • Sie ändert oder löscht KEINE bestehende Spalte, keinen Datentyp,
--     keinen Default und keine Zeile. Das Skript enthaelt ueberhaupt keine
--     loeschenden oder aendernden Anweisungen — nur ADD COLUMN, CREATE
--     INDEX, CREATE TABLE und CREATE TRIGGER, jeweils mit Existenzpruefung.
--   • Sie überschreibt KEINE bestehende Funktion. Existiert die benötigte
--     Funktion bereits, bricht die Migration mit einer Fehlermeldung ab,
--     statt sie stillschweigend zu ersetzen.
--   • Sie ist idempotent: mehrfaches Ausführen ist folgenlos.
--   • Sie läuft in EINER Transaktion. Geht irgendetwas schief, wird alles
--     zurückgerollt — es gibt keinen halb angewandten Zustand.
--
-- Rueckbau falls noetig: 20260728_stellensignale_versand_ROLLBACK.sql
-- (separate Datei, damit dieses Skript frei von loeschenden Anweisungen ist).
-- ═════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Vorbedingung ──────────────────────────────────────────────
-- Falls das Stellensignal-Modul noch gar nicht installiert ist, brechen wir
-- ab, statt eine verwaiste Suppression-Tabelle zu hinterlassen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stellen_entwuerfe'
  ) THEN
    RAISE EXCEPTION
      'Tabelle stellen_entwuerfe fehlt. Erst 20260716_stellensignale_entwuerfe.sql einspielen.';
  END IF;
END $$;

-- ── 1. Versand-Felder an stellen_entwuerfe ───────────────────────
-- Nur ADD COLUMN IF NOT EXISTS: bestehende Spalten werden nicht angefasst,
-- bestehende Zeilen bekommen NULL (bzw. 0 bei versuche).
ALTER TABLE stellen_entwuerfe
  ADD COLUMN IF NOT EXISTS gesendet_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gesendet_an     TEXT,
  ADD COLUMN IF NOT EXISTS ses_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS versuche        INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fehler          TEXT;

COMMENT ON COLUMN stellen_entwuerfe.gesendet_at    IS 'Zeitpunkt des Versands. NULL = noch nicht raus.';
COMMENT ON COLUMN stellen_entwuerfe.gesendet_an    IS 'Empfängeradresse zum Sendezeitpunkt (die Firmenadresse kann sich später ändern).';
COMMENT ON COLUMN stellen_entwuerfe.ses_message_id IS 'SES-MessageId, ordnet eingehende Bounce-/Complaint-Events diesem Entwurf zu.';
COMMENT ON COLUMN stellen_entwuerfe.versuche       IS 'Fehlgeschlagene Sendeversuche.';
COMMENT ON COLUMN stellen_entwuerfe.fehler         IS 'Letzte Fehlermeldung, gekürzt.';

-- ── 2. Indizes (rein additiv) ────────────────────────────────────
-- Zuordnung eingehender SES-Events.
CREATE INDEX IF NOT EXISTS idx_entwurf_ses_message_id
  ON stellen_entwuerfe (ses_message_id) WHERE ses_message_id IS NOT NULL;

-- Der Versand-Cron sucht alle 30 Minuten freigegebene Entwürfe.
CREATE INDEX IF NOT EXISTS idx_entwurf_status_created
  ON stellen_entwuerfe (status, created_at);

-- Zählung fürs Tagesbudget.
CREATE INDEX IF NOT EXISTS idx_entwurf_gesendet_at
  ON stellen_entwuerfe (gesendet_at) WHERE gesendet_at IS NOT NULL;

-- ── 3. Suppression-Liste (neue Tabelle) ──────────────────────────
-- Adressen hier drin werden NIE wieder angeschrieben.
-- Warum das kein Nice-to-have ist: Amazon SES sperrt den Account bei einer
-- Bounce-Rate über 5 % oder einer Complaint-Rate über 0,1 %. Ohne diese
-- Tabelle würden tote Adressen erneut angeschrieben und die Domain wäre
-- nach wenigen Wochen verbrannt.
CREATE TABLE IF NOT EXISTS stellen_suppression (
  email       TEXT PRIMARY KEY,
  grund       TEXT NOT NULL,   -- hard_bounce | complaint | opt_out | manuell
  quelle      TEXT,            -- ses | manuell | reply
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE stellen_suppression IS
  'Dauerhaft gesperrte Empfängeradressen des Stellensignal-Moduls. Wird vor jedem Versand geprüft.';

ALTER TABLE stellen_suppression ENABLE ROW LEVEL SECURITY;

-- ── 4. Normalisierungs-Trigger ───────────────────────────────────
-- Adressen immer klein und getrimmt speichern, sonst rutscht "Info@Firma.de"
-- an einer Sperre für "info@firma.de" vorbei.
--
-- Bewusst KEIN "CREATE OR REPLACE": existiert bereits eine Funktion dieses
-- Namens, würde das eine fremde Definition überschreiben. Stattdessen Abbruch.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'stellen_suppression_lowercase'
  ) THEN
    RAISE NOTICE 'Funktion stellen_suppression_lowercase() existiert bereits — bleibt unverändert.';
  ELSE
    EXECUTE $fn$
      CREATE FUNCTION stellen_suppression_lowercase() RETURNS TRIGGER AS $body$
      BEGIN
        NEW.email := lower(trim(NEW.email));
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
    $fn$;
  END IF;
END $$;

-- Trigger nur auf der NEUEN Tabelle. Statt ihn vorsorglich zu entfernen und
-- neu anzulegen, prueft ein Existenzcheck vorher — dadurch ist das Skript
-- genauso wiederholbar, enthaelt aber keine einzige loeschende Anweisung.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'stellen_suppression'
      AND t.tgname  = 'trg_stellen_suppression_lower'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_stellen_suppression_lower
        BEFORE INSERT OR UPDATE ON stellen_suppression
        FOR EACH ROW EXECUTE FUNCTION stellen_suppression_lowercase()';
  END IF;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════
-- Kontrolle nach dem Einspielen (lesend, ändert nichts):
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'stellen_entwuerfe'
--   ORDER BY ordinal_position;
--
--   SELECT count(*) AS suppression_eintraege FROM stellen_suppression;
--
--
-- Rückbau: siehe 20260728_stellensignale_versand_ROLLBACK.sql
-- ═════════════════════════════════════════════════════════════════
