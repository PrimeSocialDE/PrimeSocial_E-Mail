import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/supabase";
import { classifyWithClaude } from "@/lib/anthropic";
import { classifySegment } from "@/lib/segments";
import type { Segment } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { useClaude } = await request.json().catch(() => ({ useClaude: false }));

    const lead = await getLead(id);

    let segment: Segment;
    let reasoning: string;

    if (useClaude && process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-")) {
      const result = await classifyWithClaude(lead);
      segment = result.segment as Segment;
      reasoning = result.reasoning;
    } else {
      segment = classifySegment(lead.instagram_data);
      reasoning = "Regelbasierte Klassifizierung";
    }

    const updated = await updateLead(id, { segment, segment_reasoning: reasoning });
    return NextResponse.json({ lead: updated, segment, reasoning });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
