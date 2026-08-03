"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Segment } from "@/types";
import { SEGMENTS, SEGMENT_LABELS } from "@/types";

export default function NewLeadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_name: "",
    contact_first_name: "",
    contact_last_name: "",
    contact_name: "",
    email: "",
    city: "",
    instagram_handle: "",
    website_url: "",
    segment: "" as Segment | "",
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name || !form.email) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        contact_name: form.contact_name || [form.contact_first_name, form.contact_last_name].filter(Boolean).join(" ") || null,
        contact_first_name: form.contact_first_name || null,
        contact_last_name: form.contact_last_name || null,
        city: form.city || null,
        instagram_handle: form.instagram_handle || null,
        website_url: form.website_url || null,
        segment: (form.segment as Segment) || null,
      };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/leads/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-gray-600 hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-heading font-bold text-white">Lead hinzufügen</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">
                Unternehmen <span className="text-red-400">*</span>
              </label>
              <input value={form.company_name} onChange={set("company_name")} required className="input" placeholder="Mustermann GmbH" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Vorname</label>
              <input value={form.contact_first_name} onChange={set("contact_first_name")} className="input" placeholder="Max" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Nachname</label>
              <input value={form.contact_last_name} onChange={set("contact_last_name")} className="input" placeholder="Mustermann" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">
                E-Mail <span className="text-red-400">*</span>
              </label>
              <input value={form.email} onChange={set("email")} required type="email" className="input" placeholder="max@mustermann.de" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Stadt</label>
              <input value={form.city} onChange={set("city")} className="input" placeholder="München" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Instagram Handle</label>
              <input value={form.instagram_handle} onChange={set("instagram_handle")} className="input" placeholder="mustermann.gmbh" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Website</label>
              <input value={form.website_url} onChange={set("website_url")} className="input" placeholder="https://mustermann.de" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Segment (optional)</label>
              <select value={form.segment} onChange={set("segment")} className="input">
                <option value="">– Auto-Detect –</option>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Speichere..." : "Lead erstellen"}
          </button>
          <Link href="/dashboard" className="btn-ghost">Abbrechen</Link>
        </div>
      </form>
    </div>
  );
}
