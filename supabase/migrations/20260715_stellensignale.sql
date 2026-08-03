-- Migration: 2026-07-15
-- STELLENSIGNAL-MODUL (Phase 1: nur Datenfundament).
--
-- Identifiziert Handwerks-/Industriebetriebe, die seit Längerem erfolglos
-- Fachkräfte suchen — die heißesten Leads für Recruiting-Videos.
--
-- WICHTIG: Dieses Modul ist vollständig isoliert. Es schreibt AUSSCHLIESSLICH
-- die drei Tabellen unten (zielfirmen, stellen_signale, blacklist_inserenten).
-- Kein Zugriff auf primesocial_leads / research_* / manual_*. Kein Mail-Versand.
-- Die Anbindung an den Versand ist Phase 2 und wird separat gebaut.

-- ── Enums ────────────────────────────────────────────────────────
-- CREATE TYPE kennt kein IF NOT EXISTS vor PG15 → idempotent via DO-Block.
DO $$ BEGIN
  CREATE TYPE zielfirma_status AS ENUM ('aktiv', 'cooldown', 'gesperrt', 'kunde');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signal_quelle AS ENUM ('karriereseite', 'arbeitsagentur', 'indeed', 'kleinanzeigen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── updated_at-Trigger (idempotent, modul-lokal) ─────────────────
CREATE OR REPLACE FUNCTION set_updated_at_stellensignale()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Tabelle: zielfirmen ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zielfirmen (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma                   TEXT NOT NULL,
  website                 TEXT,
  karriere_url            TEXT,                 -- wird beim ersten Crawl automatisch ermittelt
  gewerk                  TEXT,                 -- elektro, shk, metall, bau, galabau, industrie
  ort                     TEXT,
  plz                     TEXT,
  mitarbeiter_geschaetzt  INTEGER,
  gf_name                 TEXT,
  email                   TEXT,
  email_quelle            TEXT,                 -- anzeige | impressum | pattern | hunter (Herkunft der Mail)
  email_confidence        INTEGER,              -- 0–100; niedrig = vermutet (Pattern), hoch = direkt gefunden
  status                  zielfirma_status NOT NULL DEFAULT 'aktiv',
  cooldown_bis            DATE,
  quelle                  TEXT,                 -- woher der Eintrag stammt
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_zielfirmen_updated_at ON zielfirmen;
CREATE TRIGGER trg_zielfirmen_updated_at
  BEFORE UPDATE ON zielfirmen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_stellensignale();

-- Crawler zieht nur Firmen mit status='aktiv' → dafür der Teil-Index.
CREATE INDEX IF NOT EXISTS idx_zielfirmen_status_aktiv
  ON zielfirmen (status) WHERE status = 'aktiv';

-- ── Tabelle: stellen_signale ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS stellen_signale (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zielfirma_id  UUID NOT NULL REFERENCES zielfirmen(id) ON DELETE CASCADE,
  stellentitel  TEXT NOT NULL,
  quelle        signal_quelle NOT NULL,
  quelle_url    TEXT,
  erstfund      DATE NOT NULL DEFAULT CURRENT_DATE,   -- erster Crawl, an dem die Stelle gefunden wurde
  letzter_fund  DATE NOT NULL DEFAULT CURRENT_DATE,   -- letztes Mal gesehen; offen solange aktuell
  ist_fachkraft BOOLEAN NOT NULL DEFAULT false,       -- Filter-Ergebnis: Geselle/Fachkraft/Meister
  raw_text      TEXT,                                  -- Anzeigentext für spätere Personalisierung
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Derselbe Fund beim nächsten Crawl aktualisiert nur letzter_fund statt zu duplizieren.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signal_firma_titel_quelle
  ON stellen_signale (zielfirma_id, stellentitel, quelle);

DROP TRIGGER IF EXISTS trg_stellen_signale_updated_at ON stellen_signale;
CREATE TRIGGER trg_stellen_signale_updated_at
  BEFORE UPDATE ON stellen_signale
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_stellensignale();

CREATE INDEX IF NOT EXISTS idx_signal_zielfirma ON stellen_signale (zielfirma_id);
CREATE INDEX IF NOT EXISTS idx_signal_letzter_fund ON stellen_signale (letzter_fund DESC);

-- ── Tabelle: blacklist_inserenten ────────────────────────────────
-- Personaldienstleister/Zeitarbeit — deren Anzeigen werden HART verworfen.
CREATE TABLE IF NOT EXISTS blacklist_inserenten (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  aktiv      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive eindeutig, damit "Tempton" / "tempton" nicht doppelt landen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_blacklist_name_lower
  ON blacklist_inserenten (lower(name));

-- ── RLS aktivieren (server-only) ─────────────────────────────────
-- Alle Zugriffe laufen serverseitig über den Service-Role-Key, der RLS
-- umgeht. Ohne Policies bleiben die Tabellen für anon/authenticated dicht —
-- genau wie die übrigen Tabellen (siehe supabase/harden_rls.sql).
ALTER TABLE zielfirmen           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stellen_signale      ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist_inserenten ENABLE ROW LEVEL SECURITY;
