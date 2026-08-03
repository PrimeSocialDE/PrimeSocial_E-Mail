// ─────────────────────────────────────────────────────────────────
// DISCOVERY-Plattform: KLEINANZEIGEN.DE (Jobbörse).
//
// Doppelt gesichert: läuft NUR wenn STELLENSIGNALE_KLEINANZEIGEN=true UND
// APIFY_KLEINANZEIGEN_ACTOR gesetzt ist. Sonst kein Call, keine Kosten.
// Empfohlener Actor: ein Kleinanzeigen-/generischer Web-Scraper-Actor; die
// Actor-ID kommt aus der Env (kein Hardcode → keine Überraschungs-Kosten).
// ─────────────────────────────────────────────────────────────────
import { callActorSafe, toTreffer } from "@/lib/stellensignale/apify";
import type { DiscoveryTreffer } from "@/types/stellensignale";

export function kleinanzeigenAktiv(): boolean {
  return process.env.STELLENSIGNALE_KLEINANZEIGEN === "true" && !!process.env.APIFY_KLEINANZEIGEN_ACTOR;
}

export async function discoverKleinanzeigen(ort: string, gewerk: string): Promise<DiscoveryTreffer[]> {
  if (!kleinanzeigenAktiv()) return [];
  const items = await callActorSafe(process.env.APIFY_KLEINANZEIGEN_ACTOR, {
    // Generisches Input-Schema — je nach gewähltem Actor ggf. anpassen.
    query: `${gewerk} ${ort}`,
    location: ort,
    category: "jobs",
  });
  return items
    .map((it) => toTreffer(it, { quelle: "kleinanzeigen", gewerk, fallbackOrt: ort }))
    .filter((t): t is DiscoveryTreffer => t !== null);
}
