import { NextRequest, NextResponse } from "next/server";
import { generateRuleSuggestions } from "@/lib/anthropic";
import { WORKFLOW_STEPS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SLUG_TO_SEGMENT: Record<string, string> = {
  inaktiv:         "INAKTIV",
  inkonsistent:    "INKONSISTENT",
  keinevideo:      "KEINEVIDEO",
  wenigreichweite: "WENIGREICHWEITE",
  viralausreisser: "VIRALAUSREISSER",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ segment: string }> }) {
  try {
    const { segment: slug } = await params;
    const segment = SLUG_TO_SEGMENT[slug];
    if (!segment) return NextResponse.json({ error: "Unbekanntes Segment" }, { status: 404 });

    const { step, currentRules } = await req.json() as { step: number; currentRules: string };
    const stepDef = WORKFLOW_STEPS.find((s) => s.step === step);
    if (!stepDef) return NextResponse.json({ error: "Unbekannter Step" }, { status: 400 });

    const suggestions = await generateRuleSuggestions(
      segment,
      step,
      currentRules ?? "",
      stepDef.name,
      stepDef.description
    );

    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
