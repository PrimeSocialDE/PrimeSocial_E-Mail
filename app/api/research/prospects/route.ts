import { NextRequest, NextResponse } from "next/server";
import { getProspects } from "@/lib/research/db";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Liste der Prospects, optional nach Status gefiltert (?status=qualified).
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const prospects = await getProspects({ status, limit });
    return NextResponse.json({ prospects });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
