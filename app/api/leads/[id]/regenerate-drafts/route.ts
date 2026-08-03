import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/supabase";
import { generateAndSaveAllDrafts } from "@/lib/sequences";

export const runtime = "nodejs";
// 5 Claude-Calls in Folge (Opener + 2 Follow-Ups + ggf. weitere) — 120s defensiv.
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLead(id);

    if (!lead.segment || lead.status === "bounced" || lead.status === "unsubscribed") {
      return NextResponse.json({ error: "Lead kann keine Drafts generieren" }, { status: 400 });
    }

    // Regenerate all drafts (deletes existing pending ones)
    const drafts = await generateAndSaveAllDrafts(lead);

    return NextResponse.json({
      success: true,
      draftsGenerated: drafts.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
