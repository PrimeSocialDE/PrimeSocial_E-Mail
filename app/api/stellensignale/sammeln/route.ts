/**
 * Sammel-Lauf per Knopfdruck aus dem Dashboard.
 *
 * Phasen einzeln ansteuerbar, damit man gezielt nachlegen kann statt immer
 * alles laufen zu lassen:
 *   ?phase=osm        Firmen aus OpenStreetMap (das Firmen-Universum)
 *   ?phase=stellen    Arbeitsagentur (wer sucht gerade)
 *   ?phase=karriere   Karriereseiten bekannter Firmen (unabhängige Zweitquelle)
 *   ?phase=websites   Domain aus dem Firmennamen ermitteln
 *   ?phase=emails     Impressum auswerten
 *   ?phase=alles      der Reihe nach, mit Zeitbudget
 *
 * KOSTET NICHTS: keine bezahlte API, nur HTTP. Es werden KEINE Entwürfe
 * erzeugt und nichts versendet — das sind eigene, gedeckelte Schritte.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import regionenData from "@/data/stellensignale-regionen.json";
import zieleData from "@/data/stellensignale-targets.json";
import { runOsmDiscovery } from "@/lib/stellensignale/discover-osm";
import { runDiscovery } from "@/lib/stellensignale/discover";
import { runKarriereCrawl } from "@/lib/stellensignale/pipeline";
import { runWebsiteEnrichment } from "@/lib/stellensignale/website-enrichment";
import { runEmailEnrichment } from "@/lib/stellensignale/email-finder";
import type { DiscoveryZiel } from "@/types/stellensignale";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface Zentrum { stadt: string }
const ZENTREN = (regionenData as { zentren?: Zentrum[] }).zentren ?? [];
const ZIELE = (zieleData as { ziele?: DiscoveryZiel[] }).ziele ?? [];

// Nur EIN Lauf gleichzeitig. Zwei parallele Sammelläufe wuerden dieselben
// Firmen doppelt anlegen, weil beide denselben Bestand als Ausgangslage lesen.
let laeuft = false;

export async function POST(req: NextRequest) {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

  if (laeuft) {
    return NextResponse.json({ error: "Es läuft bereits ein Sammel-Lauf." }, { status: 429 });
  }
  laeuft = true;

  const phase = req.nextUrl.searchParams.get("phase") ?? "alles";
  const start = Date.now();
  const restMs = () => 250_000 - (Date.now() - start);
  const bericht: Record<string, unknown> = { phase };

  try {
    const heute = new Date().toISOString().slice(0, 10);

    if (phase === "osm" || phase === "alles") {
      // Wie viele Orte pro Lauf — beim Knopfdruck bewusst mehr als im Cron,
      // weil hier jemand zuschaut und die Laufzeit akzeptiert.
      const anzahl = parseInt(req.nextUrl.searchParams.get("orte") ?? "6", 10);
      const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);
      const orte = ZENTREN.slice(offset, offset + anzahl).map((z) => z.stadt);
      bericht.osm = await runOsmDiscovery({ orte, maxOrte: orte.length });
    }

    if ((phase === "stellen" || phase === "alles") && restMs() > 60_000) {
      bericht.stellen = await runDiscovery({ ziele: ZIELE, heute });
    }

    if ((phase === "karriere" || phase === "alles") && restMs() > 50_000) {
      bericht.karriere = await runKarriereCrawl({ heute, deadlineMs: Math.max(30_000, restMs() - 40_000) });
    }

    if ((phase === "websites" || phase === "alles") && restMs() > 40_000) {
      bericht.websites = await runWebsiteEnrichment({ deadlineMs: Math.max(20_000, restMs() - 20_000) });
    }

    if ((phase === "emails" || phase === "alles") && restMs() > 15_000) {
      bericht.emails = await runEmailEnrichment();
    }

    bericht.laufzeitSekunden = Math.round((Date.now() - start) / 1000);
    return NextResponse.json({ ok: true, ...bericht });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e instanceof Error ? e.message : e), ...bericht },
      { status: 500 },
    );
  } finally {
    laeuft = false;
  }
}
