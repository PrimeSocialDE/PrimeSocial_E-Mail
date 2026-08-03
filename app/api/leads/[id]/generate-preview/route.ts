import { NextRequest, NextResponse } from "next/server";
import { getLead, getEmailsForLead } from "@/lib/supabase";
import { generateOpener, generateFollowUp } from "@/lib/anthropic";
import { WORKFLOW_STEPS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isClaudeConfigured() {
  const k = process.env.ANTHROPIC_API_KEY;
  return !!(k && k.startsWith("sk-ant-") && !k.includes("placeholder"));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { step } = await request.json();

    const [lead, emails] = await Promise.all([getLead(id), getEmailsForLead(id)]);

    if (!lead.segment) {
      return NextResponse.json({ error: "Lead hat kein Segment — bitte erst scrapen/segmentieren" }, { status: 400 });
    }

    const stepConfig = WORKFLOW_STEPS.find((s) => s.step === step);
    if (!stepConfig) return NextResponse.json({ error: `Unbekannter Step: ${step}` }, { status: 400 });

    if (!isClaudeConfigured()) {
      return NextResponse.json({
        subject: `[Lokal] Step ${step}: ${stepConfig.name} – ${lead.company_name}`,
        body: `Hey ${lead.contact_first_name ?? lead.company_name},\n\ndies ist eine Test-Mail für Step ${step} (${stepConfig.name}).\nSegment: ${lead.segment}\n\nViele Grüße\nNiklas`,
        localMode: true,
        pdfContent: null,
      });
    }

    const prevSubjects = emails.map((e) => e.subject);

    if (stepConfig.type === "claude_opener") {
      const opener = await generateOpener(lead);
      return NextResponse.json({
        subject: opener.subject,
        body: opener.body,
        pdfContent: {
          slide1_headline: opener.slide1_headline,
          slide1_subline: opener.slide1_subline,
          slide1_bullets: opener.slide1_bullets,
          slide1_these: opener.slide1_these,
          case_study_key: opener.case_study_key,
          detectedSegment: opener.sales_trigger,
          reasoning: opener.trigger_reasoning,
        },
      });
    }

    const email = await generateFollowUp(lead, step, prevSubjects);
    return NextResponse.json({ ...email, pdfContent: null });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
