"use client";

import { useState } from "react";
import type { ExcludedBranche } from "@/types/research";

export function EinstellungenClient({
  initialExclusions, seedCategories,
}: {
  initialExclusions: ExcludedBranche[];
  seedCategories: string[];
}) {
  const [exclusions, setExclusions] = useState<ExcludedBranche[]>(initialExclusions);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Einen Begriff ausschließen (von Eingabefeld ODER + an einer aktiven Kategorie).
  async function addTerm(raw: string, fromInput = false) {
    const t = raw.trim();
    if (!t) return;
    if (exclusions.some((e) => e.term.toLowerCase() === t.toLowerCase())) { if (fromInput) setTerm(""); return; }
    setError(null);
    try {
      const res = await fetch("/api/research/exclusions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Hinzufügen fehlgeschlagen");
      setExclusions((prev) => [...prev, data.exclusion].sort((a, b) => a.term.localeCompare(b.term)));
      if (fromInput) setTerm("");
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
  }

  async function remove(id: string) {
    setError(null);
    const prev = exclusions;
    setExclusions((p) => p.filter((e) => e.id !== id)); // optimistisch
    try {
      const res = await fetch(`/api/research/exclusions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Löschen fehlgeschlagen");
    } catch (e) {
      setExclusions(prev); // rollback
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  const exTerms = exclusions.map((e) => e.term.toLowerCase());
  const activeSeed = seedCategories.filter(
    (c) => !exTerms.some((e) => c.toLowerCase().includes(e) || e.includes(c.toLowerCase())),
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Ausschluss-Liste */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-heading font-semibold text-white">Ausgeschlossene Branchen ({exclusions.length})</h2>
          <p className="text-xs text-gray-600 mt-1">
            Treffer, deren Kategorie/Name einen dieser Begriffe enthält, werden bei der Recherche übersprungen.
            Klick auf <span className="text-red-300">×</span> holt eine Branche zurück.
          </p>
        </div>

        <div className="flex gap-2">
          <input value={term} onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTerm(term, true)}
            placeholder="z.B. Tattoo-Studio" className="input flex-1" />
          <button onClick={() => addTerm(term, true)} className="btn-primary">Hinzufügen</button>
        </div>
        {error && <div className="text-xs text-red-400">{error}</div>}

        <div className="flex flex-wrap gap-2">
          {exclusions.length === 0 && <p className="text-xs text-gray-600">Keine Ausschlüsse.</p>}
          {exclusions.map((e) => (
            <button key={e.id} onClick={() => remove(e.id)} title="Zurückholen (wieder aktiv)"
              className="group inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-300 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors">
              {e.term}
              <span className="text-red-400/70 group-hover:text-emerald-400">×</span>
            </button>
          ))}
        </div>
      </div>

      {/* Aktive Seed-Kategorien — Klick = ausschließen */}
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-heading font-semibold text-white">Aktive Such-Kategorien ({activeSeed.length})</h2>
          <p className="text-xs text-gray-600 mt-1">
            Diese {activeSeed.length} von {seedCategories.length} Kategorien werden bei breiten Läufen durchsucht.
            Klick auf <span className="text-brand-300">+</span> schließt eine Branche aus (wandert nach links).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {activeSeed.map((c) => (
            <button key={c} onClick={() => addTerm(c)} title="Ausschließen"
              className="group inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
              {c}
              <span className="text-gray-600 group-hover:text-red-400">+</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
