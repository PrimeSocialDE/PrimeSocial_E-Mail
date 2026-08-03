-- Migration: 2026-07-15
-- Initial-Befüllung der Personaldienstleister-Blacklist. Erweiterbar über die
-- Tabelle (oder die Einstellungen-Seite). Idempotent: ON CONFLICT DO NOTHING
-- gegen den case-insensitiven Unique-Index.

INSERT INTO blacklist_inserenten (name) VALUES
  ('Randstad'),
  ('Adecco'),
  ('Persona Service'),
  ('Piening'),
  ('Hofmann Personal'),
  ('Tempton'),
  ('Manpower'),
  ('Zeitkraft')
ON CONFLICT (lower(name)) DO NOTHING;
