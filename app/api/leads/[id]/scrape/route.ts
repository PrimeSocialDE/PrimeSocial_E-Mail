import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/supabase";
import { scrapeInstagramProfile } from "@/lib/apify";
import { classifySegment, getSegmentRouting, MAIL_ELIGIBLE_SEGMENTS } from "@/lib/segments";
import { extractInstagramHandle } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLead(id);

    if (!lead.instagram_handle) {
      return NextResponse.json({ error: "Kein Instagram-Handle hinterlegt" }, { status: 400 });
    }

    // Ensure we pass a clean handle (not a full URL) to Apify
    const cleanHandle = extractInstagramHandle(lead.instagram_handle);
    const instagramData = await scrapeInstagramProfile(cleanHandle);
    const segment = classifySegment(instagramData);
    const routing = getSegmentRouting(segment);
    const now = new Date().toISOString();

    // Routing-Update: wenn der Lead vorher nicht mail-eligible war und jetzt einem
    // Mail-eligible Segment zugeordnet wird, wird er aktiviert.
    // Erfolgreicher Manual-Scrape resettet den Retry-Zähler — falls der Lead
    // vorher durch wiederholte Apify-Fehler auf attempts=3 verbrannt wurde, ist
    // er jetzt wieder im Spiel.
    const updates: Record<string, unknown> = {
      instagram_data: instagramData,
      segment,
      last_scraped_at: now,
      scrape_attempts: 0,
    };
    if (cleanHandle !== lead.instagram_handle) {
      updates.instagram_handle = cleanHandle;
    }

    // Status nur setzen, wenn der Lead noch nicht in einer aktiven Sequenz ist.
    // Wer bereits "active" mit workflow_step > 0 hat, bleibt unverändert.
    const wasInActiveSequence = lead.status === "active" && lead.workflow_step > 0;
    if (!wasInActiveSequence) {
      updates.status = routing.status;
      updates.pause_reason = routing.pause_reason;
      // Wenn jetzt mail-eligible → Sequenz starten
      if (routing.status === "active" && segment && MAIL_ELIGIBLE_SEGMENTS.includes(segment) && segment !== "SOLIDE") {
        updates.workflow_step = 1;
        updates.workflow_started_at = now;
        updates.next_touchpoint_at = now;
      }
    }

    const updated = await updateLead(id, updates as Parameters<typeof updateLead>[1]);
    return NextResponse.json({ lead: updated, segment, routing });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
