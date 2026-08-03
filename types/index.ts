// ─────────────────────────────────────────────
// Segmente
// ─────────────────────────────────────────────
export type Segment =
  | "KEININSTAGRAM"
  | "KEINSUMMARY"        // Nach 3 fehlgeschlagenen Website-Summary-Versuchen — kein Re-Scrape, manuell entsperren
  | "INAKTIV"
  | "INKONSISTENT"
  | "KEINEVIDEO"
  | "WENIGREICHWEITE"
  | "VIRALAUSREISSER"
  | "SOLIDE"
  | "KEINFIT";

export const SEGMENTS: Segment[] = [
  "KEININSTAGRAM",
  "KEINSUMMARY",
  "INAKTIV",
  "INKONSISTENT",
  "KEINEVIDEO",
  "WENIGREICHWEITE",
  "VIRALAUSREISSER",
  "SOLIDE",
];

export const SEGMENT_LABELS: Record<Segment, string> = {
  KEININSTAGRAM:   "Kein Instagram",
  KEINSUMMARY:     "Keine Website-Daten",
  INAKTIV:         "Inaktiv",
  INKONSISTENT:    "Inkonsistent",
  KEINEVIDEO:      "Keine Videos",
  WENIGREICHWEITE: "Wenig Reichweite",
  VIRALAUSREISSER: "Viral-Ausreißer",
  SOLIDE:          "Solide",
  KEINFIT:         "Kein Fit",
};

// Farbsystem für Segmente:
//   GRÜN  — auf dem Radar (Mail-Sequenz aktiv):     INKONSISTENT, KEINEVIDEO, SOLIDE
//   GELB  — auf Watch / Retry (90-Tage-Re-Scrape):  INAKTIV, WENIGREICHWEITE, VIRALAUSREISSER
//   ROT   — komplett raus, kein Re-Scrape:          KEININSTAGRAM, KEINSUMMARY, KEINFIT
export const SEGMENT_COLORS: Record<Segment, string> = {
  // ROT: komplett raus
  KEININSTAGRAM:   "bg-red-500/20 text-red-400",
  KEINSUMMARY:     "bg-red-500/20 text-red-400",
  KEINFIT:         "bg-red-500/20 text-red-400",
  // GELB: Watch / Retry
  INAKTIV:         "bg-yellow-500/20 text-yellow-400",
  WENIGREICHWEITE: "bg-yellow-500/20 text-yellow-400",
  VIRALAUSREISSER: "bg-yellow-500/20 text-yellow-400",
  // GRÜN: auf dem Radar
  INKONSISTENT:    "bg-green-500/20 text-green-400",
  KEINEVIDEO:      "bg-green-500/20 text-green-400",
  SOLIDE:          "bg-green-500/20 text-green-400",
};

export const SEGMENT_DOT_COLORS: Record<Segment, string> = {
  KEININSTAGRAM:   "bg-red-400",
  KEINSUMMARY:     "bg-red-400",
  KEINFIT:         "bg-red-400",
  INAKTIV:         "bg-yellow-400",
  WENIGREICHWEITE: "bg-yellow-400",
  VIRALAUSREISSER: "bg-yellow-400",
  INKONSISTENT:    "bg-green-400",
  KEINEVIDEO:      "bg-green-400",
  SOLIDE:          "bg-green-400",
};

// ─────────────────────────────────────────────
// Lead Status
// ─────────────────────────────────────────────
export type LeadStatus =
  | "new"
  | "active"
  | "paused"
  | "replied"
  | "converted"
  | "bounced"
  | "unsubscribed";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new:          "Neu",
  active:       "Aktiv",
  paused:       "Pausiert",
  replied:      "Geantwortet",
  converted:    "Konvertiert",
  bounced:      "Bounce",
  unsubscribed: "Abgemeldet",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new:          "bg-gray-500/20 text-gray-400",
  active:       "bg-brand-500/20 text-brand-400",
  paused:       "bg-orange-500/20 text-orange-400",
  replied:      "bg-green-500/20 text-green-400",
  converted:    "bg-yellow-500/20 text-yellow-400",
  bounced:      "bg-red-500/20 text-red-400",
  unsubscribed: "bg-gray-500/20 text-gray-500",
};

// ─────────────────────────────────────────────
// Instagram / Apify Data
// ─────────────────────────────────────────────
export interface InstagramPost {
  id?: string;
  timestamp?: string;
  type?: string;
  videoViewCount?: number | null;
  likesCount?: number;
  commentsCount?: number;
  caption?: string;
  url?: string;
  displayUrl?: string;
}

