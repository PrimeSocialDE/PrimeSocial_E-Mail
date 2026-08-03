/**
 * Helper: Holt die 8 Test-Cases aus der DB (von test-all-cases.ts angelegt) und
 * sendet die Mails neu — diesmal mit Splitting für PDF-Mail (Brevo 20MB-Limit).
 *
 * - PDF-Mail wird in Chunks aufgeteilt (max ~15 MB pro Mail, weil Base64-Overhead +33%)
 * - Pitch-Link-Mail wird als 1 Mail versendet (kein Größenproblem)
 * - PDFs werden neu generiert (Opener-Output ist nicht in der DB persistiert),
 *   aber Pitch-Pages werden aus DB geholt (kein neuer Claude-Call)
 *
 * Ausführen: npx tsx scripts/resend-all-cases-mails.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { Lead } from "../types";
import { generateOpener } from "../lib/anthropic";
import { sendTransactionalEmail } from "../lib/brevo";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { CASE_STUDIES, matchCaseStudies, caseStudyForSegment } from "../lib/pitch-constants";
import { getPitchPageByLeadId } from "../lib/supabase";
import { createClient } from "@supabase/supabase-js";

const TO_EMAIL = "niklas@primesocial.de";
const BASE_URL = "https://mail.primesocial.de";
const MAX_BYTES_PER_MAIL = 15 * 1024 * 1024; // 15 MB Buffer (Base64 wird ~33% größer)

// Direct supabase client (lib/supabase.ts hat keinen "find by company_name"-Helper)
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Reihenfolge wie in test-all-cases.ts MOCKS
const ORDERED_LABELS = [
  { label: "KEINEVIDEO_recruiting", company: "Schreinerei Bartels" },
  { label: "KEINEVIDEO_leadgen",    company: "Intax Steuerberatung" },
  { label: "KEINEVIDEO_branding",   company: "Dr. Sina Berkemann" },
  { label: "INKONSISTENT_recruiting", company: "Pflegedienst Norderwert" },
  { label: "INKONSISTENT_leadgen",  company: "Fahrschule Kummer" },
  { label: "INKONSISTENT_branding", company: "Studio LIN" },
  { label: "SOLIDE_recruiting",     company: "Logistik Niemeyer" },
  { label: "SOLIDE_meta_ads",       company: "Fitnessstudio Aurica" },
];

interface CaseResult {
  label: string;
  leadId: string;
  companyName: string;
  pdfBuffer: Buffer;
  pdfName: string;
  pitchUrl: string;
  caseStudyUsed: string;
}

async function findLeadByCompanyName(name: string): Promise<Lead | null> {
  const { data } = await client()
    .from("primesocial_leads")
    .select("*")
    .eq("company_name", `[TEST] ${name}`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return data[0] as Lead;
}

async function processCase(label: string, company: string): Promise<CaseResult> {
  console.log(`\n🔧 ${label} — ${company}`);
  const lead = await findLeadByCompanyName(company);
  if (!lead) throw new Error(`Lead "[TEST] ${company}" nicht gefunden in DB`);

  const pitch = await getPitchPageByLeadId(lead.id);
  if (!pitch) throw new Error(`Pitch-Page für ${lead.id} nicht gefunden`);

  console.log(`   Lead: ${lead.id}, Pitch: ${pitch.slug}`);
  console.log(`   ⏳ generateOpener...`);
  const opener = await generateOpener(lead);

  const cs = caseStudyForSegment(lead.segment ?? null)
    ?? CASE_STUDIES.find((c) => c.key === opener.case_study_key)
    ?? matchCaseStudies(null, lead.website_summary ?? "")[0];
  if (!cs) throw new Error(`Kein Case für ${label}`);

  console.log(`   ⏳ renderSlidesPdf (Case: ${cs.firmenname})...`);
  const pdfBuffer = await renderSlidesPdf({
    content: {
      slide1_headline: opener.slide1_headline,
      slide1_subline: opener.slide1_subline,
      slide1_bullets: opener.slide1_bullets,
      slide1_these: opener.slide1_these,
    },
    caseStudy: cs,
    meta: { companyName: lead.company_name },
  });
  const cleanCompany = lead.company_name.replace(/\[TEST\]\s*/, "").replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
  console.log(`   📎 PDF (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

  return {
    label,
    leadId: lead.id,
    companyName: lead.company_name.replace(/\[TEST\]\s*/, ""),
    pdfBuffer,
    pdfName: `${label}_${cleanCompany}.pdf`,
    pitchUrl: `${BASE_URL}/p/${pitch.slug}`,
    caseStudyUsed: cs.firmenname,
  };
}

function chunkBySize(results: CaseResult[]): CaseResult[][] {
  const chunks: CaseResult[][] = [];
  let current: CaseResult[] = [];
  let currentSize = 0;
  for (const r of results) {
    // Base64 ist ~33% größer als Buffer
    const b64Size = r.pdfBuffer.length * 1.34;
    if (currentSize + b64Size > MAX_BYTES_PER_MAIL && current.length > 0) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(r);
    currentSize += b64Size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function main() {
  console.log(`\n🚀 Resend ALL-CASES Mails — hole 8 Cases aus DB\n`);
  const results: CaseResult[] = [];
  for (const m of ORDERED_LABELS) {
    try {
      results.push(await processCase(m.label, m.company));
    } catch (err) {
      console.error(`   ❌ ${m.label}:`, err);
    }
  }

  if (results.length === 0) {
    console.error("Keine Cases verarbeitet.");
    process.exit(1);
  }

  // ── PDF-Mails in Chunks ─────────────────────────────────────────────────
  const chunks = chunkBySize(results);
  console.log(`\n📧 Versand-Plan: ${chunks.length} PDF-Mail(s) (à max 15 MB)`);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkSizeMb = (chunk.reduce((s, r) => s + r.pdfBuffer.length, 0) / 1024 / 1024).toFixed(2);
    console.log(`   Mail ${i + 1}/${chunks.length}: ${chunk.length} PDFs, ${chunkSizeMb} MB`);
    const listHtml = chunk
      .map((r, j) => `<li><b>${j + 1}. ${r.label}</b> — ${r.companyName} <span style="color:#888">(Case: ${r.caseStudyUsed})</span></li>`)
      .join("");
    await sendTransactionalEmail({
      to: { email: TO_EMAIL, name: "Niklas" },
      subject: chunks.length === 1
        ? `[ALL-CASES] PDFs für 8 Mock-Leads`
        : `[ALL-CASES] PDFs Teil ${i + 1}/${chunks.length}`,
      htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;">
        <p>Anhänge in dieser Mail (${chunkSizeMb} MB):</p>
        <ul style="padding-left:20px;">${listHtml}</ul>
        ${chunks.length > 1 ? `<p style="color:#888;font-size:13px;">PDFs sind auf ${chunks.length} Mails verteilt wegen Brevo 20-MB-Limit.</p>` : ""}
        <p style="color:#888;font-size:13px;">Hinweis: Vorher/Nachher-Layout in Slide 2 ist aktuell nur bei Kreisbahn-Aurich-Organic befüllt → trifft die KEINEVIDEO-Cases. Andere Cases zeigen Slide 2 mit Kurzbeschreibung-Fallback.</p>
      </div>`,
      attachments: chunk.map((r) => ({ name: r.pdfName, content: r.pdfBuffer })),
    });
    console.log(`   ✅ Mail ${i + 1}/${chunks.length} versendet`);
  }

  // ── Pitch-Link-Mail ─────────────────────────────────────────────────────
  console.log(`\n📧 Sende Pitch-Link-Mail mit ${results.length} Links...`);
  const groups: Record<string, CaseResult[]> = {};
  for (const r of results) {
    const segment = r.label.split("_")[0];
    if (!groups[segment]) groups[segment] = [];
    groups[segment].push(r);
  }
  const sectionsHtml = Object.entries(groups).map(([segment, items]) => {
    const itemsHtml = items.map((r) => `
      <li style="margin-bottom:8px;">
        <b>${r.label.replace(`${segment}_`, "")}</b> — ${r.companyName}<br>
        <a href="${r.pitchUrl}" style="color:#0a7a8c;">${r.pitchUrl}</a>
      </li>`).join("");
    return `<h3 style="margin:20px 0 8px 0;font-size:14px;letter-spacing:1.2px;color:#5c6470;">${segment}</h3><ul style="padding-left:20px;">${itemsHtml}</ul>`;
  }).join("");

  await sendTransactionalEmail({
    to: { email: TO_EMAIL, name: "Niklas" },
    subject: `[ALL-CASES] Pitch-Seiten für 8 Mock-Leads`,
    htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;">
      <p>Alle ${results.length} Pitch-Seiten sind live unter <code>mail.primesocial.de/p/[slug]</code>:</p>
      ${sectionsHtml}
      <p style="color:#888;font-size:13px;">Alle Test-Leads in der DB mit <code>[TEST]</code>-Prefix. Können später manuell gelöscht werden.</p>
    </div>`,
  });
  console.log(`   ✅ Pitch-Link-Mail versendet`);

  console.log(`\n✅ Fertig — ${chunks.length} PDF-Mail(s) + 1 Pitch-Link-Mail an ${TO_EMAIL}.`);
}

main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
