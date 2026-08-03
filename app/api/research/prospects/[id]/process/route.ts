import { NextRequest, NextResponse } from "next/server";
import { getProspect } from "@/lib/research/db";
import { processProspect } from "@/lib/research/pipeline";

// Einen einzelnen Prospect anreichern + qualifizieren (Enrich → Qualify).
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const prospect = await getProspect(id);
    if (!prospect) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    const done = await processProspect(prospect);
    return NextResponse.json({ prospect: done });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