export interface InstagramData {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  isVerified?: boolean;
  profilePicUrl?: string;
  externalUrl?: string;
  latestPosts?: InstagramPost[];
  scrapedAt?: string;
}

// ─────────────────────────────────────────────
// Lead
// ─────────────────────────────────────────────
export interface Lead {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  email: string;
  private_email: string | null;
  city: string | null;
  website_url: string | null;
  website_summary: string | null;
  instagram_handle: string | null;
  instagram_data: InstagramData | null;
  instagram_problem: string | null;
  segment: Segment | null;
  segment_reasoning: string | null;
  workflow_step: number;
  workflow_started_at: string | null;
  next_touchpoint_at: string | null;
  status: LeadStatus;
  pitch_page_id: string | null;
  pitch_page_url: string | null;
  pitch_lead_type: PitchLeadType | null;  // denormalisiert aus pitch_pages.lead_type für Dashboard-Anzeige
  // v2: Routing-Felder
  pause_reason: string | null;            // segment_watch | meta_ads_active | no_instagram | no_summary | manual | bounced
  scrape_attempts: number;                // Cron retried max. 3x; danach endgültig KEININSTAGRAM
  summary_attempts: number;               // Website-Summary-Versuche; max 3x mit 24h-Pause, danach KEINSUMMARY
  last_scrape_attempt_at: string | null;  // ISO — letzter Apify-Versuch (für 24h-Pause-Logik)
  last_summary_attempt_at: string | null; // ISO — letzter Website-Summary-Versuch (für 24h-Pause-Logik)
  last_scraped_at: string | null;         // ISO timestamp — letzter Instagram-Scrape (für 3-Monate-Re-Scrape-Cron)
  last_meta_ads_check_at: string | null;  // ISO — letzter Ad-Library-Check
  meta_ads_signal: MetaAdsSignal | null;  // Strukturierte Ad-Daten für Pitch-Personalisierung
  newsletter_subscribed_at: string | null; // ISO — wenn der Lead nach Mail 7 in Newsletter-Liste übernommen wurde
  // Signal-Tracking: macht aus Cold Lead einen Warm Lead.
  // Wird im Dashboard prominent angezeigt ("Heiße Leads"-Sektion).
  pitch_visited_at:     string | null;     // ISO — erste Pageview auf /p/[slug]
  pitch_cta_clicked_at: string | null;     // ISO — erster CTA-Klick auf der Pitch-Page (Calendly-Button)
  calendly_booked_at:   string | null;     // ISO — Calendly-Webhook 'invitee.created'
  created_at: string;
  updated_at: string;
  // Pro-Step Versand-/Öffnungs-Status für die Dashboard-Step-Quadrate.
  // Kein DB-Feld — wird von getLeads() aus emails_sent angereichert.
  step_events?: LeadStepEvent[];
}

// Verdichteter Versand-Status eines einzelnen Workflow-Steps für die
// farbigen Step-Quadrate im Dashboard (geöffnet / versendet / Bounce).
export interface LeadStepEvent {
  step_number: number;
  sent: boolean;     // mindestens eine Mail dieses Steps wurde versendet
  opened: boolean;   // Brevo-Webhook 'opened' geliefert
  bounced: boolean;  // Hard/Soft-Bounce → Versandfehler
}

// Ad-Library Signal — wird von Apify-Actor geliefert und in pitch-Generation verwendet
export interface MetaAdsSignal {
  count: number;                  // Anzahl aktiver Ads
  has_video: boolean;
  has_lead_ads: boolean;
  objectives: string[];           // brand_awareness | traffic | conversions | leads | reach | etc.
  oldest_active_ad_days: number;  // Wie lange läuft die älteste aktive Ad
  raw_summary: string;            // 2-3 Sätze für Claude (z.B. "5 Ads aktiv, 3 davon Reichweite, kein Lead-Funnel")
}

// ─────────────────────────────────────────────
// Email Sent
// ─────────────────────────────────────────────
export interface EmailSent {
  id: string;
  lead_id: string;
  step_number: number;
  step_name: string | null;
  subject: string;
  body_html: string | null;
  body_text: string;
  pdf_url: string | null;
  brevo_message_id: string | null;
  sent_to_email: string | null;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;             // ISO — irgendein Link in dieser Mail wurde geklickt (Aggregate)
  pitch_clicked_at: string | null;       // ISO — der Pitch-Seiten-Button wurde geklickt
  calendly_clicked_at: string | null;    // ISO — der Calendly-Button wurde geklickt
  replied_at: string | null;             // ISO — IMAP-Cron schreibt rein, wenn Lead auf diese Mail geantwortet hat
  bounced: boolean;
}

