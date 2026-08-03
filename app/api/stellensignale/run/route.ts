import { NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import zieleData from "@/data/stellensignale-targets.json";
import { runDiscovery } from "@/lib/stellensignale/discover";
import { runKarriereCrawl } from "@/lib/stellensignale/pipeline";
import { runEmailEnrichment } from "@/lib/stellensignale/email-finder";
import type { DiscoveryZiel } from "@/types/stellensignale";

// Manueller Test-Trigger für den Stellensignal-Crawl (Button auf der
// Einstellungen-Seite). Bewusst KEIN Cron — ein einzelner Lauf auf Knopfdruck.
//
// SICHERHEIT:
//   1. Login-Pflicht: /api/ ist in dieser App middleware-offen, daher prüfen
//      wir die Supabase-Session HIER serverseitig. Ohne Login → 401.
//   2. Concurrency-Lock: parallele/Doppelklick-Läufe werden abgewiesen
//      (kein doppelter Apify-Verbrauch pro Instanz).
//   3. Extra-enger Test-Deckel: höchstens STELLENSIGNALE_MANUAL_MAX_QUERIES
//      (Default 3) Queries + kleines Email-Limit — auch wenn die Env-Deckel
//      höher stehen. Ein Test bleibt garantiert klein.
//   4. Plattform-Flags + Actor-IDs + maxItems/timeout gelten unverändert:
//      ist keine Plattform scharf geschaltet, passiert (kostenlos) nichts.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ZIELE: DiscoveryZiel[] = (zieleData as { ziele?: DiscoveryZiel[] }).ziele ?? [];

// Modul-weiter Lock (pro Serverless-Instanz). Verhindert Doppelläufe.
let laeuft = false;

export async function POST() {
  // 1) Login-Prüfung
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
  }

  // 2) Concurrency-Lock
  if (laeuft) {
    return NextResponse.json({ error: "Ein Lauf ist bereits aktiv — bitte warten." }, { status: 429 });
  }
  laeuft = true;

  try {
    const heute = new Date().toISOString().slice(0, 10);
    // 3) Extra-enger Test-Deckel
    const testMaxQueries = parseInt(process.env.STELLENSIGNALE_MANUAL_MAX_QUERIES ?? "3", 10);

    const discovery = await runDiscovery({ ziele: ZIELE, heute, maxQueries: testMaxQueries });
    const karriere = await runKarriereCrawl({ heute });
    const emails = await runEmailEnrichment({ limit: 12 }); // Test: Impressum-Checks (nur Firmen mit Website)

    return NextResponse.json({ ok: true, testMaxQueries, discovery, karriere, emails });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  } finally {
    laeuft = false;
  }
}
