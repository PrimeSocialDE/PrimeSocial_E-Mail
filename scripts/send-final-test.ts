/**
 * Final-Test: Sendet die echten 5 Mails für den heute grün
 * segmentierten Lead (Planungsgruppe Schweitzer, INKONSISTENT) als
 * Vorschau an kontakt@primesocial.de. Niemals an den Lead selbst.
 *
 * Aufruf: npx tsx scripts/send-final-test.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateLeadEmails, determineLeadType, sanitizeSubject, generatePitchPageContent } from "../lib/anthropic";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { chooseCaseStudy, CALENDLY_URL, buildPitchUrl, generatePitchSlug, matchCaseStudies } from "../lib/pitch-constants";
import { getStepTemplate } from "../lib/segments";
import { sendTemplateEmail, PRIMESOCIAL_MEME_URL } from "../lib/brevo";
import { WORKFLOW_STEPS } from "../types";
import type { Lead, PitchLeadType } from "../types";

const RECIPIENT_EMAIL = "kontakt@primesocial.de";
const RECIPIENT_NAME  = "Niklas";
const TARGET_COMPANY  = "Planungsgruppe Schweitzer GmbH"; // der heute grün klassifizierte Lead

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
}

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Lead aus DB holen
  const { data, error } = await sb
    .from("primesocial_leads")
    .select("*")
    .eq("company_name", TARGET_COMPANY)
    .maybeSingle();
  if (error || !data) throw new Error(`Lead "${TARGET_COMPANY}" nicht gefunden: ${error?.message ?? "—"}`);
  const lead = data as Lead;
  console.log(`🎯 Lead: ${lead.company_name} · Segment: ${lead.segment} · Vorname: ${lead.contact_first_name}`);

  // Voraussetzungs-Check (gleich wie generateAndSaveAllDrafts-Gate)
  if (!lead.website_summary)     throw new Error("website_summary fehlt — Test abgebrochen");
  if (!lead.instagram_data?.latestPosts) throw new Error("instagram_data.latestPosts fehlt — Test abgebrochen");
  if (!lead.contact_first_name?.trim()) throw new Error("contact_first_name fehlt — Test abgebrochen");

  // Lead-Type bestimmen falls nötig
  let leadType: PitchLeadType = lead.pitch_lead_type ?? "branding";
  if (!lead.pitch_lead_type) {
    console.log(`🤖 Bestimme Lead-Type via Claude...`);
    const { lead_type, reasoning } = await determineLeadType(lead);
    leadType = lead_type;
    console.log(`   → ${leadType} (${reasoning})`);
  } else {
    console.log(`✅ Lead-Type bereits gesetzt: ${leadType}`);
  }
  const enrichedLead = { ...lead, pitch_lead_type: leadType };

  // Claude-Generation
  console.log(`✉️  Generiere Mails 1-3 + Slide 1 + Pain-Cards...`);
  const claudeMails = await generateLeadEmails(enrichedLead);

  // Begrüßungs-Sicherheitsnetz (gleiche Logik wie in sequences.ts)
  const greet = (body: string, salutation: "Moin" | "Hallo"): string => {
    const trimmed = body.trimStart();
    if (/^(Moin|Hallo|Hi|Hey|Guten Tag)\s/i.test(trimmed)) return body;
    return `${salutation} ${(lead.contact_first_name ?? "").trim()},\n\n${trimmed}`;
  };
  claudeMails.mail_1.body = greet(claudeMails.mail_1.body, "Moin");
  claudeMails.mail_2.body = greet(claudeMails.mail_2.body, "Hallo");
  claudeMails.mail_3.body = greet(claudeMails.mail_3.body, "Moin");

  // PDF rendern
  console.log(`📄 Rendere PDF...`);
  const cs = chooseCaseStudy({
    segment: lead.segment,
    leadType,
    branche: lead.website_summary,
    claudeSuggestedKey: claudeMails.slide_1.case_study_key,
  });
  console.log(`   → Case Study: ${cs.firmenname} (${cs.focus_area})`);

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
    customPains: claudeMails.slide_2_pains,
  });
  const pdfName = `PrimeSocial-Analyse-${safeFilename(lead.company_name)}.pdf`;

  // Pitch-Page sicherstellen: existiert sie schon → publishen, sonst neu erstellen + publishen.
  // So sieht der User in Mail 3 eine ECHTE Landing-Page.
  let pitchUrl: string;
  const { data: existingPitch } = await sb
    .from("pitch_pages")
    .select("id, slug, status, published_at")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existingPitch?.slug) {
    if (existingPitch.status !== "published") {
      await sb.from("pitch_pages").update({
        status: "published",
        published_at: existingPitch.published_at ?? new Date().toISOString(),
      }).eq("id", existingPitch.id);
      console.log(`   → bestehende Pitch-Page (Draft) publiziert`);
    } else {
      console.log(`   → bestehende Pitch-Page bereits live`);
    }
    pitchUrl = buildPitchUrl(existingPitch.slug);
  } else {
    console.log(`🌐 Erstelle Pitch-Page via Claude...`);
    const pitchContent = await generatePitchPageContent(enrichedLead, { forceLeadType: leadType });
    const brancheHint = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
    const matchedCases = matchCaseStudies(pitchContent.focus_area, brancheHint);
    const slug = generatePitchSlug(lead.company_name);
    const { data: created, error: pitchErr } = await sb.from("pitch_pages").insert({
      lead_id:                  lead.id,
      slug,
      focus_area:               pitchContent.focus_area,
      focus_reasoning:          pitchContent.focus_reasoning,
      lead_type:                pitchContent.lead_type,
      third_card_type:          pitchContent.third_card_type,
      platforms:                pitchContent.platforms,
      platform_strategy:        pitchContent.platform_strategy,
      hero_headline:            pitchContent.hero_headline,
      hero_subline_accent:      pitchContent.hero_subline_accent,
      hero_text:                pitchContent.hero_text,
      hero_meta:                pitchContent.hero_meta,
      konzept_blocks:           pitchContent.konzept_blocks,
      content_strategie_blocks: null,
      content_examples_branche: brancheHint || null,
      case_studies_keys:        matchedCases.map((c) => c.key),
      vorgehen_blocks:          pitchContent.vorgehen_blocks,
      cta_headline:             pitchContent.cta_headline,
      cta_text:                 pitchContent.cta_text,
      company_name_display:     lead.company_name,
      status:                   "published",
      published_at:             new Date().toISOString(),
    }).select().single();
    if (pitchErr) throw new Error(`Pitch-Page-Erstellung fehlgeschlagen: ${pitchErr.message}`);
    pitchUrl = buildPitchUrl(created.slug);
    console.log(`   → Live: ${pitchUrl}`);
  }

  const calendlyUrl = process.env.CALENDLY_URL ?? CALENDLY_URL;
  const firstName = (lead.contact_first_name ?? "").trim();
  const segment = lead.segment ?? "INKONSISTENT";

  // 5 separate Mails versenden — alle an kontakt@primesocial.de, NIEMALS an Lead.
  for (const step of WORKFLOW_STEPS) {
    let subject = "";
    let body = "";

    if (step.step === 1)       { subject = sanitizeSubject(claudeMails.mail_1.subject); body = claudeMails.mail_1.body; }
    else if (step.step === 2)  { subject = sanitizeSubject(claudeMails.mail_2.subject); body = claudeMails.mail_2.body; }
    else if (step.step === 3)  { subject = sanitizeSubject(claudeMails.mail_3.subject); body = claudeMails.mail_3.body; }
    else if (step.type === "template") {
      const tpl = getStepTemplate(step.step, segment, firstName);
      if (!tpl) { console.warn(`⚠️  Step ${step.step}: übersprungen`); continue; }
      subject = tpl.subject;
      body    = tpl.body;
    }

    const testSubject = `[FINAL-TEST · Mail ${step.step}] ${subject}`;
    const result = await sendTemplateEmail({
      to: { email: RECIPIENT_EMAIL, name: RECIPIENT_NAME },
      subject: testSubject,
      bodyText: body,
      pdfBuffer: step.step === 1 ? pdfBuffer : undefined,
      pdfName:   step.step === 1 ? pdfName   : undefined,
      inlineImageUrl: step.step === 2 ? PRIMESOCIAL_MEME_URL : undefined,
      inlineImageAlt: step.step === 2 ? "PrimeSocial" : undefined,
      pitchButton:    step.step === 3 ? { label: "Vorschläge ansehen", url: pitchUrl }      : undefined,
      calendlyButton: step.step === 4 ? { label: "15-Minuten-Slot wählen", url: calendlyUrl } : undefined,
    });

    console.log(`✅ Mail ${step.step} (${step.name}) verschickt${result.messageId ? ` — ${result.messageId}` : ""}`);
  }

  console.log(`\n🎯 Final-Test: ${lead.company_name} · Segment: ${segment} · Lead-Type: ${leadType} · Case: ${cs.firmenname}`);
}

run().catch((e) => {
  console.error("💥 Fehler:", e);
  process.exit(1);
});
