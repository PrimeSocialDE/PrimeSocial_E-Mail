import { NextRequest, NextResponse } from "next/server";
import { getPitchPageByLeadId, updatePitchPage, updateLead } from "@/lib/supabase";
import { buildPitchUrl } from "@/lib/pitch-constants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pitch = await getPitchPageByLeadId(id);
    if (!pitch) {
      return NextResponse.json({ error: "Keine Pitch-Seite für diesen Lead vorhanden." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updated = await updatePitchPage(pitch.id, {
      status: "published",
      published_at: pitch.published_at ?? now,
    });

    const url = buildPitchUrl(updated.slug);
    // pitch_lead_type denormalisieren — fürs Dashboard
    await updateLead(id, {
      pitch_page_id: updated.id,
      pitch_page_url: url,
      pitch_lead_type: updated.lead_type,
    });

    return NextResponse.json({ pitch: updated, url });
  } catch (e) {
    console.error("[pitch/publish]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
