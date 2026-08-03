-- ═════════════════════════════════════════════════════════════════
-- TRICHTER-AUSWERTUNG Stellensignal — wie viele Leads kommen wirklich an?
--
-- Reines SELECT. Ändert nichts, legt nichts an, löscht nichts.
-- Im Supabase SQL Editor ausführen, Ergebnis in den Chat kopieren.
-- ═════════════════════════════════════════════════════════════════

-- ── 1. Der Trichter auf einen Blick ──────────────────────────────
-- Zeigt, wo Firmen verloren gehen. Die letzte Zeile ist der Bestand,
-- aus dem überhaupt Mails entstehen können.
SELECT '1 · Zielfirmen gesamt'                AS stufe,
       count(*)                               AS anzahl
FROM zielfirmen
UNION ALL
SELECT '2 · davon aktiv',            count(*) FROM zielfirmen WHERE status = 'aktiv'
UNION ALL
SELECT '3 · davon mit Website',      count(*) FROM zielfirmen WHERE status = 'aktiv' AND website IS NOT NULL
UNION ALL
SELECT '4 · davon mit E-Mail',       count(*) FROM zielfirmen WHERE status = 'aktiv' AND email IS NOT NULL
UNION ALL
SELECT '5 · mit mind. 1 Stellensignal', count(DISTINCT z.id)
  FROM zielfirmen z JOIN stellen_signale s ON s.zielfirma_id = z.id
  WHERE z.status = 'aktiv'
UNION ALL
SELECT '6 · mit Fachkraft-Signal',   count(DISTINCT z.id)
  FROM zielfirmen z JOIN stellen_signale s ON s.zielfirma_id = z.id
  WHERE z.status = 'aktiv' AND s.ist_fachkraft
UNION ALL
SELECT '7 · ANSPRECHBAR (Fachkraft + E-Mail)', count(*)
  FROM v_firma_outreach WHERE ist_fachkraft AND email IS NOT NULL
UNION ALL
SELECT '8 · davon heiss (>= 8 Wochen offen)', count(*)
  FROM v_firma_outreach WHERE ist_fachkraft AND email IS NOT NULL AND ist_heiss
ORDER BY stufe;

-- ── 2. Entwurfs- und Versandstand ────────────────────────────────
SELECT status, count(*) AS anzahl
FROM stellen_entwuerfe
GROUP BY status
ORDER BY status;

-- ── 3. Wie viele Firmen sind NOCH NICHT angeschrieben? ───────────
-- Das ist der eigentliche Vorrat. Wichtig: pro Firma gibt es genau EINEN
-- Entwurf (unique index) — jede Firma wird also nur einmal angeschrieben.
-- Dieser Vorrat wird durch den Versand aufgebraucht und muss nachwachsen.
SELECT count(*) AS unangeschriebene_ansprechbare_firmen
FROM v_firma_outreach f
WHERE f.ist_fachkraft
  AND f.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stellen_entwuerfe e
    WHERE e.zielfirma_id = f.zielfirma_id AND e.status <> 'entwurf'
  );

-- ── 4. Nachschub: neue Signale je Woche ──────────────────────────
-- Das ist die Zahl, die die Versandrate langfristig deckelt.
SELECT date_trunc('week', erstfund)::date AS woche,
       count(*)                            AS neue_signale,
       count(*) FILTER (WHERE ist_fachkraft) AS davon_fachkraft
FROM stellen_signale
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;

-- ── 5. Wo kommen die Signale her? ────────────────────────────────
SELECT quelle,
       count(*)                              AS signale,
       count(*) FILTER (WHERE ist_fachkraft) AS davon_fachkraft
FROM stellen_signale
GROUP BY quelle
ORDER BY signale DESC;

-- ── 6. Verteilung nach Gewerk und Ort (wo lohnt sich Ausweitung?) ─
SELECT coalesce(gewerk, '—') AS gewerk,
       coalesce(ort, '—')    AS ort,
       count(*)              AS ansprechbar
FROM v_firma_outreach
WHERE ist_fachkraft AND email IS NOT NULL
GROUP BY 1, 2
ORDER BY ansprechbar DESC
LIMIT 25;

-- ── 7. E-Mail-Qualität (niedrige Confidence = geratene Adresse) ───
SELECT coalesce(email_quelle, '—') AS quelle,
       count(*)                    AS anzahl,
       round(avg(email_confidence)) AS schnitt_confidence
FROM zielfirmen
WHERE status = 'aktiv' AND email IS NOT NULL
GROUP BY 1
ORDER BY anzahl DESC;
