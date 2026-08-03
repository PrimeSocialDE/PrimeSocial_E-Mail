"use client";

import { useRouter } from "next/navigation";
import { SEGMENTS, SEGMENT_LABELS, STATUS_LABELS } from "@/types";
import type { Segment, LeadStatus } from "@/types";

const ALL_STATUSES: LeadStatus[] = ["new", "active", "paused", "replied", "converted", "bounced", "unsubscribed"];

interface Props {
  currentSegment?: string;
  currentStatus?: string;
  currentDue?: string;
}

export function DashboardFilters({ currentSegment, currentStatus, currentDue }: Props) {
  const router = useRouter();

  function buildUrl(segment?: string, status?: string, due?: string) {
    const params = new URLSearchParams();
    if (segment) params.set("segment", segment);
    if (status) params.set("status", status);
    if (due) params.set("due", due);
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  }

  function onSegmentChange(value: string) {
    const segment = value || undefined;
    router.push(buildUrl(segment, currentStatus, currentDue));
  }

  function onStatusChange(value: string) {
    const status = value || undefined;
    router.push(buildUrl(currentSegment, status, currentDue));
  }

  function onDueToggle() {
    const due = currentDue === "true" ? undefined : "true";
    router.push(buildUrl(currentSegment, currentStatus, due));
  }

  const selectClass =
    "appearance-none bg-white/5 border border-white/10 text-gray-300 text-xs font-medium rounded-lg px-3 py-1.5 pr-7 cursor-pointer hover:bg-white/8 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500/50";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Segment Dropdown */}
      <div className="relative">
        <select
          value={currentSegment ?? ""}
          onChange={(e) => onSegmentChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Alle Segmente</option>
          {SEGMENTS.map((seg) => (
            <option key={seg} value={seg}>
              {SEGMENT_LABELS[seg as Segment]}
            </option>
          ))}
          <option value="KEINFIT">{SEGMENT_LABELS.KEINFIT}</option>
        </select>
        <svg className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Status Dropdown */}
      <div className="relative">
        <select
          value={currentStatus ?? ""}
          onChange={(e) => onStatusChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Alle Status</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <svg className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Due Toggle */}
      <button
        onClick={onDueToggle}
        className={
          currentDue === "true"
            ? "inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20"
            : "inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-white/5 hover:text-gray-300 hover:bg-white/8 transition-colors"
        }
      >
        Faellig
      </button>

      {/* Reset */}
      {(currentSegment || currentStatus || currentDue) && (
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Zurücksetzen
        </button>
      )}
    </div>
  );
}
