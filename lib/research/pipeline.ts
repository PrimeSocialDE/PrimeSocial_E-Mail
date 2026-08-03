// ─────────────────────────────────────────────────────────────────
// PIPELINE — Orchestrierung der Recherche-Schritte.
//  - runDiscovery: Stadt → Google Maps → rohe Prospects (Discover)
//  - processProspect: Enrich → Qualify für einen einzelnen Prospect
//  - processBatch: mehrere Prospects nacheinander verarbeiten
// Hält die API-Routes und den Cron schlank.
// ─────────────────────────────────────────────────────────────────
import { createRun, updateRun, getExclusions, getProspects } from "@/lib/research/db";
import { discoverForCity, type DiscoverResult } from "@/lib/research/discover";
import { enrichProspect } from "@/lib/research/enrich";
import { qualifyProspect } from "@/lib/research/qualify";
import type { ResearchProspect, ResearchTrigger } from "@/types/research";

// Eine Recherche von vorne: Run anlegen → Discover.
// Entweder eine Stadt (stadt) oder landesweit (cities[] + label als stadt-Anzeige).
export async function runDiscovery(args: {
  bundesland: string;
  stadt: string;
  branche?: string | null;
  trigger?: ResearchTrigger;
  maxPerSearch?: number;
  cities?: string[];
  withTeamProbe?: boolean;
}): Promise<{ runId: string; result: DiscoverResult }> {
  const run = await createRun({
    bundesland: args.bundesland,
    stadt: args.stadt,
    branche: args.branche ?? null,
    trigger: args.trigger ?? "manual",
  });
  try {
    const exclusions = (await getExclusions()).map((e) => e.term);
    const result = await discoverForCity({
      runId: run.id,
      bundesland: args.bundesland,
      stadt: args.stadt,
      branche: args.branche ?? null,
      exclusions,
      maxPerSearch: args.maxPerSearch,
      cities: args.cities,
      withTeamProbe: args.withTeamProbe,
    });
    return { runId: run.id, result };
  } catch (e) {
    await updateRun(run.id, { status: "error", error: String(e instanceof Error ? e.message : e) });
    throw e;
  }
}

// Enrich + Qualify für genau einen Prospect.
// Instagram wird hier NICHT gescraped (nur auf Anfrage) → igChecked=false.
export async function processProspect(prospect: ResearchProspect): Promise<ResearchProspect> {
  const enriched = await enrichProspect(prospect);
  return qualifyProspect(enriched, null, false);
}

// Reichert bis zu `limit` gespeicherte Leads an, die noch nicht angereichert
// sind (shortlisted + Status 'scored'). Sequenziell wegen Rate-Limits.
export async function processBatch(limit = 10): Promise<{ processed: number; qualified: number; rejected: number }> {
  const pending = await getProspects({ status: "scored", shortlisted: true, limit });
  let qualified = 0;
  let rejected = 0;
  for (const p of pending) {
    try {
      const done = await processProspect(p);
      if (done.status === "qualified") qualified++;
      else if (done.status === "rejected") rejected++;
    } catch (e) {
      console.error(`[research/pipeline] Prospect ${p.id} (${p.company_name}) fehlgeschlagen:`, e);
    }
  }
  return { processed: pending.length, qualified, rejected };
}
