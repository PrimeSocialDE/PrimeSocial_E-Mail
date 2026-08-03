import { NextRequest, NextResponse } from "next/server";
import citiesData from "@/data/research-cities.json";
import { getRuns } from "@/lib/research/db";
import { runDiscovery } from "@/lib/research/pipeline";
import type { CityEntry } from "@/types/research";

// On-Demand-Recherche: eine Stadt (Pflicht: bundesland + stadt) durchsuchen.
// Optional eine konkrete Branche; sonst breiter Seed-Lauf mit Ausschlüssen.
// wholeState=true: landesweit über die größten ~30 Städte (Branche dann Pflicht).
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const STATE_TOP_N = 30;        // größte Städte bei landesweiter Suche
const STATE_MAX_PER_SEARCH = 6; // Treffer pro Stadt (bei landesweit knapper)

// Top-N Städte eines Bundeslands: NRW nach Einwohnerzahl, sonst Dateireihenfolge
// (NDS ist mit Großstädten zuerst gepflegt).
function topCities(bundesland: string, n: number): string[] {
  const all = ((citiesData as { cities: CityEntry[] }).cities ?? []).filter((c) => c.bundesland === bundesland);
  const sorted = all.some((c) => typeof c.einwohner === "number")
    ? [...all].sort((a, b) => (b.einwohner ?? 0) - (a.einwohner ?? 0))
    : all;
  return sorted.slice(0, n).map((c) => c.stadt);
}

export async function GET() {
  try {
    const runs = await getRuns();
    return NextResponse.json({ runs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { bundesland, stadt, branche, maxPerSearch, wholeState, cities } = await req.json();
    if (!bundesland) {
      return NextResponse.json({ error: "Bundesland ist Pflicht." }, { status: 400 });
    }

    // Städte-Chunk (vom Client für die landesweite Suche in kurzen Teil-Läufen).
    if (Array.isArray(cities) && cities.length > 0) {
      if (!branche || !String(branche).trim()) {
        return NextResponse.json({ error: "Für eine landesweite Suche bitte eine Branche wählen." }, { status: 400 });
      }
      const { runId, result } = await runDiscovery({
        bundesland,
        stadt: stadt || `${bundesland} (${cities.length} Städte)`,
        branche,
        trigger: "manual",
        cities: cities.filter((c: unknown): c is string => typeof c === "string"),
        maxPerSearch: STATE_MAX_PER_SEARCH,
        withTeamProbe: false,
      });
      return NextResponse.json({ runId, chunk: true, ...result }, { status: 201 });
    }

    // Landesweit (Fallback, ein Request): über die größten Städte, Branche Pflicht.
    if (wholeState) {
      if (!branche || !String(branche).trim()) {
        return NextResponse.json({ error: "Für eine landesweite Suche bitte eine Branche wählen." }, { status: 400 });
      }
      const cities = topCities(bundesland, STATE_TOP_N);
      if (cities.length === 0) {
        return NextResponse.json({ error: "Keine Städte für dieses Bundesland gefunden." }, { status: 400 });
      }
      const { runId, result } = await runDiscovery({
        bundesland,
        stadt: `Ganz ${bundesland} (${cities.length} Städte)`,
        branche,
        trigger: "manual",
        cities,
        maxPerSearch: STATE_MAX_PER_SEARCH,
        withTeamProbe: false, // bei großen Läufen schneller; Größe wird in Leads verfeinert
      });
      return NextResponse.json({ runId, wholeState: true, cities: cities.length, ...result }, { status: 201 });
    }

    // Einzelne Stadt
    if (!stadt) {
      return NextResponse.json({ error: "Bundesland und Stadt sind Pflicht." }, { status: 400 });
    }
    const { runId, result } = await runDiscovery({
      bundesland, stadt,
      branche: branche || null,
      trigger: "manual",
      maxPerSearch: typeof maxPerSearch === "number" ? maxPerSearch : undefined,
    });
    return NextResponse.json({ runId, ...result }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
