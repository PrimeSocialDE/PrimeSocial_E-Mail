"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManualDriveLink } from "@/types/manual";

export function DriveLinksClient({ initialLinks }: { initialLinks: ManualDriveLink[] }) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!label.trim() || !url.trim()) { setError("Label und URL sind Pflicht."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/manual/drive-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url, category: category || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Speichern fehlgeschlagen");
      setLinks((prev) => [data, ...prev]);
      setLabel(""); setUrl(""); setCategory("");
      router.refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Link wirklich löschen?")) return;
    const res = await fetch(`/api/manual/drive-links/${id}`, { method: "DELETE" });
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== id));
      router.refresh();
    }
  }

  // nach Kategorie gruppieren (ohne Kategorie → "Ohne Kategorie")
  const groups = links.reduce<Record<string, ManualDriveLink[]>>((acc, l) => {
    const key = l.category?.trim() || "Ohne Kategorie";
    (acc[key] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="font-semibold text-white text-sm mb-3">Link hinzufügen</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (z.B. Case Studies)" className="input w-full" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" className="input w-full" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategorie (optional)" className="input w-full" />
        </div>
        {error && <div className="text-red-400 text-xs mt-2">{error}</div>}
        <button onClick={handleAdd} disabled={saving} className="btn-primary mt-3 disabled:opacity-40">
          {saving ? "Speichere…" : "Hinzufügen"}
        </button>
      </div>

      {links.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-sm text-gray-600">Noch keine Links.</p></div>
      ) : (
        Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="card p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-3">{cat}</h3>
            <div className="space-y-1.5">
              {items.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] group">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex items-center gap-2 text-gray-200 hover:text-brand-400 transition-colors">
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    <span className="text-sm font-medium truncate">{l.label}</span>
                    <span className="text-xs text-gray-600 truncate hidden md:inline">{l.url}</span>
                  </a>
                  <button onClick={() => handleDelete(l.id)} className="text-gray-600 hover:text-red-400 transition-colors text-xs flex-shrink-0">
                    Löschen
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
