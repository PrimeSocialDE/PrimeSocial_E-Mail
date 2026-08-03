import { NextRequest, NextResponse } from "next/server";
import { getProspect, updateProspect } from "@/lib/research/db";
import type { ProspectStatus } from "@/types/research";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_STATUS: ProspectStatus[] = ["discovered", "scored", "enriched", "qualified", "rejected", "handed_off"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const prospect = await getProspect(id);
    if (!prospect) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ prospect });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Status ändern (z.B. verwerfen → 'rejected', übergeben → 'handed_off').
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (typeof body.reject_reason === "string") updates.reject_reason = body.reject_reason;
    if (typeof body.shortlisted === "boolean") updates.shortlisted = body.shortlisted;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nichts zu aktualisieren" }, { status: 400 });
    }
    const prospect = await updateProspect(id, updates);
    return NextResponse.json({ prospect });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
