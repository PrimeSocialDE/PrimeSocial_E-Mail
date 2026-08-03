-- Migration: 2026-05-20
-- E-Mail-spezifische Klick-Signale: welcher Button in welcher Mail geklickt wurde.
--
-- Hintergrund: clicked_at sagt nur "irgendwo wurde geklickt". Bei der Lead-
-- Detail-Seite will Niklas pro Mail-Zeile sehen, ob der Pitch-Link oder
-- der Calendly-Button geklickt wurde. Das ist ein wichtiges Signal-Detail —
-- ein Pitch-Klick und ein Calendly-Klick sind nicht gleich wertvoll.
--
-- pitch_clicked_at und calendly_clicked_at werden vom Brevo-Webhook
-- (event "click") gesetzt, basierend auf URL-Pattern-Matching.
-- clicked_at bleibt als Aggregate-Signal weiter bestehen ("irgendwas geklickt").

ALTER TABLE emails_sent
  ADD COLUMN IF NOT EXISTS pitch_clicked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendly_clicked_at TIMESTAMPTZ;
