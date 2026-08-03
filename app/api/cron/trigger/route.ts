import { NextRequest, NextResponse } from "next/server";

// Trigger ist ein Convenience-Wrapper für /api/cron/daily — leitet einfach
// weiter mit dem CRON_SECRET als Bearer. Damit niemand von außen den teuren
// Daily-Cron triggern kann (Apify+Claude+Brevo = $$), braucht es hier den
// gleichen Auth-Check wie in /api/cron/daily selbst.
export const runtime = "nodejs";
export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "dev";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${BASE_URL}/api/cron/daily`, {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 }
    );
  }
}
