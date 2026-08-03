-- Migration: 2026-07-16
-- Phase 2 (Entwürfe): Eine Stelle pro Firma + vorgeschriebene E-Mail-Entwürfe.
--
-- v_firma_outreach: GENAU EINE Zeile pro aktiver Firma = deren HEISSESTE Stelle.
--   Ranking: ist_heiss → längste wochen_offen → ist_fachkraft → neuester Fund.
--   So wird pro Firma nur EINE Stelle angeschrieben (kein 4-fach-Anschreiben).
--
-- stellen_entwuerfe: pro Firma EIN Mail-Entwurf (unique). Wird NICHT versendet,
--   nur zur Freigabe angezeigt.

-- ── View: beste Stelle je Firma ──────────────────────────────────
CREATE OR REPLACE VIEW v_firma_outreach AS
SELECT DISTINCT ON (z.id)
  z.id                AS zielfirma_id,
  z.firma,
  z.gewerk,
  z.ort,
  z.plz,
  z.website,
  z.email,
  z.email_quelle,
  z.email_confidence,
  z.gf_name,
  z.status            AS firma_status,
  s.id                AS signal_id,
  s.stellentitel,
  s.quelle,
  s.quelle_url,
  s.raw_text,
  s.erstfund,
  s.letzter_fund,
  s.ist_fachkraft,
  FLOOR((s.letzter_fund - s.erstfund) / 7.0)::INT AS wochen_offen,
  (FLOOR((s.letzter_fund - s.erstfund) / 7.0)::INT >= 8 AND s.ist_fachkraft) AS ist_heiss,
  (SELECT count(*) FROM stellen_signale s2 WHERE s2.zielfirma_id = z.id) AS anzahl_signale
FROM zielfirmen z
JOIN stellen_signale s ON s.zielfirma_id = z.id
WHERE z.status = 'aktiv'
ORDER BY
  z.id,
  (FLOOR((s.letzter_fund - s.erstfund) / 7.0)::INT >= 8 AND s.ist_fachkraft) DESC,
  FLOOR((s.letzter_fund - s.erstfund) / 7.0)::INT DESC,
  s.ist_fachkraft DESC,
  s.letzter_fund DESC;

-- ── Tabelle: stellen_entwuerfe ───────────────────────────────────
CREATE TABLE IF NOT EXISTS stellen_entwuerfe (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zielfirma_id  UUID NOT NULL REFERENCES zielfirmen(id) ON DELETE CASCADE,
  signal_id     UUID REFERENCES stellen_signale(id) ON DELETE SET NULL,
  betreff       TEXT NOT NULL,
  text          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'entwurf',  -- entwurf | freigegeben | verworfen | gesendet
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pro Firma nur EIN Entwurf.
CREATE UNIQUE INDEX IF NOT EXISTS uq_entwurf_firma ON stellen_entwuerfe (zielfirma_id);

DROP TRIGGER IF EXISTS trg_stellen_entwuerfe_updated_at ON stellen_entwuerfe;
CREATE TRIGGER trg_stellen_entwuerfe_updated_at
  BEFORE UPDATE ON stellen_entwuerfe
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_stellensignale();

ALTER TABLE stellen_entwuerfe ENABLE ROW LEVEL SECURITY;
