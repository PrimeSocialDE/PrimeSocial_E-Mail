"use client";

import type { Lead } from "@/types";
import { SEGMENT_LABELS } from "@/types";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function CsvDownloadButton({ leads, segment }: { leads: Lead[]; segment: string }) {
  function handleDownload() {
    const headers = [
      "Unternehmensname",
      "Vorname",
      "Nachname",
      "Firmen_Mail",
      "Private_Mail",
      "Stadt",
      "Website",
      "Instagram",
      "Website_Summary",
      "Segment",
      "Status",
    ];

    const rows = leads.map((l) => [
      escapeCsv(l.company_name),
      escapeCsv(l.contact_first_name),
      escapeCsv(l.contact_last_name),
      escapeCsv(l.email),
      escapeCsv(l.private_email),
      escapeCsv(l.city),
      escapeCsv(l.website_url),
      escapeCsv(l.instagram_handle),
      escapeCsv(l.website_summary),
      escapeCsv(l.segment ? SEGMENT_LABELS[l.segment] : ""),
      escapeCsv(l.status),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${segment}_leads.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={handleDownload} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
      </svg>
      CSV herunterladen
    </button>
  );
}
