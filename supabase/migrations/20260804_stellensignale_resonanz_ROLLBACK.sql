-- ═════════════════════════════════════════════════════════════════
-- RUeCKBAU von 20260804_stellensignale_resonanz.sql
--
-- ACHTUNG: Dies loescht die Tabelle stellen_ereignisse MIT INHALT —
-- also die gesamte Historie: welche Firma wann geantwortet hat und was
-- sie geschrieben hat. Diese Daten stehen NIRGENDWO sonst. Sie lassen
-- sich nicht wiederherstellen, auch nicht aus dem Postfach, sobald der
-- Antwort-Cron die Mails als gelesen markiert hat.
--
-- Vorher sichern:
--   COPY (SELECT * FROM stellen_ereignisse) TO STDOUT WITH CSV HEADER;
--
-- Keine andere Tabelle ist betroffen. zielfirmen und stellen_entwuerfe
-- bleiben unveraendert — die Fremdschluessel zeigen VON hier DORTHIN,
-- nicht umgekehrt.
-- ═════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS stellen_ereignisse;

COMMIT;
