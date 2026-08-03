// ─────────────────────────────────────────────────────────────────
// DISCOVER — Kandidaten über Google Maps (Apify) finden.
// Google Maps braucht IMMER einen Suchbegriff (reines Ausschluss-Suchen
// ist nicht möglich). Daher: breite Seed-Kategorien als Suchbegriffe,
// die UI-editierbare Ausschluss-Liste siebt unpassende wieder aus.
// Eigener Apify-Client — lib/apify.ts (Automation) bleibt unberührt.
// ─────────────────────────────────────────────────────────────────
import "proxy-agent"; // Side-Effect-Import, sonst crasht der Cron (siehe lib/apify.ts)
import { ApifyClient } from "apify-client";
import { SEED_CATEGORIES } from "@/lib/research/seed";
import {
  createProspect, updateRun, domainOf, buildDedupKey,
} from "@/lib/research/db";
import { checkCompanyCoverage, upsertCompany } from "@/lib/company/db";
import { scoreProspectsFromMaps } from "@/lib/research/score";
import type { ResearchProspect } from "@/types/research";

const GMAPS_ACTOR = process.env.APIFY_GMAPS_ACTOR ?? "compass/crawler-google-places";

function client() {
  return new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
}

export { SEED_CATEGORIES };

// Rohes Google-Maps-Ergebnis (nur die Felder, die wir nutzen).
interface GmapsPlace {
  title?: string;
  website?: string | null;
  phone?: string | null;
  phoneUnformatted?: string | null;
  address?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  categoryName?: string | null;
  categories?: string[];
  totalScore?: number | null;
  reviewsCount?: number | null;
}

// Bestimmt die Suchbegriffe: konkrete Branche → nur diese, sonst Seed-Liste
// minus alles, was einem Ausschluss-Term entspricht.
export function buildSearchTerms(branche: string | null, exclusions: string[]): string[] {
  const ex = exclusions.map((e) => e.toLowerCase().trim()).filter(Boolean);
  const isExcluded = (term: string) => {
    const t = term.toLowerCase();
    return ex.some((e) => t.includes(e) || e.includes(t));
  };
  if (branche && branche.trim()) {
    return isExcluded(branche) ? [] : [branche.trim()];
  }
  return SEED_CATEGORIES.filter((c) => !isExcluded(c));
}

// Ein Treffer rausfiltern, wenn Kategorie oder Name einem Ausschluss entspricht.
function matchesExclusion(place: GmapsPlace, exclusions: string[]): boolean {
  const hay = [place.categoryName, ...(place.categories ?? []), place.title]
    .filter(Boolean).join(" ").toLowerCase();
  return exclusions.some((e) => {
    const t = e.toLowerCase().trim();
    return t.length > 0 && hay.includes(t);
  });
}

export interface DiscoverResult {
  found: number;     // neue Prospects (nach Dedup)
  skipped: number;   // bereits bekannt / ausgeschlossen
  prospects: ResearchProspect[];
}

// Führt die Discovery aus und schreibt die Prospects. Entweder für EINE Stadt
// (stadt) oder landesweit über mehrere Städte (cities) in EINEM Actor-Run.
// runId wird mitgegeben, damit found/skipped am Run nachgetragen werden können.
export async function discoverForCity(args: {
  runId: string;
  bundesland: string;
  stadt: string;
  branche: string | null;
  exclusions: string[];
  maxPerSearch?: number;
  cities?: string[];        // landesweit: Liste von Städten (statt einer)
  withTeamProbe?: boolean;  // Team-Check beim Scoren (Default: true)
}): Promise<DiscoverResult> {
  const { runId, bundesland, stadt, branche, exclusions } = args;
  const cityList = args.cities && args.cities.length > 0 ? args.cities : [stadt];
  const maxPerSearch = args.maxPerSearch ?? (branche ? 20 : 8);
  const withTeamProbe = args.withTeamProbe ?? true;

  const terms = buildSearchTerms(branche, exclusions);
  if (terms.length === 0) {
    await updateRun(runId, { status: "done", found_count: 0, skipped_count: 0 });
    return { found: 0, skipped: 0, prospects: [] };
  }

  // Alle Begriffe × Städte in EINEM Actor-Run (kosteneffizient).
  const searchStringsArray = terms.flatMap((t) => cityList.map((c) => `${t} ${c}`));
  const run = await client().actor(GMAPS_ACTOR).call({
    searchStringsArray,
    language: "de",
    maxCrawledPlacesPerSearch: maxPerSearch,
    skipClosedPlaces: true,
  });
  const { items } = await client().dataset(run.defaultDatasetId).listItems();
  const places = (items ?? []) as GmapsPlace[];

  let found = 0;
  let skipped = 0;
  const created: ResearchProspect[] = [];
  const seenInThisRun = new Set<string>();

  for (const place of places) {
    if (!place.title) continue;

    // Ausschluss per Kategorie/Name
    if (matchesExclusion(place, exclusions)) { skipped++; continue; }

    const website = place.website ?? null;
    const domain = domainOf(website);
    const dedupKey = buildDedupKey(domain, null);

    // Doppelte innerhalb desselben Laufs überspringen
    if (dedupKey && seenInThisRun.has(dedupKey)) { skipped++; continue; }

    // Dedup zentral gegen die companies-DB (kennt Automation + Manuell + Research)
    const coverage = await checkCompanyCoverage({ domain });
    if (coverage.known) { skipped++; continue; }

    if (dedupKey) seenInThisRun.add(dedupKey);

    const cityName = place.city ?? (cityList.length === 1 ? stadt : null);
    const category = place.categoryName ?? (place.categories ?? [])[0] ?? null;
    const prospect = await createProspect({
      run_id: runId,
      status: "discovered",
      company_name: place.title,
      website,
      address: place.address ?? place.street ?? null,
      city: cityName,
      bundesland,
      phone: place.phone ?? place.phoneUnformatted ?? null,
      gmaps_category: category,
      rating: place.totalScore ?? null,
      reviews_count: place.reviewsCount ?? null,
      dedup_key: dedupKey,
      already_known_in: null,
    });
    created.push(prospect);
    found++;

    // Zentrale DB schon mit den Basis-Daten füttern (Name/Website/Stadt/Branche).
    try {
      await upsertCompany({
        company_name: place.title,
        website,
        stadt: cityName,
        bundesland,
        branche: category,
        phone: place.phone ?? place.phoneUnformatted ?? null,
        rating: place.totalScore ?? null,
        reviews_count: place.reviewsCount ?? null,
        source: "research",
      });
    } catch (e) { console.warn("[research/discover] upsertCompany fehlgeschlagen:", e); }
  }

  // Stufe 1: direkt scoren (Größe/Branche/Score aus Maps-Daten) → Status 'scored'.
  let scored = created;
  if (created.length > 0) {
    try {
      scored = await scoreProspectsFromMaps(created, withTeamProbe);
    } catch (e) {
      console.error("[research/discover] Scoring fehlgeschlagen:", e);
    }
  }

  await updateRun(runId, { status: "done", found_count: found, skipped_count: skipped });
  return { found, skipped, prospects: scored };
}
