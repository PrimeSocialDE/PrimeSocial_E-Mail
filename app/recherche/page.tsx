import citiesData from "@/data/research-cities.json";
import { SEED_GROUPS } from "@/lib/research/seed";
import { getRuns } from "@/lib/research/db";
import { RechercheClient } from "@/components/research/RechercheClient";
import type { CityEntry } from "@/types/research";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecherchePage() {
  const cities = (citiesData as { cities: CityEntry[] }).cities ?? [];
  const runs = await getRuns(20);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Recherche</h1>
        <p className="text-gray-500 text-sm mt-1">
          Unternehmen finden, gute merken und der Reihe nach anschreiben
        </p>
      </div>
      <RechercheClient initialRuns={runs} cities={cities} brancheGroups={SEED_GROUPS} />
    </div>
  );
}
