import { NextRequest, NextResponse } from "next/server";
import { getCompanies, countCompanies } from "@/lib/company/db";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const [companies, total] = await Promise.all([getCompanies({ search, limit }), countCompanies()]);
    return NextResponse.json({ companies, total });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
