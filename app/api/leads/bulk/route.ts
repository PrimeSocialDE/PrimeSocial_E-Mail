import { NextRequest, NextResponse } from "next/server";
import { updateLead } from "@/lib/supabase";
import type { LeadStatus, Segment } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, update } = body as {
      ids: string[];
      update: { status?: LeadStatus; segment?: Segment };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }
    if (!update || (!update.status && !update.segment)) {
      return NextResponse.json({ error: "update required" }, { status: 400 });
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await updateLead(id, update as Partial<import("@/types").Lead>);
        successCount++;
      } catch (e) {
        errors.push(`${id}: ${String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      updated: successCount,
      errors,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
