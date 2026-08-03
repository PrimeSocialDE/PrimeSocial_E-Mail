import { NextRequest, NextResponse } from "next/server";
import { getEmailsForLead } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const emails = await getEmailsForLead(id);
    return NextResponse.json(emails);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
