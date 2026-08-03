import { getCompanies, countCompanies } from "@/lib/company/db";
import { DatabaseClient } from "@/components/database/DatabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DatenbankPage() {
  const [companies, total] = await Promise.all([getCompanies({ limit: 200 }), countCompanies()]);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Datenbank</h1>
        <p className="text-gray-500 text-sm mt-1">
          Zentrale Unternehmens-Datenbank — sammelt &amp; reichert Daten aus allen Modulen an
        </p>
      </div>
      <DatabaseClient initialCompanies={companies} total={total} />
    </div>
  );
}
