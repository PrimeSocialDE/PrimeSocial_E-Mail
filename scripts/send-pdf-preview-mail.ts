/**
 * Schickt das aktuelle PDF aus dem Mail-1-Draft (Schreinerei Bergmann) als
 * Mail-Anhang an kontakt@primesocial.de — fuer Review.
 *
 * Aufruf: npx tsx scripts/send-pdf-preview-mail.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { CASE_STUDIES, matchCaseStudies, caseStudyForSegment } from "../lib/pitch-constants";
import { sendTransactionalEmail } from "../lib/brevo";

const LEAD_ID = "a5a5c09e-ecfc-44d5-b8de-080f3afcd78d"; // Schreinerei Bergmann
const RECIPIENT = "kontakt@primesocial.de";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  console.log("📋 Lade Lead + Draft...");

  const { data: lead, error: leadErr } = await sb
    .from("primesocial_leads")
    .select("company_name, segment, website_summary, pitch_lead_type")
    .eq("id", LEAD_ID)
    .single();
  if (leadErr || !lead) {
    console.error("❌ Lead nicht gefunden:", leadErr);
    process.exit(1);
  }

  const { data: draft, error: draftErr } = await sb
    .from("email_drafts")
    .select("pdf_content")
    .eq("lead_id", LEAD_ID)
    .eq("step_number", 1)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftErr || !draft?.pdf_content) {
    console.error("❌ Kein Step-1-Draft mit pdf_content gefunden:", draftErr);
    process.exit(1);
  }

  const content = draft.pdf_content;
  const cs =
    caseStudyForSegment(lead.segment ?? null) ??
    CASE_STUDIES.find((c) => c.key === content.case_study_key) ??
    matchCaseStudies(null, lead.website_summary ?? "")[0];
  if (!cs) {
    console.error("❌ Keine Case Study gefunden");
    process.exit(1);
  }

  console.log(`📄 Rendere PDF mit Case Study: ${cs.firmenname}`);

  const buffer = await renderSlidesPdf({
    content: {
      headline:      content.headline      ?? content.slide1_headline      ?? "",
      subline:       content.subline       ?? content.slide1_subline       ?? "",
      body_text:     content.body_text     ?? (content.slide1_bullets ?? []).join("\n"),
      key_statement: content.key_statement ?? content.slide1_these         ?? "",
    },
    caseStudy: cs,
    meta: { companyName: lead.company_name },
    leadType: lead.pitch_lead_type ?? "branding",
  });

  console.log(`📧 Versende an ${RECIPIENT}...`);

  const pdfName = `PrimeSocial-Analyse-${lead.company_name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf`;
  const result = await sendTransactionalEmail({
    to: { email: RECIPIENT, name: "Niklas" },
    subject: `PDF-Preview: ${lead.company_name} (Mail-1-Anhang, aktuell)`,
    htmlContent: `<p style="font-family:sans-serif;font-size:15px;line-height:1.6;">
      Anbei die aktuelle PDF-Version, die als Anhang in Mail 1 versendet wird.<br><br>
      <strong>Lead:</strong> ${lead.company_name}<br>
      <strong>Case Study (Slide 2):</strong> ${cs.firmenname}<br><br>
      Stand: ${new Date().toLocaleString("de-DE")}
    </p>`,
    textContent: `Anbei die aktuelle PDF-Version (Mail-1-Anhang) für ${lead.company_name}.\n\nCase Study: ${cs.firmenname}\nStand: ${new Date().toLocaleString("de-DE")}`,
    attachmentBuffer: buffer,
    attachmentName: pdfName,
  });

  console.log(`✅ Verschickt`);
  if (result.messageId) console.log(`   Brevo-Message-ID: ${result.messageId}`);
}

run().catch((e) => {
  console.error("💥 Fehler:", e);
  process.exit(1);
});
