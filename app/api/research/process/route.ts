import { NextRequest, NextResponse } from "next/server";
import { processBatch } from "@/lib/research/pipeline";

// Verarbeitet eine Charge noch nicht angereicherter (discovered) Prospects.
// Vom UI-Button "Alle anreichern" und vom Batch-Cron genutzt.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let limit = 10;
    try {
      const body = await req.json();
      if (typeof body?.limit === "number") limit = body.limit;
    } catch { /* kein Body → Default */ }
    const result = await processBatch(limit);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
