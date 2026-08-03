import { NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import { runEntwuerfe } from "@/lib/stellensignale/entwurf";

// Erzeugt E-Mail-Entwürfe für die nächsten passenden Firmen (gedeckelt).
// Auth-Pflicht (serverseitig, da /api middleware-offen). Kein Versand.
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
    // Test-Deckel: kleiner Batch pro Klick (Claude-Kosten).
    const limit = parseInt(process.env.STELLENSIGNALE_ENTWURF_LIMIT ?? "10", 10);
    const result = await runEntwuerfe({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  } finally {
    laeuft = false;
  }
}
