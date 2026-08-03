/**
 * Testmail mit PRIMESOCIAL.DE als Referenz-Lead.
 *
 * Fährt die komplette Produktions-Pipeline einmal durch — Website-Scrape,
 * Lead-Type, Claude-Mailgenerierung, PDF-Render, Templates — und schickt das
 * Ergebnis an EINEN Empfänger. Es wird NICHTS in die Datenbank geschrieben und
 * kein Lead angefasst: reiner Vorschau-Lauf.
 *
 * Aufruf:
 *   npx tsx scripts/testmail-primesocial.ts              # alle 5 Mails
 *   npx tsx scripts/testmail-primesocial.ts --mails=1    # nur Mail 1 (+PDF)
 *   npx tsx scripts/testmail-primesocial.ts --mails=1,3  # Auswahl
 *   npx tsx scripts/testmail-primesocial.ts --dry        # nur rendern, kein Versand
 *
 * Benötigt in .env.local: ANTHROPIC_API_KEY, BREVO_API_KEY.
 * Optional: APIFY_API_TOKEN (echter Instagram-Scrape statt Fallback-Datensatz).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateLeadEmails, determineLeadType, sanitizeSubject } from "../lib/anthropic";
import { scrapeWebsiteForContact } from "../lib/website-scraper";
import { getStepTemplate } from "../lib/segments";
import { chooseCaseStudy, CALENDLY_URL, buildPitchUrl, generatePitchSlug } from "../lib/pitch-constants";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { sendTemplateEmail, PRIMESOCIAL_MEME_URL } from "../lib/brevo";
import { WORKFLOW_STEPS } from "../types";
import type { Lead, InstagramData, PitchLeadType, Segment } from "../types";

// ─────────────────────────────────────────────────────────────────
// KONFIGURATION — hier anpassen
// ─────────────────────────────────────────────────────────────────

/** Empfänger. Bewusst hart verdrahtet: dieses Skript darf NIE an einen echten Lead gehen. */
const RECIPIENT_EMAIL = "max@primesocial.de";
const RECIPIENT_NAME  = "Max";

/** Der Referenz-"Lead" — unsere eigene Seite. */
const COMPANY_NAME    = "PrimeSocial";
const WEBSITE_URL     = "https://www.primesocial.de";
const INSTAGRAM_HANDLE = "primesocial.de";   // ggf. auf den echten Handle anpassen
const CONTACT_FIRST_NAME = "Max";

/** Segment steuert Tonalität + Pain der Sequenz. Mail-eligible: INKONSISTENT | KEINEVIDEO */
const SEGMENT: Segment = "INKONSISTENT";

// ─────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const dryRun    = args.includes("--dry");
const mailsArg  = args.find((a) => a.startsWith("--mails="));
const wantedSteps = mailsArg
  ? mailsArg.split("=")[1].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 5)
  : [1, 2, 3, 4, 5];

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
}

/**
 * Fallback-Instagram-Daten, falls kein APIFY_API_TOKEN gesetzt ist.
 * Bildet ein INKONSISTENT-Muster ab (Schübe + lange Pausen, überwiegend Bilder),
 * damit Claude echte Posting-Fakten hat. Klar als Fallback gekennzeichnet —
 * mit Apify-Token wird stattdessen das echte Profil gescrapt.
 */
function fallbackInstagramData(): InstagramData {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  // Unregelmäßiges Muster: 3 Posts in einer Woche, dann 6 Wochen Pause, dann Schub.
  const gaps = [4, 6, 9, 52, 55, 58, 61, 97, 101, 104, 148, 152];
  return {
    username:      INSTAGRAM_HANDLE,
    fullName:      COMPANY_NAME,
    biography:     "Social Media Agentur — Content, der Kunden bringt.",
    followersCount: 1240,
    followsCount:   310,
    postsCount:     86,
    isVerified:     false,
    scrapedAt:      new Date().toISOString(),
    latestPosts: gaps.map((d, i) => ({
      id:            `fallback-${i}`,
      timestamp:     daysAgo(d),
      type:          i % 4 === 0 ? "Video" : "Image",
      videoViewCount: i % 4 === 0 ? 820 + i * 40 : null,
      likesCount:    38 + i * 3,
      commentsCount: i % 3,
      caption:       "Beispiel-Caption (Fallback-Datensatz ohne Apify)",
    })),
  };
}

