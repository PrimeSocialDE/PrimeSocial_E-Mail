/**
 * OSM-Firmensuche als eigener Cron — WÖCHENTLICH.
 *
 * Warum getrennt vom Crawl-Cron: Eine Overpass-Abfrage je Kategorie dauert
 * 10 bis 30 Sekunden, bei vier Kategorien und mehreren Orten ist die
 * 300-Sekunden-Grenze schnell erreicht. Zusammen mit Discovery und
 * Karriere-Crawl in einem Lauf würde sich alles gegenseitig verdrängen.
 *
 * Warum wöchentlich reicht: OSM-Daten ändern sich langsam. Ein Werk, das
 * heute nicht drinsteht, steht morgen auch nicht drin. Häufigere Abfragen
 * belasten nur einen Freiwilligendienst, ohne neue Betriebe zu bringen.
 */
import { NextRequest, NextResponse } from "next/server";
import regionenData from "@/data/stellensignale-regionen.json";
import { runOsmDiscovery } from "@/lib/stellensignale/discover-osm";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface Zentrum { stadt: string; plz?: string; km_ab_oldenburg?: number }

// BEWUSST NICHT research-cities.json: die Liste dient dem Recherche-Modul,
// enthält zu zwei Dritteln NRW und beginnt bei Niedersachsen mit Hannover und
// Braunschweig. Für eine Ansprache, die mit "wir sind hier um die Ecke"
// argumentiert, wäre das die falsche Fläche.
const ZENTREN: Zentrum[] = (regionenData as { zentren?: Zentrum[] }).zentren ?? [];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.STELLENSIGNALE_OSM !== "true") {
    return NextResponse.json({ ok: true, skipped: "STELLENSIGNALE_OSM nicht gesetzt" });
  }

  try {
    // Rotation über die Kalenderwoche: jeder Lauf nimmt den nächsten Ausschnitt
    // der Zentrenliste. Bei 16 Zentren und 3 pro Woche ist die Region nach gut
    // fünf Wochen einmal komplett durch und beginnt von vorn.
    const maxOrte = parseInt(process.env.STELLENSIGNALE_OSM_MAX_ORTE ?? "3", 10);
    const woche = Math.floor(Date.now() / (7 * 86_400_000));
    const orte: string[] = [];
    for (let i = 0; i < maxOrte && ZENTREN.length > 0; i++) {
      orte.push(ZENTREN[(woche * maxOrte + i) % ZENTREN.length].stadt);
    }
    if (orte.length === 0) {
      return NextResponse.json({ ok: true, skipped: "Keine Zentren in stellensignale-regionen.json" });
    }

    const result = await runOsmDiscovery({ orte, maxOrte });
    if (result.fehler.length > 0) {
      console.warn(`[osm-cron] ${result.fehler.length} Hinweise:`, result.fehler.slice(0, 5));
    }
    return NextResponse.json({ ok: true, orte, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[osm-cron] Abbruch:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
