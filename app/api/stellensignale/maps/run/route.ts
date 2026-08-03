import { NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import zieleData from "@/data/stellensignale-targets.json";
import { runMapsDiscovery } from "@/lib/stellensignale/discover-maps";
import type { DiscoveryZiel } from "@/types/stellensignale";

// Firmensuche über Google Maps: legt Zielfirmen an (ohne Stellen-Signale).
// Auth-Pflicht, gedeckelt über STELLENSIGNALE_MAPS_MAX_QUERIES (Default 3).
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ZIELE: DiscoveryZiel[] = (zieleData as { ziele?: DiscoveryZiel[] }).ziele ?? [];

let laeuft = false;

export async function POST() {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

  if (laeuft) return NextResponse.json({ error: "Ein Lauf ist bereits aktiv." }, { status: 429 });
  laeuft = true;
  try {
    const result = await runMapsDiscovery({ ziele: ZIELE });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  } finally {
    laeuft = false;
  }
}
