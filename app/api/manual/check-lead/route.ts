import { NextRequest, NextResponse } from "next/server";
import { checkLeadByEmail } from "@/lib/manual/db";

// Rein lesender Abgleich gegen primesocial_leads. Keine Mutation.
export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email fehlt" }, { status: 400 });
    const result = await checkLeadByEmail(email);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
