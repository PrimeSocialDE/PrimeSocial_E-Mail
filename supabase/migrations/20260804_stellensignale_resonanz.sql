-- ═════════════════════════════════════════════════════════════════
-- Migration: 2026-08-04 — Resonanz-Protokoll fuer das Stellensignal-Modul
--
-- WARUM
--   Heute erkennt der Antwort-Cron eine Antwort, setzt die Firma auf
--   'cooldown' — und verwirft den Text. Danach weiss niemand mehr, WER
--   geantwortet hat, WANN, auf welche der drei Mails und WAS drinstand.
--   Damit laesst sich auch nicht beantworten, welche Nische am besten
--   reagiert. Genau das soll diese Tabelle moeglich machen.
--
-- WAS DIESE MIGRATION TUT
--   • legt EINE neue Tabelle an: stellen_ereignisse
--   • legt drei Indizes darauf an
--   • schaltet RLS ein (wie bei den uebrigen Stellensignal-Tabellen)
--
-- WAS SIE NICHT TUT
--   • keine bestehende Tabelle wird angefasst — kein ALTER, kein UPDATE
--   • keine Zeile wird geloescht oder veraendert
--   • kein DROP, kein TRUNCATE
--   • laeuft in EINER Transaktion — bei einem Fehler wird alles zurueckgerollt
--
-- Wenn die Tabelle schon existiert, passiert nichts (IF NOT EXISTS).
-- Rueckbau: 20260804_stellensignale_resonanz_ROLLBACK.sql
-- ═════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Vorbedingung ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'zielfirmen'
  ) THEN
    RAISE EXCEPTION 'Tabelle zielfirmen fehlt — falsche Datenbank?';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stellen_entwuerfe'
  ) THEN
    RAISE EXCEPTION 'Tabelle stellen_entwuerfe fehlt. Erst 20260716 einspielen.';
  END IF;
END $$;

-- ── 1. Die Tabelle ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stellen_ereignisse (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE: verschwindet eine Firma, verschwindet ihre Historie
  -- mit. Ein Ereignis ohne Firma waere ein Datensatz, den niemand deuten kann.
  zielfirma_id  UUID NOT NULL REFERENCES zielfirmen(id) ON DELETE CASCADE,

  -- ON DELETE SET NULL statt CASCADE: ein geloeschter Entwurf darf die
  -- Tatsache "hier kam eine Antwort" nicht mitloeschen. Die Antwort ist das
  -- wertvollere Datum.
  entwurf_id    UUID REFERENCES stellen_entwuerfe(id) ON DELETE SET NULL,

  schritt       INT,                    -- auf welche der drei Mails, falls bekannt
  art           TEXT NOT NULL,
  zeitpunkt     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Gewerk beim Ereignis MITSCHREIBEN statt spaeter zu joinen. Die Einordnung
  -- einer Firma kann sich aendern (besserer Filter, korrigierter Name); eine
  -- Auswertung "welche Nische reagierte damals" darf sich dadurch nicht
  -- rueckwirkend verschieben.
  gewerk        TEXT,

  betreff       TEXT,
  text          TEXT,                   -- Rumpf der Antwort, gekuerzt
  meta          JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Bewusst als CHECK und nicht als ENUM: eine neue Ereignisart ist damit
  -- ein einzeiliges ALTER statt einer Typ-Migration.
  CONSTRAINT stellen_ereignisse_art_check CHECK (art IN (
    'gesendet',      -- SES hat die Mail angenommen
    'zugestellt',    -- SES-Event Delivery: der Zielserver hat sie angenommen
    'geoeffnet',     -- SES-Event Open — nur bei HTML-Mails, siehe Kommentar unten
    'geklickt',      -- SES-Event Click
    'antwort',       -- ein Mensch hat geantwortet
    'abmeldung',     -- Widerspruch, dauerhaft gesperrt
    'unzustellbar',  -- Bounce, der als Mail zurueckkam statt ueber SES
    'bounce',        -- SES-Event Bounce
    'complaint'      -- SES-Event Complaint (Spam-Knopf)
  ))
);

COMMENT ON TABLE stellen_ereignisse IS
  'Was nach dem Versand passiert ist. Grundlage der Nischen-Auswertung: welches Gewerk antwortet, welches nicht.';

COMMENT ON COLUMN stellen_ereignisse.art IS
  'geoeffnet/geklickt bleiben leer, solange die Mails reiner Text sind — SES misst Oeffnungen ueber ein Bild im HTML-Teil. Die Arten stehen bereit, falls das spaeter umgestellt wird.';

COMMENT ON COLUMN stellen_ereignisse.gewerk IS
  'Stand der Branchen-Einordnung ZUM ZEITPUNKT des Ereignisses. Absichtlich redundant zu zielfirmen.gewerk, damit alte Auswertungen stabil bleiben.';

-- ── 2. Indizes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ereignis_firma    ON stellen_ereignisse (zielfirma_id, zeitpunkt DESC);
CREATE INDEX IF NOT EXISTS idx_ereignis_art_zeit ON stellen_ereignisse (art, zeitpunkt DESC);
CREATE INDEX IF NOT EXISTS idx_ereignis_gewerk   ON stellen_ereignisse (gewerk, art);

-- Ein Ereignis derselben Art zum selben Entwurf nur einmal. SNS stellt
-- Nachrichten mindestens einmal zu, gelegentlich also doppelt — ohne diesen
-- Index zaehlt eine Zustellung zweimal und die Quoten stimmen nicht mehr.
-- Antworten sind ausgenommen: auf dieselbe Mail koennen mehrere folgen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ereignis_entwurf_art
  ON stellen_ereignisse (entwurf_id, art)
  WHERE entwurf_id IS NOT NULL AND art <> 'antwort';

-- ── 3. RLS ───────────────────────────────────────────────────────
-- Wie bei den uebrigen Tabellen des Moduls: eingeschaltet, ohne Policy.
-- Der service_role-Key umgeht RLS, der anon-Key kommt nicht heran.
ALTER TABLE stellen_ereignisse ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ═════════════════════════════════════════════════════════════════
-- Kontrolle danach (nur lesend):
--
--   SELECT count(*) FROM stellen_ereignisse;          -- erwartet: 0
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'stellen_ereignisse';           -- erwartet: 5 Zeilen
--
-- Rueckbau: 20260804_stellensignale_resonanz_ROLLBACK.sql
-- ═════════════════════════════════════════════════════════════════
