import { getTemplates, getDriveLinks, getContacts } from "@/lib/manual/db";
import { SchreibenClient } from "@/components/manual/SchreibenClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchreibenPage({ searchParams }: {
  searchParams: Promise<{ to?: string; company?: string; branche?: string; first?: string; hook?: string }>;
}) {
  const [sp, templates, driveLinks, contacts] = await Promise.all([
    searchParams, getTemplates(), getDriveLinks(), getContacts(),
  ]);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Schreiben</h1>
        <p className="text-gray-500 text-sm mt-1">Manuelle Mail verfassen, prüfen und versenden</p>
      </div>
      <SchreibenClient
        templates={templates} driveLinks={driveLinks} contacts={contacts}
        initialTo={sp.to ?? ""}
        prefill={{
          company: sp.company ?? "",
          branche: sp.branche ?? "",
          first: sp.first ?? "",
          hook: sp.hook ?? "",
        }}
      />
    </div>
  );
}
