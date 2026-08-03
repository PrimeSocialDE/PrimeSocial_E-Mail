"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { clsx } from "clsx";
import type { Lead, LeadStatus, Segment } from "@/types";
import { STATUS_LABELS, STATUS_COLORS, SEGMENT_LABELS, SEGMENTS, WORKFLOW_STEPS } from "@/types";
import { SegmentBadge } from "@/components/SegmentBadge";
import { LEAD_TYPE_LABELS } from "@/lib/pitch-constants";
import { isDue, getDaysUntilDue } from "@/lib/workflow";

const BULK_STATUSES: LeadStatus[] = ["new", "active", "paused", "replied", "converted"];

export function LeadTable({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const someSelected = selected.size > 0 && selected.size < leads.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }, [allSelected, leads]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleBulkUpdate(update: { status?: string; segment?: string }) {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/leads/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), update }),
      });
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBulkLoading(false);
    }
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-16">
        <svg className="w-10 h-10 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-sm text-gray-500">Keine Leads gefunden</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-400" /> geöffnet</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand-400" /> versendet</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500" /> Versandfehler</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-white/10" /> ausstehend</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            <th className="pb-3 pr-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
              />
            </th>
            {["Unternehmen", "Segment", "Pitch-Thema", "Status", "Step", "Nächster Kontakt", "Handle"].map((h) => (
              <th key={h} className="text-left text-xs text-gray-600 font-medium uppercase tracking-wider pb-3 pr-6 first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {leads.map((lead) => {
            const daysUntil = getDaysUntilDue(lead.next_touchpoint_at);
            const due = isDue(lead.next_touchpoint_at);
            const stepConfig = WORKFLOW_STEPS.find((s) => s.step === lead.workflow_step);
            const isSelected = selected.has(lead.id);

            return (
              <tr key={lead.id} className={clsx("hover:bg-white/[0.02] transition-colors group", isSelected && "bg-brand-500/[0.04]")}>
                <td className="py-3.5 pr-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(lead.id)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
                  />
                </td>
                <td className="py-3.5 pr-6">
                  <Link href={`/leads/${lead.id}`}>
                    <div className="font-medium text-gray-200 group-hover:text-brand-400 transition-colors">
                      {lead.company_name}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {lead.contact_first_name ?? lead.contact_name ?? "–"}
                      {lead.city && <span className="text-gray-700"> · {lead.city}</span>}
                    </div>
                  </Link>
                </td>
                <td className="py-3.5 pr-6">
                  <SegmentBadge segment={lead.segment} />
                </td>
                <td className="py-3.5 pr-6">
                  {lead.pitch_lead_type ? (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-brand-300/20 text-brand-300 border border-brand-300/30">
                      {LEAD_TYPE_LABELS[lead.pitch_lead_type]}
                    </span>
                  ) : (
                    <span className="text-gray-700 text-xs">–</span>
                  )}
                </td>
                <td className="py-3.5 pr-6">
                  <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[lead.status])}>
                    {STATUS_LABELS[lead.status]}
                  </span>
                </td>
                <td className="py-3.5 pr-6">
                  <div className="flex items-center gap-2 mb-1">
                    {WORKFLOW_STEPS.map((s) => {
                      const ev = lead.step_events?.find((e) => e.step_number === s.step);
                      // Bounce-Fallback: bei historischen Bounces ist oft nur der Lead-Status
                      // gesetzt, nicht das bounced-Flag der einzelnen Mail.
                      const bounced = ev?.bounced || (lead.status === "bounced" && !!ev?.sent && !ev?.opened);
                      const color =
                        bounced     ? "bg-red-500" :     // Versandfehler / Bounce
                        ev?.opened  ? "bg-emerald-400" : // geöffnet
                        ev?.sent    ? "bg-brand-400" :   // versendet, noch nicht geöffnet
                                      "bg-white/10";     // noch nicht versendet
                      const label =
                        bounced     ? "Versandfehler" :
                        ev?.opened  ? "geöffnet" :
                        ev?.sent    ? "versendet" : "ausstehend";
                      return (
                        <div key={s.step} title={`${s.name}: ${label}`} className={clsx("w-2 h-2 rounded-sm", color)} />
                      );
                    })}
                  </div>
                  <div className="text-xs text-gray-500">{stepConfig?.name ?? "–"} ({lead.workflow_step}/{WORKFLOW_STEPS.length})</div>
                </td>
                <td className="py-3.5 pr-6">
                  {lead.next_touchpoint_at ? (
                    <>
                      <div className={clsx("text-sm font-medium",
                        due ? "text-red-400" : daysUntil !== null && daysUntil <= 1 ? "text-yellow-400" : "text-gray-300"
                      )}>
                        {format(new Date(lead.next_touchpoint_at), "dd. MMM", { locale: de })}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {due ? "Überfällig" : daysUntil === 0 ? "Heute" : daysUntil === 1 ? "Morgen" : `in ${daysUntil}d`}
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-600 text-xs">–</span>
                  )}
                </td>
                <td className="py-3.5 text-xs text-gray-600">
                  {lead.instagram_handle ? `@${lead.instagram_handle}` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="card border border-white/10 shadow-2xl px-5 py-3 flex items-center gap-4">
            <span className="text-sm font-medium text-white whitespace-nowrap">
              {selected.size} ausgewählt
            </span>
            <div className="w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2">
              <select
                disabled={bulkLoading}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleBulkUpdate({ status: e.target.value });
                  e.target.value = "";
                }}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-brand-500/50 cursor-pointer"
              >
                <option value="" disabled>Status ändern</option>
                {BULK_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <select
                disabled={bulkLoading}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleBulkUpdate({ segment: e.target.value });
                  e.target.value = "";
                }}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-brand-500/50 cursor-pointer"
              >
                <option value="" disabled>Segment ändern</option>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
            >
              Abbrechen
            </button>
            {bulkLoading && (
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
