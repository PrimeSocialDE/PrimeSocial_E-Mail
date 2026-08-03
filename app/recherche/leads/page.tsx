import { getProspects } from "@/lib/research/db";
import { LeadsClient } from "@/components/research/LeadsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RechercheLeadsPage() {
  const leads = await getProspects({ shortlisted: true, limit: 400 });
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Leads</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gespeicherte Unternehmen anreichern und der Reihe nach ins Schreiben überführen
        </p>
      </div>
      <LeadsClient initialLeads={leads} />
    </div>
  );
}
