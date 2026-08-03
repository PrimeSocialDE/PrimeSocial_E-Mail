-- Migration: 2026-05-19
-- Signal-Timestamps für Warm-Lead-Tracking.
--
-- Hintergrund: Hot-Signals (Pitch-Page besucht, CTA geklickt, Calendly gebucht)
-- machen aus einem Cold Lead einen Warm Lead. Diese Signale werden im Dashboard
-- ganz oben angezeigt, damit Niklas reagieren kann bevor die Sequenz weiterläuft.
--
-- pitch_visited_at: erste Pageview auf /p/[slug]. Server-Side getrackt.
-- pitch_cta_clicked_at: erster Klick auf Calendly-CTA innerhalb der Pitch-Page.
-- calendly_booked_at: Calendly-Webhook 'invitee.created' → setzt status='converted'.
--
-- Alle drei Timestamps sind "first-touch" — der erste Trigger wird gespeichert.

ALTER TABLE primesocial_leads
  ADD COLUMN IF NOT EXISTS pitch_visited_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pitch_cta_clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendly_booked_at   TIMESTAMPTZ;

-- Index für Dashboard-Sortierung "Heiße Leads" (Signale absteigend nach Datum)
CREATE INDEX IF NOT EXISTS idx_leads_calendly_booked
  ON primesocial_leads (calendly_booked_at DESC) WHERE calendly_booked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pitch_cta_clicked
  ON primesocial_leads (pitch_cta_clicked_at DESC) WHERE pitch_cta_clicked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pitch_visited
  ON primesocial_leads (pitch_visited_at DESC) WHERE pitch_visited_at IS NOT NULL;
