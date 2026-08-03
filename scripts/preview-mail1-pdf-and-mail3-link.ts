/**
 * Preview-Skript: Rendert die PDF aus Mail 1 + zeigt die Pitch-URL aus Mail 3
 * für den letzten Test-Lead (Schreinerei Bergmann).
 *
 * Liest pdf_content aus dem aktuellen email_drafts-Eintrag (step_number=1),
 * rendert mit lib/pdf-slides.tsx ein PDF, schreibt es nach /tmp/preview.pdf.
 *
 * Ausführen: npx tsx scripts/preview-mail1-pdf-and-mail3-link.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getLead, getPitchPageByLeadId } from "../lib/supabase";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { CASE_STUDIES, matchCaseStudies, caseStudyForSegment, buildPitchUrl } from "../lib/pitch-constants";

const LEAD_ID = "a5a5c09e-ecfc-44d5-b8de-080f3afcd78d";

async function run() {
  const lead = await getLead(LEAD_ID);
  console.log(`\n📋 Lead: ${lead.company_name} (Segment: ${lead.segment})`);

  // ── 1. Pitch-Page-Link (Mail 3) ───────────────────────────
  const pitchPage = await getPitchPageByLeadId(LEAD_ID);
  if (pitchPage?.slug) {
    console.log(`\n🔗 PITCH-LINK (Mail 3 Button "Vorschläge ansehen"):`);
    console.log(`   ${buildPitchUrl(pitchPage.slug)}`);
  } else {
    console.log(`\n⚠️  Keine Pitch-Page für diesen Lead`);
  }

  // ── 2. PDF aus pdf_content des Step-1-Drafts rendern ──────
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: draft, error } = await sb
    .from("email_drafts")
    .select("pdf_content, subject")
    .eq("lead_id", LEAD_ID)
    .eq("step_number", 1)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !draft?.pdf_content) {
    console.error(`\n❌ Kein Step-1-Draft mit pdf_content gefunden:`, error);
    process.exit(1);
  }

  const pdfContent = draft.pdf_content;
  console.log(`\n📄 PDF Slide-1-Content aus aktuellem Draft:`);
  console.log(`   Headline:      ${pdfContent.headline ?? pdfContent.slide1_headline}`);
  console.log(`   Subline:       ${pdfContent.subline ?? pdfContent.slide1_subline}`);
  console.log(`   Body-Text:     ${(pdfContent.body_text ?? "").slice(0, 120)}...`);
  console.log(`   Key-Statement: ${pdfContent.key_statement ?? pdfContent.slide1_these}`);
  console.log(`   Our-Approach:  ${pdfContent.our_approach ?? "—"}`);
  console.log(`   Case-Study:    ${pdfContent.case_study_key}`);

  const cs = caseStudyForSegment(lead.segment ?? null)
    ?? CASE_STUDIES.find((c) => c.key === pdfContent.case_study_key)
    ?? matchCaseStudies(null, lead.website_summary ?? "")[0];
  if (!cs) {
    console.error("❌ Keine Case Study gefunden");
    process.exit(1);
  }
  console.log(`   → gerendert mit Case Study: ${cs.firmenname}`);

  const buffer = await renderSlidesPdf({
    content: {
      headline:      pdfContent.headline      ?? pdfContent.slide1_headline      ?? "",
      subline:       pdfContent.subline       ?? pdfContent.slide1_subline       ?? "",
      body_text:     pdfContent.body_text     ?? (pdfContent.slide1_bullets ?? []).join("\n"),
      key_statement: pdfContent.key_statement ?? pdfContent.slide1_these         ?? "",
      our_approach:  pdfContent.our_approach  ?? "",
    },
    caseStudy: cs,
    meta: { companyName: lead.company_name },
  });

  const outPath = "/tmp/preview-mail1.pdf";
  fs.writeFileSync(outPath, buffer);
  console.log(`\n✅ PDF geschrieben nach: ${outPath}`);
  console.log(`   Öffnen mit: open ${outPath}`);
}

run().catch((err) => {
  console.error("💥 Fehler:", err);
  process.exit(1);
});
