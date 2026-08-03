import { NextRequest, NextResponse } from "next/server";
import { generatePreviewEmail } from "@/lib/anthropic";
import { WORKFLOW_STEPS } from "@/types";
import { getStepRules } from "@/lib/segments";

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

    const { step, rules } = await req.json() as { step: number; rules?: string };
    const stepDef = WORKFLOW_STEPS.find((s) => s.step === step);
    if (!stepDef) return NextResponse.json({ error: "Unbekannter Step" }, { status: 400 });

    const effectiveRules = rules?.trim() || getStepRules(step, segment);

    const result = await generatePreviewEmail(
      segment,
      step,
      effectiveRules,
      stepDef.name,
      stepDef.description
    );

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
