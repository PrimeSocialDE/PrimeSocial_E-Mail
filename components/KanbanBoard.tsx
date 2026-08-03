"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Lead } from "@/types";
import { WORKFLOW_STEPS } from "@/types";
import { SegmentBadge } from "@/components/SegmentBadge";
import { isDue, getDaysUntilDue } from "@/lib/workflow";

export function KanbanBoard({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [dragging, setDragging] = useState<string | null>(null);

  async function handleDrop(leadId: string, targetStep: number) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, workflow_step: targetStep } : l))
    );
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_step: targetStep }),
    });
    setDragging(null);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 200px)" }}>
      {WORKFLOW_STEPS.map((step) => {
        const stepLeads = leads.filter((l) => l.workflow_step === step.step &&
          ["new", "active"].includes(l.status));

        return (
          <div
            key={step.step}
            className="flex-shrink-0 w-56"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("leadId");
              if (id) handleDrop(id, step.step);
            }}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center">
                  {step.step}
                </div>
                <span className="text-xs font-medium text-gray-400">{step.name}</span>
              </div>
              <span className="text-xs text-gray-600">{stepLeads.length}</span>
            </div>
            <div className="text-xs text-gray-700 px-1 mb-2">Tag {step.day}</div>

            {/* Cards */}
            <div className="space-y-2 min-h-[60px]">
              {stepLeads.map((lead) => {
                const due = isDue(lead.next_touchpoint_at);
                const daysUntil = getDaysUntilDue(lead.next_touchpoint_at);

                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("leadId", lead.id);
                      setDragging(lead.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={clsx(
                      "card p-3 cursor-grab active:cursor-grabbing transition-all",
                      dragging === lead.id && "opacity-50",
                      due && "border-red-500/30",
                      !due && daysUntil !== null && daysUntil <= 1 && "border-yellow-500/20"
                    )}
                  >
                    <Link href={`/leads/${lead.id}`} onClick={(e) => e.stopPropagation()}>
                      <div className="font-medium text-sm text-gray-200 hover:text-brand-400 transition-colors mb-1.5 truncate">
                        {lead.company_name}
                      </div>
                    </Link>
                    <SegmentBadge segment={lead.segment} size="sm" />
                    {lead.next_touchpoint_at && (
                      <div className={clsx("text-xs mt-2 font-medium",
                        due ? "text-red-400" : daysUntil !== null && daysUntil <= 1 ? "text-yellow-400" : "text-gray-600"
                      )}>
                        {due ? "Überfällig" :
                         daysUntil === 0 ? "Heute" :
                         daysUntil === 1 ? "Morgen" :
                         format(new Date(lead.next_touchpoint_at), "dd. MMM", { locale: de })}
                      </div>
                    )}
                  </div>
                );
              })}
              {stepLeads.length === 0 && (
                <div className="border border-dashed border-white/[0.07] rounded-lg h-12 flex items-center justify-center">
                  <span className="text-xs text-gray-700">Leer</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
