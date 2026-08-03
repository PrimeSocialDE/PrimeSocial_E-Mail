/**
 * Sendet alle 5 Mails einzeln an kontakt@primesocial.de — so wie der
 * Endkunde sie über 21 Tage gestaffelt bekommen würde, aber alle hintereinander.
 * Inklusive PDF-Anhang in Mail 1, Meme in Mail 2, Buttons in Mails 3+4.
 *
 * Aufruf: npx tsx scripts/send-random-lead-5-separate.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateLeadEmails, determineLeadType, sanitizeSubject } from "../lib/anthropic";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { chooseCaseStudy, CALENDLY_URL, buildPitchUrl } from "../lib/pitch-constants";
import { getStepTemplate, MAIL_ELIGIBLE_SEGMENTS } from "../lib/segments";
import { sendTemplateEmail, PRIMESOCIAL_MEME_URL } from "../lib/brevo";
import { WORKFLOW_STEPS } from "../types";
import type { Lead, PitchLeadType } from "../types";

const RECIPIENT_EMAIL = "kontakt@primesocial.de";
const RECIPIENT_NAME = "Niklas";

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
}

async function pickRandomEligibleLead() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await sb
    .from("primesocial_leads")
    .select("*")
    .in("segment", MAIL_ELIGIBLE_SEGMENTS)
    .not("website_summary", "is", null)
    .not("instagram_data", "is", null)
    .not("contact_first_name", "is", null)
    .not("email", "is", null);
  if (error) throw new Error(error.message);
  const eligible = (data ?? []).filter((l: Lead) =>
    (l.contact_first_name ?? "").trim().length > 0 &&
    (l.website_summary ?? "").trim().length > 0 &&
    !!l.instagram_data?.latestPosts,
  );
  if (eligible.length === 0) throw new Error("Keine eligible Leads");
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  console.log(`🎲 Lead: ${pick.company_name} (${pick.segment})`);
  return { sb, lead: pick as Lead };
}

async function run() {
  const { sb, lead } = await pickRandomEligibleLead();

  // Lead-Type sicherstellen
  let leadType: PitchLeadType = lead.pitch_lead_type ?? "branding";
  if (!lead.pitch_lead_type) {
    console.log(`🤖 Bestimme Lead-Type...`);
    const { lead_type } = await determineLeadType(lead);
    leadType = lead_type;
    console.log(`   → ${leadType}`);
  }
  const enrichedLead = { ...lead, pitch_lead_type: leadType };

  // Claude-Generation (Mails 1-3 + Slide 1)
  console.log(`✉️  Generiere Mails via Claude...`);
  const claudeMails = await generateLeadEmails(enrichedLead);

  // PDF rendern
  console.log(`📄 Rendere PDF...`);
  const cs = chooseCaseStudy({
    segment: lead.segment,
    leadType,
    branche: lead.website_summary,
    claudeSuggestedKey: claudeMails.slide_1.case_study_key,
  });
  const pdfBuffer = await renderSlidesPdf({
    content: {
      headline:      claudeMails.slide_1.headline,
      subline:       claudeMails.slide_1.subline,
      body_text:     claudeMails.slide_1.body_text,
      key_statement: claudeMails.slide_1.key_statement,
    },
    caseStudy: cs,
    meta: { companyName: lead.company_name },
    leadType,
  });
  const pdfName = `PrimeSocial-Analyse-${safeFilename(lead.company_name)}.pdf`;

  // Pitch-Page-URL für Mail 3: real falls vorhanden, sonst Dummy auf /p/preview
  const { data: pitchPage } = await sb
    .from("pitch_pages")
    .select("slug")
    .eq("lead_id", lead.id)
    .maybeSingle();
  const pitchUrl = pitchPage?.slug
    ? buildPitchUrl(pitchPage.slug)
    : "https://mail.primesocial.de/p/preview";
  if (!pitchPage?.slug) {
    console.log(`   ⚠️  Lead hat keine Pitch-Page — Mail 3 zeigt Dummy-Link.`);
  }

  const calendlyUrl = process.env.CALENDLY_URL ?? CALENDLY_URL;
  const firstName = (lead.contact_first_name ?? "").trim();
  const segment = lead.segment ?? "INKONSISTENT";

  // 5 Mails einzeln durch Brevo schicken (gleiche Logik wie sendDueDrafts)
  for (const step of WORKFLOW_STEPS) {
    let subject = "";
    let body = "";

    if (step.step === 1) {
      subject = sanitizeSubject(claudeMails.mail_1.subject);
      body = claudeMails.mail_1.body;
    } else if (step.step === 2) {
      subject = sanitizeSubject(claudeMails.mail_2.subject);
      body = claudeMails.mail_2.body;
    } else if (step.step === 3) {
      subject = sanitizeSubject(claudeMails.mail_3.subject);
      body = claudeMails.mail_3.body;
    } else if (step.type === "template") {
      const tpl = getStepTemplate(step.step, segment, firstName);
      if (!tpl) {
        console.warn(`⚠️  Step ${step.step}: Template-Aufloesung fehlgeschlagen → übersprungen`);
        continue;
      }
      subject = tpl.subject;
      body = tpl.body;
    }

    // Subject mit TEST-Prefix damit man die Mails sofort als Test erkennt
    const testSubject = `[TEST · Mail ${step.step}] ${subject}`;

    const result = await sendTemplateEmail({
      to: { email: RECIPIENT_EMAIL, name: RECIPIENT_NAME },
      subject: testSubject,
      bodyText: body,
      // Mail 1: PDF-Anhang
      pdfBuffer: step.step === 1 ? pdfBuffer : undefined,
      pdfName:   step.step === 1 ? pdfName   : undefined,
      // Mail 2: Meme inline
      inlineImageUrl: step.step === 2 ? PRIMESOCIAL_MEME_URL : undefined,
      inlineImageAlt: step.step === 2 ? "PrimeSocial" : undefined,
      // Mail 3: Pitch-Button
      pitchButton:    step.step === 3 ? { label: "Vorschläge ansehen", url: pitchUrl }     : undefined,
      // Mail 4: Calendly-Button
      calendlyButton: step.step === 4 ? { label: "15-Minuten-Slot wählen", url: calendlyUrl } : undefined,
    });

    console.log(`✅ Mail ${step.step} (${step.name}) verschickt${result.messageId ? ` — ${result.messageId}` : ""}`);
  }

  console.log(`\n🎯 Lead: ${lead.company_name} · Segment: ${segment} · Lead-Type: ${leadType} · Case: ${cs.firmenname}`);
}

run().catch((e) => {
  console.error("💥 Fehler:", e);
  process.exit(1);
});