// ─────────────────────────────────────────────
// Dashboard-ToDos: offene Reaktions-Aufgaben für Niklas.
// Werden automatisch angelegt wenn ein Lead einen Hot-Signal auslöst.
// ─────────────────────────────────────────────
export type DashboardTodoType = "pitch_clicked" | "calendly_clicked";
export type DashboardTodoSource = "email" | "pitch_page";

export interface DashboardTodo {
  id: string;
  lead_id: string;
  type: DashboardTodoType;
  email_id: string | null;        // bei source="pitch_page" null
  source: DashboardTodoSource;
  triggered_at: string;
  completed_at: string | null;    // null = offen, gesetzt = abgehakt
  created_at: string;
}

// ─────────────────────────────────────────────
// Generated content from Claude (v3 — 1-Call-Generation)
// ─────────────────────────────────────────────

// Mail-1: Opener mit Post-Referenz + Plattform-Fakt
export interface GeneratedMail1 {
  subject: string;
  body: string;
  referenced_post: string;        // Beschreibung des referenzierten Posts (zur Vermeidung von Dopplungen)
  platform_fact_used: string;     // z.B. "FAKT_REELS_REACH" — welcher Plattform-Fakt eingebaut wurde
}

// Mail-2: Recall mit Bezug zu Mail 1 + anderem Post
export interface GeneratedMail2 {
  subject: string;
  body: string;
  referenced_post: string;        // ein ANDERER Post als in Mail 1
  callback_to_mail1: string;      // welcher Bezug zu Mail 1 hergestellt wurde
}

// Mail-3: Perspektivwechsel + {{PITCH_BUTTON}}
export interface GeneratedMail3 {
  subject: string;
  body: string;
}

// Slide 1 = Lead-spezifische Analyse (v3: Fließtext + Kernsatz + Unser Ansatz)
export interface GeneratedSlide1 {
  headline: string;        // 4-7 Wörter, provokante Aussage, kein Lob
  subline: string;         // ALL CAPS — Branche · Stadt · Kontext
  body_text: string;       // 3-5 Sätze Fließtext: Plattform-Fakt → Beobachtung → Konsequenz
  key_statement: string;   // 1 Satz, max 20 Wörter, fett abgesetzt
  our_approach: string;    // 1-2 Sätze — was PrimeSocial konkret ändert
  case_study_key: string;  // Schlüssel der gewählten Case Study (für Slide 2)
}

// Individuelle Pain-Card auf PDF-Slide 2 — generiert von Claude basierend auf
// konkreten Lead-Daten (Posts, Bio, Website-Summary). Statt generischer
// TYPICAL_MISTAKES-Konstanten.
export interface GeneratedSlide2Pain {
  title: string;        // 5-10 Wörter — provokante Aussage
  description: string;  // 2-3 Sätze, 30-50 Wörter — konkrete Beobachtung am Lead
}

// Alles in einem Claude-Call
export interface GeneratedLeadEmails {
  mail_1: GeneratedMail1;
  mail_2: GeneratedMail2;
  mail_3: GeneratedMail3;
  slide_1: GeneratedSlide1;
  slide_2_pains: GeneratedSlide2Pain[];
}

// Legacy: einzelne Mail (wird von Wrappern noch genutzt)
export interface GeneratedEmail {
  subject: string;
  body: string;
}

// Legacy: Opener-Struktur — wird via Wrapper aus GeneratedLeadEmails abgeleitet
// @deprecated — Wechsel auf GeneratedLeadEmails. Bleibt für Backward-Compat
// mit scripts/test-*.ts und der Preview-Route bestehen.
export interface GeneratedOpener {
  sales_trigger: Segment;
  trigger_reasoning: string;
  subject: string;
  body: string;
  slide1_headline: string;
  slide1_subline: string;
  slide1_bullets: string[];
  slide1_these: string;
  case_study_key: string;
}

// ─────────────────────────────────────────────
// Email Drafts (vorberechnete Sequenzen)
// ─────────────────────────────────────────────
// "failed" = Render-/Versand-Probleme nach mehreren Retries — nicht mehr versuchen
export type DraftStatus = "pending" | "sent" | "skipped" | "cancelled" | "failed";

