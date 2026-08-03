/**
 * Test-Skript: Sendet alle 5 Mails der NEUEN KEINEVIDEO-Sequenz an niklas@primesocial.de
 *
 * Neuer Flow (Tag 0/3/8/14/21):
 *   1. Opener + 2-Slide-PDF (lead-spezifische Analyse + Case Study)
 *   2. Recall + Meme-Bild
 *   3. Pitch-Seiten-Link als CTA
 *   4. Calendly-Button (Insight + Click)
 *   5. Breakup
 *
 * - Lead wird in DB angelegt (mit "[TEST]"-Prefix), damit die Pitch-Seite live aufrufbar ist.
 * - PDF wird via @react-pdf/renderer serverseitig erzeugt (kein pdfendpoint mehr).
 * - Meme aus /public/memes/wiedererkennung.png.
 *
 * Ausführen: npx tsx scripts/test-keinvideo-mails.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { Lead } from "../types";
import { WORKFLOW_STEPS } from "../types";
import { generateOpener, generateFollowUp, generatePitchPageContent } from "../lib/anthropic";
import { getStepTemplate } from "../lib/segments";
import { sendTemplateEmail, PRIMESOCIAL_MEME_URL } from "../lib/brevo";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { CASE_STUDIES, matchCaseStudies, generatePitchSlug, caseStudyForSegment } from "../lib/pitch-constants";
import { createLead, createPitchPage, getPitchPageByLeadId } from "../lib/supabase";

const TO_EMAIL = "niklas@primesocial.de";
const CALENDLY_URL = "https://calendly.com/niklas-primesocial/15min";
const BASE_URL = "https://mail.primesocial.de";
const MEME_URL = PRIMESOCIAL_MEME_URL;

const now = new Date();
function daysAgoIso(days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ── Mock-Lead-Inhalte: KEINEVIDEO — Intax Steuerberatung (Max Mustermann) ────
const LEAD_INPUT: Omit<Lead, "id" | "created_at" | "updated_at"> = {
  company_name: "[TEST] Intax Steuerberatung",
  contact_name: "Max Mustermann",
  contact_first_name: "Max",
  contact_last_name: "Mustermann",
  email: TO_EMAIL,
  private_email: null,
  city: "Oldenburg",
  website_url: "https://www.intax-steuerberatung.de",
  website_summary:
    "Mittelständische Steuerberatungskanzlei aus Oldenburg mit Fokus auf Handwerksbetriebe, Gastronomie und kleine bis mittelgroße Unternehmen. Beschäftigt aktuell 14 Mitarbeitende, davon 4 Steuerberater. Beratungsspektrum: Jahresabschlüsse, laufende Buchhaltung, Lohnabrechnung, Existenzgründer-Beratung, digitale Belegverarbeitung. Sucht aktiv neue Steuerfachangestellte und Auszubildende.",
  instagram_handle: "intax.steuerberatung",
  instagram_data: {
    username: "intax.steuerberatung",
    fullName: "Intax Steuerberatung",
    biography:
      "Steuerberatung für Mittelstand & Handwerk · Oldenburg · Wir vereinfachen Steuern. Termin: intax-steuerberatung.de",
    followersCount: 1240,
    followsCount: 198,
    postsCount: 142,
    isVerified: false,
    profilePicUrl: "https://example.com/avatar.jpg",
    externalUrl: "https://www.intax-steuerberatung.de",
    scrapedAt: now.toISOString(),
    latestPosts: [
      { id: "p1",  timestamp: daysAgoIso(3),  type: "Image",    videoViewCount: null, likesCount: 42, commentsCount: 2, caption: "5 typische Fehler bei der Steuererklärung — Karussell mit den Klassikern.", url: "https://instagram.com/p/p1" },
      { id: "p2",  timestamp: daysAgoIso(8),  type: "Carousel", videoViewCount: null, likesCount: 68, commentsCount: 5, caption: "Steuertipps für Handwerksbetriebe 2026 — alle Änderungen kompakt auf 6 Slides.", url: "https://instagram.com/p/p2" },
      { id: "p3",  timestamp: daysAgoIso(13), type: "Image",    videoViewCount: null, likesCount: 51, commentsCount: 3, caption: "Frist 31.05. — Einkommensteuererklärung 2024 mit Steuerberater. Reminder.", url: "https://instagram.com/p/p3" },
      { id: "p4",  timestamp: daysAgoIso(19), type: "Carousel", videoViewCount: null, likesCount: 73, commentsCount: 6, caption: "Existenzgründer:in im ersten Jahr — 7 Slides.", url: "https://instagram.com/p/p4" },
      { id: "p5",  timestamp: daysAgoIso(24), type: "Image",    videoViewCount: null, likesCount: 39, commentsCount: 1, caption: "Team-Update: Willkommen Lena Brink — neue Steuerfachangestellte.", url: "https://instagram.com/p/p5" },
      { id: "p6",  timestamp: daysAgoIso(31), type: "Carousel", videoViewCount: null, likesCount: 57, commentsCount: 4, caption: "Bewirtungsbelege richtig erfassen — 5 Punkte.", url: "https://instagram.com/p/p6" },
      { id: "p7",  timestamp: daysAgoIso(38), type: "Image",    videoViewCount: null, likesCount: 44, commentsCount: 2, caption: "Tipp der Woche: Digitale Belegerfassung spart pro Monat ~6 Stunden.", url: "https://instagram.com/p/p7" },
      { id: "p8",  timestamp: daysAgoIso(45), type: "Carousel", videoViewCount: null, likesCount: 62, commentsCount: 5, caption: "Lohnabrechnung 2026 — Mindestlohn, Beiträge, Abgaben.", url: "https://instagram.com/p/p8" },
      { id: "p9",  timestamp: daysAgoIso(52), type: "Image",    videoViewCount: null, likesCount: 48, commentsCount: 3, caption: "Wir suchen Verstärkung: Steuerfachangestellte (m/w/d).", url: "https://instagram.com/p/p9" },
      { id: "p10", timestamp: daysAgoIso(60), type: "Carousel", videoViewCount: null, likesCount: 71, commentsCount: 7, caption: "Häusliches Arbeitszimmer absetzen — 8 Slides.", url: "https://instagram.com/p/p10" },
      { id: "p11", timestamp: daysAgoIso(67), type: "Image",    videoViewCount: null, likesCount: 36, commentsCount: 2, caption: "Fristverlängerung Steuererklärung — wann sinnvoll.", url: "https://instagram.com/p/p11" },
      { id: "p12", timestamp: daysAgoIso(74), type: "Carousel", videoViewCount: null, likesCount: 65, commentsCount: 4, caption: "Investitionsabzugsbetrag (IAB) — Steuern sparen.", url: "https://instagram.com/p/p12" },
    ],
  },
  instagram_problem:
    "Postet regelmäßig Karussells und Bilder — aber kein einziges Video. Reels bekommen aktuell deutlich mehr organische Reichweite als Bilder.",
  segment: "KEINEVIDEO",
  segment_reasoning: "Konstantes Posting alle 5-7 Tage, aktiv (3d), aber keine Videos.",
  workflow_step: 0,
  workflow_started_at: null,
  next_touchpoint_at: null,
  status: "new",
  pitch_page_id: null,
  pitch_page_url: null,
  pitch_lead_type: null,
  pause_reason: null,
  last_scraped_at: now.toISOString(),
  last_meta_ads_check_at: null,
  meta_ads_signal: null,
  newsletter_subscribed_at: null,
};

// ────────────────────────────────────────────────────────────────────────────

async function ensurePitchPage(lead: Lead): Promise<string> {
  // Pitch-Seite generieren via Claude und in DB anlegen.
  console.log(`   ⏳ Generiere Pitch-Seiten-Inhalt mit Claude...`);
  const content = await generatePitchPageContent(lead);
  const brancheHint = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
  const matchedCases = matchCaseStudies(content.focus_area, brancheHint);

  const existing = await getPitchPageByLeadId(lead.id);
  if (existing) return `${BASE_URL}/p/${existing.slug}`;

  const slug = generatePitchSlug(lead.company_name);
  await createPitchPage({
    lead_id: lead.id,
    slug,
    status: "published",
    focus_area: content.focus_area,
    focus_reasoning: content.focus_reasoning,
    lead_type: content.lead_type,
    third_card_type: content.third_card_type,
    platforms: content.platforms,
    platform_strategy: content.platform_strategy,
    hero_headline: content.hero_headline,
    hero_subline_accent: content.hero_subline_accent,
    hero_text: content.hero_text,
    hero_meta: content.hero_meta,
    konzept_blocks: content.konzept_blocks,
    content_strategie_blocks: null,
    content_examples_branche: brancheHint || null,
    case_studies_keys: matchedCases.map((c) => c.key),
    vorgehen_blocks: content.vorgehen_blocks,
    cta_headline: content.cta_headline,
    cta_text: content.cta_text,
    company_name_display: lead.company_name,
    published_at: null,
  });
  return `${BASE_URL}/p/${slug}`;
}

async function run() {
  console.log(`\n📊 KEINEVIDEO-Test (NEUE 5-Step-Sequenz)`);
  console.log(`   Lead: ${LEAD_INPUT.company_name}`);
  console.log(`   Empfänger: ${TO_EMAIL}\n`);

  // ── Lead in DB anlegen ─────────────────────────────────────────────────
  // Felder die in der Production-Supabase noch nicht migriert sind, rausfiltern.
  console.log(`💾 Lege Test-Lead in DB an...`);
  const NON_PROD_COLUMNS = ["last_meta_ads_check_at", "meta_ads_signal", "newsletter_subscribed_at", "last_scraped_at", "pause_reason", "pitch_lead_type"];
  const sanitized = Object.fromEntries(
    Object.entries(LEAD_INPUT).filter(([k]) => !NON_PROD_COLUMNS.includes(k))
  ) as typeof LEAD_INPUT;
  const lead = await createLead(sanitized);
  console.log(`   Lead-ID: ${lead.id}`);

  // ── Pitch-Seite vorab generieren (für Mail 3) ──────────────────────────
  let pitchUrl = "";
  try {
    pitchUrl = await ensurePitchPage(lead);
    console.log(`   ✅ Pitch-Seite: ${pitchUrl}`);
  } catch (err) {
    console.error(`   ⚠️ Pitch-Seite konnte nicht erzeugt werden:`, err);
    pitchUrl = `${BASE_URL}/p/test-fallback`;
  }

  const subjectsSoFar: string[] = [];
  const firstName = lead.contact_first_name ?? lead.company_name;

  for (const step of WORKFLOW_STEPS) {
    console.log(`\n📧 Step ${step.step}: ${step.name} (${step.type})`);

    let subject = "";
    let bodyText = "";
    let pdfBuffer: Buffer | undefined;
    let pdfName: string | undefined;
    let inlineImageUrl: string | undefined;
    let inlineImageAlt: string | undefined;
    let ctaButton: { label: string; url: string } | undefined;

    try {
      if (step.type === "claude_opener") {
        // Step 1: Opener + 2-Slide-PDF
        console.log(`   ⏳ Generiere Opener mit Claude...`);
        const opener = await generateOpener(lead);
        subject = opener.subject;
        bodyText = opener.body;

        // Case Study auswählen — Priorität:
        // 1. Segment-spezifischer Pattern-Match (z.B. KEINEVIDEO → Kreisbahn-Organic)
        // 2. Claude-Output (case_study_key)
        // 3. Branchen-Fallback via matchCaseStudies
        const cs = caseStudyForSegment(lead.segment ?? null)
          ?? CASE_STUDIES.find((c) => c.key === opener.case_study_key)
          ?? matchCaseStudies(null, lead.website_summary ?? "")[0];
        if (!cs) throw new Error("Keine Case Study gefunden");

        console.log(`   📊 Slides: "${opener.slide1_headline}" + Case "${cs.firmenname}"`);
        console.log(`   ⏳ Rendere PDF...`);
        pdfBuffer = await renderSlidesPdf({
          content: {
            slide1_headline: opener.slide1_headline,
            slide1_subline: opener.slide1_subline,
            slide1_bullets: opener.slide1_bullets,
            slide1_these: opener.slide1_these,
          },
          caseStudy: cs,
          meta: { companyName: lead.company_name },
        });
        pdfName = `PrimeSocial-Analyse-${lead.company_name.replace(/\[TEST\]\s*/, "").replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf`;
        console.log(`   📎 PDF generiert (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);
      } else if (step.step === 2) {
        // Step 2: Recall + Meme
        console.log(`   ⏳ Generiere Follow-Up (Step 2) mit Claude...`);
        const generated = await generateFollowUp(lead, 2, subjectsSoFar);
        subject = generated.subject;
        bodyText = generated.body;
        inlineImageUrl = MEME_URL;
        inlineImageAlt = "Wiedererkennungs-Meme";
        console.log(`   🖼️  Meme-URL: ${inlineImageUrl}`);
      } else if (step.step === 3) {
        // Step 3: Pitch-Seite
        console.log(`   ⏳ Generiere Mehrwert-Mail (Step 3) mit Claude...`);
        const generated = await generateFollowUp(lead, 3, subjectsSoFar);
        subject = generated.subject;
        // Sicherstellen dass {{PITCH_BUTTON}} im Body ist — falls Claude es vergessen hat, hängen wir es an
        bodyText = generated.body.includes("{{PITCH_BUTTON}}")
          ? generated.body
          : `${generated.body.replace(/\n*Viele Grüße aus Oldenburg\nNiklas\s*$/m, "")}\n\n{{PITCH_BUTTON}}\n\nViele Grüße aus Oldenburg\nNiklas`;
        ctaButton = { label: "Vorschläge ansehen", url: pitchUrl };
        console.log(`   🔗 Pitch-Link: ${pitchUrl}`);
      } else if (step.step === 4) {
        // Step 4: Calendly
        const tpl = getStepTemplate(4, "KEINEVIDEO", firstName);
        subject = tpl?.subject ?? "Step 4";
        bodyText = tpl?.body ?? "";
        ctaButton = { label: "15-Minuten-Gespräch buchen", url: CALENDLY_URL };
        console.log(`   📅 Calendly: ${CALENDLY_URL}`);
      } else if (step.step === 5) {
        // Step 5: Breakup
        const tpl = getStepTemplate(5, "KEINEVIDEO", firstName);
        subject = tpl?.subject ?? "Step 5";
        bodyText = tpl?.body ?? "";
      }
    } catch (err) {
      console.error(`   ❌ Generierung Step ${step.step} fehlgeschlagen:`, err);
      continue;
    }

    subjectsSoFar.push(subject);
    console.log(`   📝 Betreff: ${subject}`);

    try {
      const result = await sendTemplateEmail({
        to: { email: TO_EMAIL, name: firstName },
        subject: `[KEINEVIDEO-v2 S${step.step}] ${subject}`,
        bodyText,
        pdfBuffer,
        pdfName,
        inlineImageUrl,
        inlineImageAlt,
        ctaButton,
      });
      console.log(`   ✅ Versendet (Brevo ID: ${result.messageId ?? "—"})`);
    } catch (err) {
      console.error(`   ❌ Versand fehlgeschlagen:`, err);
    }
  }

  console.log(`\n✅ Fertig — alle 5 Mails an ${TO_EMAIL} versendet.`);
  console.log(`\nTest-Lead in DB: ${lead.id} (${lead.company_name}) — kann manuell gelöscht werden.`);
  console.log(`Pitch-Seite: ${pitchUrl}`);
}

run().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
