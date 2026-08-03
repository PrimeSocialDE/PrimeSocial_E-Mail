import { notFound } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { getLeads } from "@/lib/supabase";
import { SegmentBadge } from "@/components/SegmentBadge";
import { isDue, getDaysUntilDue } from "@/lib/workflow";
import type { Segment } from "@/types";
import { SEGMENT_LABELS, SEGMENT_COLORS, WORKFLOW_STEPS, STATUS_LABELS, STATUS_COLORS } from "@/types";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";

const SLUG_TO_SEGMENT: Record<string, Segment> = {
  keininstagram:   "KEININSTAGRAM",
  inaktiv:         "INAKTIV",
  inkonsistent:    "INKONSISTENT",
  keinevideo:      "KEINEVIDEO",
  wenigreichweite: "WENIGREICHWEITE",
  viralausreisser: "VIRALAUSREISSER",
  solide:          "SOLIDE",
  keinfit:         "KEINFIT",
};

export default async function SegmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const segment = SLUG_TO_SEGMENT[slug.toLowerCase()];
  if (!segment) notFound();

  const leads = await getLeads({ segment });

  // Aufteilen nach Workflow-Step
  const byStep = WORKFLOW_STEPS.map((s) => ({
    step: s,
    leads: leads.filter((l) => l.workflow_step === s.step),
  }));

  const stats = {
    total:   leads.length,
    active:  leads.filter((l) => l.status === "active").length,
    due:     leads.filter((l) => isDue(l.next_touchpoint_at)).length,
    replied: leads.filter((l) => l.status === "replied").length,
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-gray-600 hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-bold text-white">
              {SEGMENT_LABELS[segment]}
            </h1>
            <SegmentBadge segment={segment} />
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{leads.length} Leads in diesem Segment</p>
        </div>
        <div className="ml-auto">
          <CsvDownloadButton leads={leads} segment={segment} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Gesamt", value: stats.total },
          { label: "Aktiv", value: stats.active },
          { label: "Fällig", value: stats.due, accent: stats.due > 0 },
          { label: "Geantwortet", value: stats.replied },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">{s.label}</div>
            <div className={clsx("text-2xl font-heading font-bold", s.accent ? "text-red-400" : "text-white")}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Leads pro Step */}
      <div className="space-y-4">
        {byStep.map(({ step, leads: stepLeads }) => {
          if (stepLeads.length === 0) return null;
          return (
            <div key={step.step} className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3">
                <div className="w-6 h-6 rounded-md bg-brand-500/15 text-brand-400 text-xs font-bold flex items-center justify-center">
                  {step.step}
                </div>
                <div>
                  <span className="text-sm font-medium text-white">{step.name}</span>
                  <span className="text-xs text-gray-600 ml-2">{step.description}</span>
                </div>
                <span className="ml-auto text-xs text-gray-500">{stepLeads.length} Leads</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {stepLeads.map((lead) => {
                  const due = isDue(lead.next_touchpoint_at);
                  const daysUntil = getDaysUntilDue(lead.next_touchpoint_at);
                  return (
                    <div key={lead.id}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex-1 min-w-0">
                        <Link href={`/leads/${lead.id}`}
                          className="text-sm font-medium text-gray-200 hover:text-brand-400 transition-colors truncate block">
                          {lead.company_name}
                        </Link>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {lead.contact_first_name ?? lead.contact_name ?? "–"}
                          {lead.email && <span> · {lead.email}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[lead.status])}>
                          {STATUS_LABELS[lead.status]}
                        </span>
                        {lead.next_touchpoint_at && (
                          <div className="text-right">
                            <div className={clsx("text-xs font-medium",
                              due ? "text-red-400" :
                              daysUntil !== null && daysUntil <= 1 ? "text-yellow-400" : "text-gray-500"
                            )}>
                              {format(new Date(lead.next_touchpoint_at), "dd. MMM", { locale: de })}
                            </div>
                            <div className="text-xs text-gray-700">
                              {due ? "Überfällig" : daysUntil === 0 ? "Heute" : daysUntil === 1 ? "Morgen" : `in ${daysUntil}d`}
                            </div>
                          </div>
                        )}
                        <Link href={`/compose/${lead.id}`}
                          className="btn-ghost text-xs py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          E-Mail
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {leads.length === 0 && (
          <div className="text-center py-16 text-gray-500 text-sm">
            Keine Leads in diesem Segment.
          </div>
        )}
      </div>
    </div>
  );
}
