// ─────────────────────────────────────────────────────────────────
// Konstanten für das STELLENSIGNAL-Modul.
// Blacklist-Seed, Störer-Keywords, Fachkraft-Erkennung, Karriere-Pfade.
// Reine Daten — keine Seiteneffekte, keine API-Calls.
// ─────────────────────────────────────────────────────────────────

// Personaldienstleister/Zeitarbeit — Fallback-Blacklist im Code, falls die
// DB-Tabelle blacklist_inserenten (noch) leer ist. Die DB ist maßgeblich;
// diese Liste ist nur der Sicherheitsnetz-Default.
export const BLACKLIST_INSERENTEN_SEED: string[] = [
  "Randstad",
  "Adecco",
  "Persona Service",
  "Piening",
  "Hofmann Personal",
  "Tempton",
  "Manpower",
  "Zeitkraft",
];

// Störer-Keywords im Anzeigentext → HART verwerfen (Zeitarbeit/Vermittlung).
// Wird case-insensitiv als Teilstring geprüft.
export const STOERER_KEYWORDS: string[] = [
  "Arbeitnehmerüberlassung",
  "Zeitarbeit",
  "Personaldienstleistung",
  "im Auftrag unseres Kunden",
  "für unseren Mandanten",
  "equal pay",
  "Übernahmeoption",
];

// Kennzeichnung, die eine Arbeitsagentur-Anzeige als Arbeitnehmerüberlassung
// ausweist → separat verworfen (redundant zu STOERER_KEYWORDS, aber explizit).
export const ANUE_MARKER = "Arbeitnehmerüberlassung";

// Pfade, unter denen Karriereseiten typischerweise liegen — für die
// automatische Ermittlung von karriere_url beim ersten Crawl.
export const KARRIERE_PFADE: string[] = [
  "/karriere",
  "/jobs",
  "/stellenangebote",
  "/stellen",
  "/karriere/stellenangebote",
  "/unternehmen/karriere",
];

// Positive Fachkraft-Signale im Stellentitel (Geselle/Fachkraft/Meister etc.).
export const FACHKRAFT_POSITIV: RegExp =
  /\b(gesell|fachkraft|meister|techniker|monteur|installateur|elektroniker|elektriker|anlagenmechaniker|mechatroniker|schlosser|dachdecker|maurer|zimmerer|facharbeiter|geprüft)/i;

// Negativ-Signale → KEINE Fachkraft (Helfer/Aushilfe/Ausbildung/Praktikum).
export const FACHKRAFT_NEGATIV: RegExp =
  /\b(helfer|aushilfe|ungelernt|praktik|azubi|auszubildende|ausbildung|werkstudent|minijob|reinigung|schüler)/i;

// Schwelle für "heiße" Signale (Wochen offen) — spiegelt die View-Logik.
export const HEISS_SCHWELLE_WOCHEN = 8;
