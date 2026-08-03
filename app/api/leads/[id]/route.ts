import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead, getEmailsForLead, cancelPendingDrafts, deleteLead } from "@/lib/supabase";
import { classifySegment } from "@/lib/segments";
import { extractInstagramHandle } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [lead, emails] = await Promise.all([getLead(id), getEmailsForLead(id)]);
    return NextResponse.json({ lead, emails });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteLead(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (body.instagram_handle) {
      body.instagram_handle = extractInstagramHandle(body.instagram_handle);
    }
    if (body.instagram_data && !body.segment) {
      body.segment = classifySegment(body.instagram_data);
    }
    const updated = await updateLead(id, body);

    // Wenn Status auf replied/converted/unsubscribed/paused → alle pending Drafts canceln
    const CANCEL_STATUSES = ["replied", "converted", "unsubscribed", "paused", "bounced"];
    if (body.status && CANCEL_STATUSES.includes(body.status)) {
      try {
        await cancelPendingDrafts(id);
      } catch { /* optional — Drafts-Tabelle existiert evtl. noch nicht */ }
    }

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
