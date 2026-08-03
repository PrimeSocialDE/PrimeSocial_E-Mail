import { NextRequest, NextResponse } from "next/server";
import { updateManualEmail } from "@/lib/manual/db";
import { MANUAL_RESPONSE_STATUSES } from "@/types/manual";

export const runtime = "nodejs";
export const maxDuration = 15;

// Aktuell v.a. für den Antwortstatus aus der Analytics-Liste.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const updates = await req.json();

    if (updates.response_status && !MANUAL_RESPONSE_STATUSES.includes(updates.response_status)) {
      return NextResponse.json({ error: "Ungültiger response_status" }, { status: 400 });
    }
    // Nur erlaubte Felder durchlassen (kein Überschreiben von Tracking-Daten).
    const allowed: Record<string, unknown> = {};
    if (updates.response_status !== undefined) allowed.response_status = updates.response_status;

    const email = await updateManualEmail(id, allowed);
    return NextResponse.json(email);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