export interface EmailDraft {
  id: string;
  lead_id: string;
  step_number: number;
  step_name: string | null;
  subject: string;
  body_text: string;
  // v3-Struktur (Fließtext statt Bullets). Legacy-Felder (slide1_*) bleiben
  // optional, falls noch alte Drafts in der DB stehen.
  pdf_content: {
    headline?: string;
    subline?: string;
    body_text?: string;
    key_statement?: string;
    our_approach?: string;
    case_study_key: string;
    // Pain-Cards für Slide 2 (individuell pro Lead, von Claude generiert).
    // Wenn null/leer: Fallback auf TYPICAL_MISTAKES_BY_LEAD_TYPE.
    slide_2_pains?: { title: string; description: string }[];
    // Legacy
    slide1_headline?: string;
    slide1_subline?: string;
    slide1_bullets?: string[];
    slide1_these?: string;
  } | null;
  pdf_url: string | null;
  status: DraftStatus;
  scheduled_for: string;   // ISO date — wann soll die Mail raus
  sent_at: string | null;
  pdf_attempts: number;    // PDF-Render-Versuche; nach 3 → status="failed"
  error_reason: string | null; // Begründung wenn skipped/failed
  created_at: string;
}

// ─────────────────────────────────────────────
// Newsletter
// ─────────────────────────────────────────────
export type NewsletterStatus = "draft" | "sending" | "sent";

export interface Newsletter {
  id: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: NewsletterStatus;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
}

export interface NewsletterSubscriber {
  id: string;
  lead_id: string | null;    // referenziert leads.id wenn vorhanden
  email: string;
  name: string | null;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

// ─────────────────────────────────────────────
// Workflow Steps
// ─────────────────────────────────────────────
export interface WorkflowStep {
  step: number;
  name: string;
  stepName: string;
  day: number;
  type: "claude" | "claude_opener" | "template";
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { step: 1, name: "Opener",        stepName: "opener",        day: 0,  type: "claude_opener", description: "Opener-Mail + 2-Slide-Fallbeispiel-PDF (lead-spezifische Analyse + passender Case)" },
  { step: 2, name: "Recall + Meme", stepName: "recall_meme",   day: 3,  type: "claude",        description: "Bezug auf Mail 1, anderer Post, Meme-Bild für Wiedererkennung" },
  { step: 3, name: "Pitch-Seite",   stepName: "pitch",         day: 8,  type: "claude",        description: "Mini-Recap + Pitch-Seiten-Link als CTA-Button" },
  { step: 4, name: "Calendly",      stepName: "calendly",      day: 14, type: "template",      description: "Konkreter Insight + Calendly-Button (Click-Maximierung)" },
  { step: 5, name: "Breakup",       stepName: "breakup",       day: 21, type: "template",      description: "Freundlicher Abschluss der Sequenz" },
];

// ─────────────────────────────────────────────
// Pitch Pages (Micro-Pitch-Seiten pro Lead)
// ─────────────────────────────────────────────
export type PitchPageStatus = "draft" | "published" | "archived";
export type PitchFocusArea = "recruiting" | "meta_ads" | "organic";

export interface PitchKonzeptBlock {
  title: string;         // z.B. "Content-Strategie"
  description: string;   // 1-2 Sätze
  tags: string[];        // 3-4 Bullet-Tags
}

export interface PitchContentChannelBlock {
  intro: string;
  bullets: string[];
  empfehlung: string;
}

export interface PitchContentStrategieBlocks {
  linkedin: PitchContentChannelBlock;
  instagram: PitchContentChannelBlock;
}

export interface PitchVorgehenBlock {
  zeitraum: string;    // "Woche 1-2"
  titel: string;       // "Vorbereitung und Konzept"
  bullets: string[];   // 4 Bullets
}

export interface GeneratedPitchContent {
  // v2: was der Lead erreichen will
  lead_type: PitchLeadType;
  lead_type_reasoning: string;
  // bleibt bestehen — bestimmt welche Case Studies gezeigt werden
  focus_area: PitchFocusArea;
  focus_reasoning: string;
  // v2: gewählte Plattformen (1-3) + pro Plattform die Strategie
  platforms: Platform[];
  platform_strategy: PlatformStrategy;
  // v2: dritte Konzept-Karte (rechts) je nach Lead-Typ
  third_card_type: ThirdCardType;
  // Hero
  hero_headline: string;
  hero_subline_accent: string;
  hero_text: string;
  hero_meta: string;
  konzept_blocks: PitchKonzeptBlock[];
  // Veraltet (LinkedIn+Instagram-Struktur). Wird vom neuen Prompt nicht mehr gefüllt;
  // bleibt für Backward-Compatibility mit bestehenden Pitch-Page-Datensätzen.
  content_strategie_blocks?: PitchContentStrategieBlocks;
  vorgehen_blocks: PitchVorgehenBlock[];
  cta_headline: string;
  cta_text: string;
}

export interface PitchPage {
  id: string;
  lead_id: string;
  slug: string;
  status: PitchPageStatus;

