import { NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import { runEmailEnrichment } from "@/lib/stellensignale/email-finder";

// NUR E-Mail-Findung (Impressum/Pattern) — KEIN Apify-Crawl. Schnell, damit es
// nicht in den Timeout des kombinierten Test-Laufs rennt. Auth-Pflicht.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

let laeuft = false;

export async function POST() {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

  if (laeuft) return NextResponse.json({ error: "Ein Lauf ist bereits aktiv." }, { status: 429 });
  laeuft = true;
  try {
    const result = await runEmailEnrichment({ limit: 15 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  } finally {
    laeuft = false;
  }
}
