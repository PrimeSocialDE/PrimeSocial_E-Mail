"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { KontakteClient } from "@/components/manual/KontakteClient";
import { ManualAnalyticsClient } from "@/components/manual/AnalyticsClient";
import type { ManualContact, ManualEmail } from "@/types/manual";

// Zusammengelegte Ansicht: Kontakte + Analytics unter einem Nav-Eintrag.
export function KontakteAnalyticsTabs({
  contacts, emails,
}: {
  contacts: ManualContact[];
  emails: ManualEmail[];
}) {
  const [tab, setTab] = useState<"kontakte" | "analytics">("kontakte");

  const tabs: { key: "kontakte" | "analytics"; label: string }[] = [
    { key: "kontakte",  label: `Kontakte (${contacts.length})` },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx("px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === t.key ? "bg-brand-500/20 text-brand-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kontakte"
        ? <KontakteClient initialContacts={contacts} />
        : <ManualAnalyticsClient initialEmails={emails} contacts={contacts} />}
    </div>
  );
}