  focus_area: PitchFocusArea | null;
  focus_reasoning: string | null;

  hero_headline: string | null;
  hero_subline_accent: string | null;
  hero_text: string | null;
  hero_meta: string | null;

  konzept_blocks: PitchKonzeptBlock[] | null;
  content_strategie_blocks: PitchContentStrategieBlocks | null;
  content_examples_branche: string | null;
  case_studies_keys: string[] | null;
  vorgehen_blocks: PitchVorgehenBlock[] | null;

  cta_headline: string | null;
  cta_text: string | null;

  company_name_display: string | null;

  views: number;
  last_viewed_at: string | null;
  total_scroll_depth: number;
  cta_clicks: number;

  // v2: Plattform-Auswahl (1-3) + Lead-Typ + Third-Card-Typ
  platforms: Platform[] | null;
  platform_strategy: PlatformStrategy | null;
  lead_type: PitchLeadType | null;
  third_card_type: ThirdCardType | null;

  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// Referenz-Anfrage: Formular auf /r/[slug] → Rückruf
// Pflicht ist nur Name + Telefon. E-Mail/Firma kommen aus dem verknüpften Lead.
export interface ReferenceRequest {
  id: string;
  pitch_page_id: string | null;
  name: string;
  phone: string;
  company: string | null;
  email: string | null;
  message: string | null;
  created_at: string;
}

export type PitchEventType =
  | "page_view"
  | "scroll_depth"
  | "section_view"
  | "cta_click"
  | "link_click"
  | "time_on_page";

export interface PitchPageEvent {
  id: string;
  pitch_page_id: string;
  session_id: string;
  event_type: PitchEventType;
  event_data: Record<string, unknown> | null;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
}

// Segmente, für die KEINE Pitch-Seite generiert werden soll.
// Hinweis: SOLIDE bekommt eine Pitch-Seite (forced lead_type=leadgen, focus_area=meta_ads),
// kommt aber erst nach erfolgreichem Ad-Library-Check in den Mail-Flow.
export const PITCH_EXCLUDED_SEGMENTS: Segment[] = ["KEININSTAGRAM", "KEINFIT"];

// ─────────────────────────────────────────────
// Pitch v2: Plattformen, Lead-Typ, Third-Card-Typ, Google-Reviews
// ─────────────────────────────────────────────

// Welche Plattformen wir auf der Pitch-Seite anbieten — 1 bis 3 pro Lead
export type Platform = "facebook" | "instagram" | "tiktok";

// Strategie pro gewählter Plattform — wird in pitch_pages.platform_strategy gespeichert
export interface PlatformStrategyBlock {
  intro: string;            // 1 Satz: was diese Plattform für DIESEN Lead konkret bringt
  bullets: string[];        // 4-5 konkrete Content-Bausteine (keine Tags, sondern Beschreibungen)
  empfehlung: string;       // Posting-Frequenz
  beispiel_format?: string; // optional: ein konkretes Beispiel-Format
}

// Map Plattform → Strategie (nur die Plattformen die in `platforms` gewählt wurden)
export type PlatformStrategy = Partial<Record<Platform, PlatformStrategyBlock>>;

// Was der Lead erreichen will (Hauptachse für UI-Logik: dritte Karte, CTA-Text)
export type PitchLeadType = "recruiting" | "leadgen" | "branding" | "mixed";

// Welche Art der dritten Konzept-Karte (rechts) angezeigt wird
export type ThirdCardType = "career_page" | "landing_page" | "community" | "visibility";

// Google-Bewertung — wird in google_reviews gespeichert, auf Pitch-Seite ausgespielt
export interface GoogleReview {
  id: string;
  reviewer_name: string;
  reviewer_image_url: string | null; // Pfad zu /public/reviews/<datei>.jpg oder absolute URL
  review_text: string;
  rating: number;             // 1-5
  review_date: string | null; // ISO-Date oder null
  is_active: boolean;
  display_order: number;
  created_at: string;
}
