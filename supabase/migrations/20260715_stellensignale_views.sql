-- Migration: 2026-07-15
-- View für das Stellensignal-Dashboard.
--
-- wochen_offen und ist_heiss werden LIVE aus erstfund/letzter_fund berechnet
-- statt als Spalten per Cron nachgezogen. Vorteil: immer korrekt, kein zweiter
-- Cron nötig, keine driftenden Werte.
--
-- Bewusst: wochen_offen rechnet erstfund → letzter_fund (NICHT bis heute).
-- Sonst würde eine längst besetzte Stelle ewig weiterzählen. Solange der
-- tägliche Crawl letzter_fund aktualisiert, wächst der Wert; sobald die Stelle
-- verschwindet, friert er ein und die Stelle gilt (via letzter_fund) als alt.
--
-- ist_heiss = mindestens 8 Wochen offen UND Fachkraft-Stelle.

CREATE OR REPLACE VIEW v_stellen_signale AS
SELECT
  s.*,
  z.firma,
  z.gewerk,
  z.ort,
  z.plz,
  z.website,
  z.status AS firma_status,
  FLOOR((s.letzter_fund - s.erstfund) / 7.0)::INT AS wochen_offen,
  (
    FLOOR((s.letzter_fund - s.erstfund) / 7.0)::INT >= 8
    AND s.ist_fachkraft
  ) AS ist_heiss,
  -- Tage seit dem letzten Fund → Indikator, ob die Stelle noch aktuell offen ist.
  (CURRENT_DATE - s.letzter_fund) AS tage_seit_letztem_fund
FROM stellen_signale s
JOIN zielfirmen z ON z.id = s.zielfirma_id;
