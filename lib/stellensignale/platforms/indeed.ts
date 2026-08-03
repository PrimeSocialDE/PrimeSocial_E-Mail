// ─────────────────────────────────────────────────────────────────
// DISCOVERY-Plattform: INDEED.
//
// Doppelt gesichert: läuft NUR wenn STELLENSIGNALE_INDEED=true UND
// APIFY_INDEED_ACTOR gesetzt ist. Sonst kein Call, keine Kosten.
// Indeed enthält viele Personaldienstleister → der Störer-Filter
// (Blacklist/Keywords) ist hier besonders wichtig.
// ─────────────────────────────────────────────────────────────────
import { callActorSafe, toTreffer, limits } from "@/lib/stellensignale/apify";
import type { DiscoveryTreffer } from "@/types/stellensignale";

export function indeedAktiviert(): boolean {
  return process.env.STELLENSIGNALE_INDEED === "true" && !!process.env.APIFY_INDEED_ACTOR;
}

export async function discoverIndeed(ort: string, gewerk: string): Promise<DiscoveryTreffer[]> {
  if (!indeedAktiviert()) return [];
  // Input-Schema von misceres/indeed-scraper:
  //   position, location, country (Code, DE), maxItems, saveOnlyUniqueItems,
  //   parseCompanyDetails (teurer, liefert aber Firmen-Website → Email-Findung).
  const items = await callActorSafe(process.env.APIFY_INDEED_ACTOR, {
    position: gewerk,
    location: ort,
    country: process.env.STELLENSIGNALE_COUNTRY ?? "DE",
    maxItems: limits().maxItems,               // Item-Deckel auch im Actor-Input
    saveOnlyUniqueItems: true,
    parseCompanyDetails: process.env.STELLENSIGNALE_INDEED_COMPANY === "true", // Default aus (billiger)
  });
  return items
    .map((it) => toTreffer(it, { quelle: "indeed", gewerk, fallbackOrt: ort }))
    .filter((t): t is DiscoveryTreffer => t !== null);
}
