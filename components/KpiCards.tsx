interface KpiProps {
  totalLeads: number;
  openRate: number;
  dueLeads: number;
  segmented: number;
  inWorkflow: number;
  onRadar: number;
  inRetry: number;
  outComplete: number;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: "brand" | "green" | "yellow" | "red" }) {
  const accentClass =
    accent === "brand"  ? "text-brand-400"   :
    accent === "green"  ? "text-green-400"   :
    accent === "yellow" ? "text-yellow-400"  :
    accent === "red"    ? "text-red-400"     :
    "text-white";
  return (
    <div className="card p-5">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-heading font-bold ${accentClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  color,
  sub,
}: {
  label: string;
  value: number;
  total: number;
  color: "green" | "yellow" | "red" | "brand";
  sub?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const fillClass =
    color === "green"  ? "bg-green-500"   :
    color === "yellow" ? "bg-yellow-500"  :
    color === "red"    ? "bg-red-500"     :
    "bg-brand-500";
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-[200px]">
        <div className="text-sm text-gray-300">{label}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${fillClass} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-gray-300 font-medium tabular-nums min-w-[60px] text-right">
        {value} <span className="text-gray-600 text-xs">/ {total}</span>
      </span>
    </div>
  );
}

export function KpiCards({ totalLeads, openRate, dueLeads, segmented, inWorkflow, onRadar, inRetry, outComplete }: KpiProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Leads gesamt" value={totalLeads} />
        <KpiCard label="Im Workflow" value={inWorkflow} accent="green" sub="bekommen aktuell Mails" />
        <KpiCard label="Open Rate" value={`${openRate}%`} sub="über alle versendeten Mails" accent={openRate > 30 ? "brand" : undefined} />
        <KpiCard
          label="Fällig heute"
          value={dueLeads}
          sub={dueLeads > 0 ? "sofort handeln" : "alles im Plan"}
          accent={dueLeads > 0 ? "brand" : undefined}
        />
      </div>

      {/* Fortschritt: wo stehen wir gerade */}
      <div className="card p-5">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-4">Fortschritt</div>
        <div className="space-y-3">
          <ProgressRow label="Segmentiert"       value={segmented}   total={totalLeads} color="brand"  sub="hat ein Segment zugewiesen" />
          <ProgressRow label="Im Workflow"       value={inWorkflow}  total={totalLeads} color="green"  sub="aktiv im Mail-Versand" />
          <ProgressRow label="Auf dem Radar"     value={onRadar}     total={totalLeads} color="yellow" sub="wartet auf 90-Tage-Re-Scrape" />
          <ProgressRow label="Im Retry"          value={inRetry}     total={totalLeads} color="yellow" sub="Apify/Summary-Versuch läuft noch" />
          <ProgressRow label="Komplett raus"     value={outComplete} total={totalLeads} color="red"    sub="kein Re-Scrape (außer manuell)" />
        </div>
      </div>
    </div>
  );
}
