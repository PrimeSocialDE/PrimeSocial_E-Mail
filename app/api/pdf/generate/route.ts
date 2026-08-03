import { NextRequest, NextResponse } from "next/server";
import { getLead } from "@/lib/supabase";
import { renderSlidesPdf } from "@/lib/pdf-slides";
import { CASE_STUDIES, matchCaseStudies, caseStudyForSegment } from "@/lib/pitch-constants";

export const runtime = "nodejs";
export const maxDuration = 30;

// v3-Schema mit Legacy-Fallback, damit alte Aufrufer (z.B. Dashboard-Preview)
// weiterhin funktionieren bis sie auf die neuen Feldnamen umgestellt sind.
interface SlideContentInput {
  // v3
  headline?: string;
  subline?: string;
  body_text?: string;
  key_statement?: string;
  our_approach?: string;
  case_study_key?: string;
  // Legacy
  slide1_headline?: string;
  slide1_subline?: string;
  slide1_bullets?: string[];
  slide1_these?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { leadId, pdfContent } = (await request.json()) as {
      leadId: string;
      pdfContent: SlideContentInput;
    };

    if (!leadId || !pdfContent) {
      return NextResponse.json({ error: "leadId und pdfContent sind Pflicht" }, { status: 400 });
    }

    const lead = await getLead(leadId);
    const cs = caseStudyForSegment(lead.segment ?? null)
      ?? CASE_STUDIES.find((c) => c.key === pdfContent.case_study_key)
      ?? matchCaseStudies(null, lead.website_summary ?? "")[0];
    if (!cs) return NextResponse.json({ error: "Keine Case Study gefunden" }, { status: 500 });

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

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="PrimeSocial-Analyse-${lead.company_name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
