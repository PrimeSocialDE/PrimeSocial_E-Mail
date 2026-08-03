import { Suspense } from "react";
import { getDashboardStats, getHotLeads, getOpenTodos } from "@/lib/supabase";
import { KpiCards } from "@/components/KpiCards";
import { HotLeadsBanner } from "@/components/HotLeadsBanner";
import { TodoBoard } from "@/components/TodoBoard";
import { CronButtonClient } from "@/components/CronButtonClient";

// Dashboard zeigt Live-Daten (ToDos, Hot Leads, Counter). Prerendern macht
// keinen Sinn — Build würde sonst beim Hochfahren versuchen Supabase
// abzurufen, was bei noch nicht migrierten Tabellen scheitert.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function DashboardContent() {
  const [stats, hotLeads, todos] = await Promise.all([
    getDashboardStats(),
    getHotLeads(),
    getOpenTodos(),
  ]);

  return (
    <div className="space-y-6">
      <TodoBoard initialTodos={todos} />
      <HotLeadsBanner leads={hotLeads} />
      <KpiCards {...stats} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Hot-Signals, Fortschritt und offene Reaktionen</p>
        </div>
        <CronButtonClient />
      </div>
      <Suspense fallback={<div className="text-gray-500 text-sm">Lade...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