async function run() {
  console.log(`\n📮 Testmail-Lauf — Referenz: ${WEBSITE_URL} → ${RECIPIENT_EMAIL}`);
  console.log(`   Mails: ${wantedSteps.join(", ")}${dryRun ? "  (DRY RUN — kein Versand)" : ""}\n`);

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY fehlt in .env.local");
  if (!dryRun && !process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY fehlt in .env.local");

  // ── 1. Website scrapen (reiner HTTP-Fetch, kein API-Key nötig) ──
  console.log("🌐 Scrape Website...");
  const site = await scrapeWebsiteForContact(WEBSITE_URL);
  const websiteSummary =
    site.websiteSummary?.trim() ||
    "PrimeSocial ist eine Social-Media-Agentur aus Deutschland. Schwerpunkt: Content-Produktion, " +
    "organisches Wachstum und Performance-Kampagnen für lokale Dienstleister und Handwerksbetriebe.";
  console.log(`   Summary: ${websiteSummary.slice(0, 110)}${websiteSummary.length > 110 ? "…" : ""}`);
  if (!site.websiteSummary?.trim()) console.log("   ⚠️  Keine Meta-Description gefunden → Fallback-Summary verwendet");

  // ── 2. Instagram-Daten (Apify wenn Token da, sonst Fallback) ──
  let instagramData: InstagramData;
  if (process.env.APIFY_API_TOKEN) {
    console.log(`📸 Scrape Instagram @${INSTAGRAM_HANDLE} via Apify...`);
    try {
      const { scrapeInstagramProfile } = await import("../lib/apify");
      instagramData = await scrapeInstagramProfile(INSTAGRAM_HANDLE);
      console.log(`   ${instagramData.followersCount ?? "?"} Follower, ${instagramData.latestPosts?.length ?? 0} Posts geladen`);
    } catch (e) {
      console.log(`   ⚠️  Apify fehlgeschlagen (${String(e).slice(0, 80)}) → Fallback-Datensatz`);
      instagramData = fallbackInstagramData();
    }
  } else {
    console.log("📸 Kein APIFY_API_TOKEN → Fallback-Instagram-Datensatz (INKONSISTENT-Muster)");
    instagramData = fallbackInstagramData();
  }

  // ── 3. Lead-Objekt bauen (nur im Speicher, kein DB-Insert) ──
  const now = new Date().toISOString();
  let lead: Lead = {
    id: "testmail-primesocial",
    company_name:        COMPANY_NAME,
    contact_name:        CONTACT_FIRST_NAME,
    contact_first_name:  CONTACT_FIRST_NAME,
    contact_last_name:   null,
    email:               RECIPIENT_EMAIL,
    private_email:       null,
    city:                null,
    website_url:         WEBSITE_URL,
    website_summary:     websiteSummary,
    instagram_handle:    INSTAGRAM_HANDLE,
    instagram_data:      instagramData,
    instagram_problem:   "Unregelmäßiges Posting-Muster, Schübe mit langen Pausen",
    segment:             SEGMENT,
    segment_reasoning:   null,
    workflow_step:       0,
    workflow_started_at: now,
    next_touchpoint_at:  null,
    status:              "active",
    pitch_page_id:       null,
    pitch_page_url:      null,
    pitch_lead_type:     null,
    pause_reason:        null,
    scrape_attempts:     0,
    summary_attempts:    0,
    last_scrape_attempt_at:  null,
    last_summary_attempt_at: null,
    last_scraped_at:     now,
    last_meta_ads_check_at: null,
    meta_ads_signal:     null,
    newsletter_subscribed_at: null,
    pitch_visited_at:     null,
    pitch_cta_clicked_at: null,
    calendly_booked_at:   null,
    created_at: now,
    updated_at: now,
  };

  // ── 4. Lead-Type bestimmen (Claude) ──
  console.log("🤖 Bestimme Lead-Type...");
  const { lead_type, reasoning } = await determineLeadType(lead);
  const leadType: PitchLeadType = lead_type;
  lead = { ...lead, pitch_lead_type: leadType };
  console.log(`   → ${leadType} (${reasoning})`);

  // ── 5. Mails 1-3 + Slide-Inhalte generieren (Claude, 1 Call) ──
  console.log("✉️  Generiere Mail 1-3 + PDF-Slides...");
  const claudeMails = await generateLeadEmails(lead);

  // Begrüßungs-Sicherheitsnetz — identisch zu lib/sequences.ts
  const greet = (body: string, salutation: "Moin" | "Hallo"): string => {
    const trimmed = body.trimStart();
    if (/^(Moin|Hallo|Hi|Hey|Guten Tag)\s/i.test(trimmed)) return body;
    return `${salutation} ${CONTACT_FIRST_NAME},\n\n${trimmed}`;
  };
  claudeMails.mail_1.body = greet(claudeMails.mail_1.body, "Moin");
  claudeMails.mail_2.body = greet(claudeMails.mail_2.body, "Hallo");
  claudeMails.mail_3.body = greet(claudeMails.mail_3.body, "Moin");

  // ── 6. PDF für Mail 1 rendern ──
  let pdfBuffer: Buffer | undefined;
  let pdfName: string | undefined;
  if (wantedSteps.includes(1)) {
    console.log("📄 Rendere Analyse-PDF...");
    const cs = chooseCaseStudy({
      segment:            SEGMENT,
      leadType,
      branche:            websiteSummary,
      claudeSuggestedKey: claudeMails.slide_1.case_study_key,
    });
    pdfBuffer = await renderSlidesPdf({
      content: {
        headline:      claudeMails.slide_1.headline,
        subline:       claudeMails.slide_1.subline,
        body_text:     claudeMails.slide_1.body_text,
        key_statement: claudeMails.slide_1.key_statement,
      },
      caseStudy: cs,
      meta:      { companyName: COMPANY_NAME },
      leadType,
      customPains: claudeMails.slide_2_pains,
    });
    pdfName = `PrimeSocial-Analyse-${safeFilename(COMPANY_NAME)}.pdf`;
    console.log(`   ${pdfName} (${Math.round(pdfBuffer.length / 1024)} KB, Case: ${cs.key})`);
  }

  // ── 7. Mails zusammenbauen und versenden ──
  const pitchUrl = buildPitchUrl(generatePitchSlug(COMPANY_NAME));

  for (const step of WORKFLOW_STEPS) {
    if (!wantedSteps.includes(step.step)) continue;

    let subject: string;
    let bodyText: string;

    if (step.step === 1) {
      subject  = sanitizeSubject(claudeMails.mail_1.subject);
      bodyText = claudeMails.mail_1.body;
    } else if (step.step === 2) {
      subject  = sanitizeSubject(claudeMails.mail_2.subject);
      bodyText = claudeMails.mail_2.body;
    } else if (step.step === 3) {
      subject  = sanitizeSubject(claudeMails.mail_3.subject);
      bodyText = claudeMails.mail_3.body;
    } else {
      const tpl = getStepTemplate(step.step, SEGMENT, CONTACT_FIRST_NAME);
      if (!tpl) {
        console.log(`   ⚠️  Step ${step.step}: kein Template für Segment ${SEGMENT} → übersprungen`);
        continue;
      }
      subject  = tpl.subject;
      bodyText = tpl.body;
    }

    // Dieselben Sicherheitschecks wie im Produktions-Versand
    if (/\[PLATZHALTER/i.test(bodyText)) {
      console.log(`   ⚠️  Step ${step.step}: Platzhalter im Body → übersprungen`);
      continue;
    }
    if (/\{[^{}]+\}/.test(subject)) {
      console.log(`   ⚠️  Step ${step.step}: unaufgelöster Platzhalter im Betreff "${subject}" → übersprungen`);
      continue;
    }
    if (/(?<!\{)\{[a-zA-Z][^{}]*\}(?!\})/.test(bodyText)) {
      console.log(`   ⚠️  Step ${step.step}: unaufgelöster Platzhalter im Body → übersprungen`);
      continue;
    }

    console.log(`\n── Mail ${step.step} · ${step.name} ──`);
    console.log(`   Betreff: ${subject}`);
    console.log(bodyText.split("\n").map((l) => `   │ ${l}`).join("\n"));

    if (dryRun) continue;

    await sendTemplateEmail({
      to:      { email: RECIPIENT_EMAIL, name: RECIPIENT_NAME },
      subject: `[TEST ${step.step}/5] ${subject}`,
      bodyText,
      pdfBuffer: step.step === 1 ? pdfBuffer : undefined,
      pdfName:   step.step === 1 ? pdfName   : undefined,
      inlineImageUrl: step.step === 2 ? PRIMESOCIAL_MEME_URL : undefined,
      inlineImageAlt: step.step === 2 ? "PrimeSocial"        : undefined,
      pitchButton:    step.step === 3 ? { label: "Vorschläge ansehen",     url: pitchUrl }     : undefined,
      calendlyButton: step.step === 4 ? { label: "15-Minuten-Slot wählen", url: process.env.CALENDLY_URL ?? CALENDLY_URL } : undefined,
    });
    console.log(`   ✅ gesendet an ${RECIPIENT_EMAIL}`);
  }

  if (wantedSteps.includes(3) && !dryRun) {
    console.log(`\n⚠️  Mail 3 verlinkt auf ${pitchUrl} — die Pitch-Seite existiert erst,`);
    console.log("   wenn der Lead regulär durch die Pipeline läuft (dieser Test schreibt nichts in die DB).");
  }
  console.log("\n✨ Fertig.\n");
}

run().catch((e) => {
  console.error("\n❌ Fehlgeschlagen:", e);
  process.exit(1);
});
