"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Lead } from "@/types";
import { EmailEditor } from "@/components/EmailEditor";

export default function ComposePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((data) => { setLead(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20 text-gray-500">
        Lead nicht gefunden.{" "}
        <Link href="/dashboard" className="text-brand-400 hover:underline">Zurück</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/leads/${id}`} className="text-gray-600 hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">{lead.company_name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lead.contact_first_name ?? lead.contact_name ?? "–"} · {lead.email}
          </p>
        </div>
      </div>
      <div className="max-w-2xl">
        <EmailEditor lead={lead} />
      </div>
    </div>
  );
}
