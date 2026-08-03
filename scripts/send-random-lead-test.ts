/**
 * Letzter End-to-End-Test vor dem Go-Live:
 * Wählt einen zufälligen Lead aus der DB der alle Voraussetzungen erfüllt
 * (mail-eligible Segment + Summary + IG-Daten + Vorname + Email), bestimmt
 * den Lead-Type falls nötig und generiert alle 5 Mails + PDF.
 *
 * Schickt eine Vorschau-Mail an kontakt@primesocial.de mit:
 *   - Lead-Metadaten oben (Company, Segment, Lead-Type, Branche-Snippet)
 *   - Alle 5 Mails als formatiertes HTML
 *   - PDF als Anhang (so wie es echt versendet wird)
 *
 * Aufruf: npx tsx scripts/send-random-lead-test.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateLeadEmails, determineLeadType, sanitizeSubject } from "../lib/anthropic";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { chooseCaseStudy } from "../lib/pitch-constants";
import { getStepTemplate, MAIL_ELIGIBLE_SEGMENTS } from "../lib/segments";
import { sendTransactionalEmail, PRIMESOCIAL_MEME_URL } from "../lib/brevo";
import { WORKFLOW_STEPS } from "../types";
import type { Lead, PitchLeadType } from "../types";

const RECIPIENT = "kontakt@primesocial.de";

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
}

async function pickRandomEligibleLead(): Promise<Lead> {
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
  if (eligible.length === 0) {
    throw new Error("Keine eligible Leads in der DB gefunden (Voraussetzungen: Segment + Summary + IG + Vorname + Email)");
  }
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  console.log(`🎲 Zufallspick aus ${eligible.length} eligible Leads: ${pick.company_name} (${pick.segment})`);
  return pick as Lead;
}

function formatMailHtml(step: number, stepName: string, subject: string, body: string, scheduledLabel: string): string {
  // Plaintext → HTML mit Paragraph-Breaks
  const html = body
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:18px;margin-bottom:24px;background:#fff;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f3f5;">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0a7a8c;font-weight:700;">Mail ${step} · ${stepName}</div>
          <div style="font-size:15px;font-weight:600;color:#0f1115;margin-top:4px;">Betreff: ${subject}</div>
        </div>
        <div style="font-size:11px;color:#5b6470;">${scheduledLabel}</div>
      </div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f1115;">${html}</div>
    </div>
  `;
}

async function run() {
  const lead = await pickRandomEligibleLead();

  // Lead-Type bestimmen falls noch nicht gesetzt
  let leadType: PitchLeadType = lead.pitch_lead_type ?? "branding";
  if (!lead.pitch_lead_type) {
    console.log(`🤖 Bestimme Lead-Type via Claude...`);
    const { lead_type, reasoning } = await determineLeadType(lead);
    leadType = lead_type;
    console.log(`   → ${leadType} (${reasoning})`);
  } else {
    console.log(`✅ Lead-Type bereits gesetzt: ${leadType}`);
  }

  // 5 Mails generieren (Mails 1-3 via Claude, Mails 4-5 via Templates)
  console.log(`✉️  Generiere Mails 1-3 + Slide 1 via Claude...`);
  const claudeMails = await generateLeadEmails({ ...lead, pitch_lead_type: leadType });

  const firstName = (lead.contact_first_name ?? "").trim();
  const segment = lead.segment ?? "INKONSISTENT";

  type Mail = { step: number; stepName: string; subject: string; body: string; day: number };
  const mails: Mail[] = [];

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
        console.warn(`⚠️  Step ${step.step}: Template-Aufloesung fehlgeschlagen — übersprungen`);
        continue;
      }
      subject = tpl.subject;
      body = tpl.body;
    }
    mails.push({ step: step.step, stepName: step.name, subject, body, day: step.day });
  }

  // PDF für Mail 1 rendern
  console.log(`📄 Rendere PDF für Mail 1...`);
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
  });

  // Sammelmail komponieren
  console.log(`📧 Sende Sammelmail an ${RECIPIENT}...`);

  const mailBlocks = mails.map((m) => formatMailHtml(m.step, m.stepName, m.subject, m.body, `+${m.day} Tage`)).join("");

  const html = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f5f6f8;margin:0;padding:24px;">
    <div style="max-width:740px;margin:0 auto;">
      <div style="background:#0f1115;color:#fff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:2px;color:#88dfed;font-weight:700;text-transform:uppercase;">Letzter Vor-Go-Live-Test</div>
        <h1 style="font-size:24px;margin:6px 0 0 0;">${lead.company_name}</h1>
        <div style="font-size:13px;color:#aab0bb;margin-top:8px;">
          <strong>Segment:</strong> ${lead.segment ?? "?"} ·
          <strong>Lead-Type:</strong> ${leadType} ·
          <strong>Stadt:</strong> ${lead.city ?? "?"} ·
          <strong>Vorname:</strong> ${firstName}
        </div>
        <div style="font-size:13px;color:#aab0bb;margin-top:6px;">
          <strong>Case Study (PDF):</strong> ${cs.firmenname} (${cs.focus_area})
        </div>
        ${lead.website_summary ? `<div style="font-size:12px;color:#aab0bb;margin-top:10px;padding-top:10px;border-top:1px solid #ffffff15;line-height:1.5;"><strong>Website-Summary:</strong> ${lead.website_summary.slice(0, 400)}${lead.website_summary.length > 400 ? "..." : ""}</div>` : ""}
      </div>
      <p style="color:#5b6470;font-size:13px;margin:0 0 16px 0;">Alle 5 Mails wie sie der Lead bekommen würde (Mail 1 bekommt das PDF als Anhang, Mail 2 das Meme):</p>
      ${mailBlocks}
      <p style="color:#5b6470;font-size:12px;margin:20px 0 0 0;text-align:center;">Stand: ${new Date().toLocaleString("de-DE")}</p>
    </div>
  </body></html>`;

  const pdfName = `PrimeSocial-Analyse-${safeFilename(lead.company_name)}.pdf`;
  const result = await sendTransactionalEmail({
    to: { email: RECIPIENT, name: "Niklas" },
    subject: `Final-Test: 5 Mails + PDF für ${lead.company_name}`,
    htmlContent: html,
    textContent: `Test-Sequenz für ${lead.company_name} (${lead.segment}, ${leadType}). PDF-Case: ${cs.firmenname}.`,
    attachmentBuffer: pdfBuffer,
    attachmentName: pdfName,
  });

  console.log(`✅ Verschickt`);
  if (result.messageId) console.log(`   Brevo-Message-ID: ${result.messageId}`);
  void PRIMESOCIAL_MEME_URL; // import bewusst behalten, Mail 2 würde das in der echten Sequenz inline einbetten
}

run().catch((e) => {
  console.error("💥 Fehler:", e);
  process.exit(1);
});
