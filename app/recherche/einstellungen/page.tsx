import { SEED_CATEGORIES } from "@/lib/research/seed";
import { getExclusions } from "@/lib/research/db";
import { EinstellungenClient } from "@/components/research/EinstellungenClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RechercheEinstellungenPage() {
  const exclusions = await getExclusions();
  const seedCategories = SEED_CATEGORIES;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Recherche · Einstellungen</h1>
        <p className="text-gray-500 text-sm mt-1">Branchen ausschließen, die nicht recherchiert werden sollen</p>
      </div>
      <EinstellungenClient initialExclusions={exclusions} seedCategories={seedCategories} />
    </div>
  );
}
