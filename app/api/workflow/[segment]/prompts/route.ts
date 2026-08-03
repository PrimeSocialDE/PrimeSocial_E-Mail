import { NextRequest, NextResponse } from "next/server";
import { setPromptOverride } from "@/lib/supabase";

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

    const { step, rules } = await req.json();
    if (!step || rules === undefined) return NextResponse.json({ error: "step und rules erforderlich" }, { status: 400 });

    await setPromptOverride(segment, step, rules);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
