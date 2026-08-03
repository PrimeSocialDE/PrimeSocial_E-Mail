import { Suspense } from "react";
import { getLeads } from "@/lib/supabase";
import { LeadTable } from "@/components/LeadTable";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SearchInput } from "@/components/SearchInput";
import type { LeadStatus, Segment } from "@/types";

// Live-Lead-Daten — kein Prerender beim Build, sonst schlägt Supabase-Call fehl.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    segment?: string;
    status?: string;
    due?: string;
  }>;
}

async function SearchContent({ searchParams }: PageProps) {
  const params = await searchParams;

  const leads = await getLeads({
    segment: params.segment as Segment | undefined,
    status: params.status as LeadStatus | undefined,
    search: params.search,
    dueSoon: params.due === "true",
  });

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
          <div className="font-semibold text-white">
            Leads <span className="text-gray-500 font-normal text-sm ml-1">({leads.length})</span>
          </div>
          <SearchInput initial={params.search ?? ""} />
          <DashboardFilters
            currentSegment={params.segment}
            currentStatus={params.status}
            currentDue={params.due}
          />
        </div>
        <div className="p-5">
          <LeadTable leads={leads} />
        </div>
      </div>
    </div>
  );
}

export default function SearchPage(props: PageProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Lead-Suche</h1>
        <p className="text-gray-500 text-sm mt-1">Alle Leads durchstöbern · suchen, filtern</p>
      </div>
      <Suspense fallback={<div className="text-gray-500 text-sm">Lade...</div>}>
        <SearchContent {...props} />
      </Suspense>
    </div>
  );
}
