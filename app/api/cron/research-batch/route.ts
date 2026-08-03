import { NextRequest, NextResponse } from "next/server";
import citiesData from "@/data/research-cities.json";
import { getRuns, getProspects } from "@/lib/research/db";
import { runDiscovery, processBatch } from "@/lib/research/pipeline";
import type { CityEntry } from "@/types/research";

// Batch-Cron für stetiges DB-Wachstum (Recherche-Modul).
//  1. Verarbeitet eine Charge bereits entdeckter Prospects (Enrich → Qualify).
//  2. Wenn die Enrich-Queue (discovered) zur Neige geht, wird EINE neue
//     Stadt-Discovery angestoßen — Rotation über die Städte-Liste.
// So bleiben Apify-Kosten kontrolliert (kein Dauer-Scrapen).
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CITIES: CityEntry[] = (citiesData as { cities: CityEntry[] }).cities ?? [];

// Schwelle: erst neu entdecken, wenn weniger als so viele Rohe in der Queue sind.
const REFILL_THRESHOLD = 15;

async function run() {
  // 1) Vorhandene rohe Prospects verarbeiten
  const processed = await processBatch(10);

  // 2) Queue auffüllen, wenn sie leer läuft
  let discovery: { city: CityEntry; found: number; skipped: number } | null = null;
  const pending = await getProspects({ status: "discovered", limit: REFILL_THRESHOLD + 1 });
  if (pending.length < REFILL_THRESHOLD && CITIES.length > 0) {
    // Rotation über die Anzahl bisheriger Läufe → spreizt über alle Städte
    const runCount = (await getRuns(500)).length;
    const city = CITIES[runCount % CITIES.length];
    const result = await runDiscovery({
      bundesland: city.bundesland,
      stadt: city.stadt,
      branche: null,        // breiter Seed-Lauf
      trigger: "cron",
    });
    discovery = { city, found: result.result.found, skipped: result.result.skipped };
  }

  return { processed, discovery };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Sicherheits-/Kostenschalter: Der automatische Batch (Discovery + Verarbeitung)
  // läuft NUR, wenn RESEARCH_BATCH_ENABLED=true gesetzt ist. Default: aus, damit
  // kein unbeaufsichtigter Apify-Verbrauch entsteht, solange die Arbeitsweise
  // noch nicht definiert ist. On-Demand-Recherche bleibt davon unberührt.
  if (process.env.RESEARCH_BATCH_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "RESEARCH_BATCH_ENABLED nicht gesetzt" });
  }
  try {
    const result = await run();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
