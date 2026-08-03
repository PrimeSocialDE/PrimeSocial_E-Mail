"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import Link from "next/link";
import type { ResearchProspect } from "@/types/research";
import { ProspectCard } from "@/components/research/ProspectCard";
import { buildHandoffUrl } from "@/components/research/handoff";

type FilterKey = "alle" | "anzureichern" | "bereit" | "geschrieben";

// Stufe 2 — LEADS: gespeicherte Unternehmen anreichern (Website, Entscheider-
// Mail, IG auf Anfrage) und der Reihe nach ins Schreiben überführen.
export function LeadsClient({ initialLeads }: { initialLeads: ResearchProspect[] }) {
  const [leads, setLeads] = useState<ResearchProspect[]>(initialLeads);
  const [filter, setFilter] = useState<FilterKey>("alle");
  const [enriching, setEnriching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { alle: leads.length, anzureichern: 0, bereit: 0, geschrieben: 0 };
    for (const p of leads) {
      if (p.status === "scored") c.anzureichern++;
      else if (p.status === "handed_off") c.geschrieben++;
      else c.bereit++;
    }
    return c;
  }, [leads]);

  const visible = useMemo(() => {
    const list = leads.filter((p) => {
      if (filter === "alle") return true;
      if (filter === "anzureichern") return p.status === "scored";
      if (filter === "geschrieben") return p.status === "handed_off";
      return p.status !== "scored" && p.status !== "handed_off"; // bereit
    });
    // Geschriebene nach unten, sonst nach Score
    return list.sort((a, b) => {
      const aw = a.status === "handed_off" ? 1 : 0, bw = b.status === "handed_off" ? 1 : 0;
      if (aw !== bw) return aw - bw;
      return (b.score ?? 0) - (a.score ?? 0);
    });
  }, [leads, filter]);

  // Nächster anzuschreibender Lead (angereichert, noch nicht geschrieben, höchster Score).
  const nextToWrite = useMemo(
    () => leads
      .filter((p) => p.status !== "scored" && p.status !== "handed_off" && p.status !== "rejected" && p.best_email)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null,
    [leads],
  );

  async function refresh() {
    try {
      const r = await fetch("/api/research/prospects?status=&limit=400").then((x) => x.json());
      if (r.prospects) setLeads((r.prospects as ResearchProspect[]).filter((p) => p.shortlisted));
    } catch { /* ignore */ }
  }

  async function enrichAll() {
    setError(null); setMsg(null); setEnriching(true);
    try {
      const res = await fetch("/api/research/process", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 15 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Anreicherung fehlgeschlagen");
      setMsg(`${data.processed} angereichert · ${data.qualified} bereit · ${data.rejected} aussortiert.`);
      await refresh();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setEnriching(false); }
  }

  function replaceLead(updated: ResearchProspect) {
    // Aus Leads entfernt (shortlist false) → aus der Liste nehmen
    if (!updated.shortlisted) { setLeads((prev) => prev.filter((p) => p.id !== updated.id)); return; }
    setLeads((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "alle",         label: "Alle" },
    { key: "anzureichern", label: "Anzureichern" },
    { key: "bereit",       label: "Bereit" },
    { key: "geschrieben",  label: "Geschrieben" },
  ];

  if (leads.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-gray-600">
        Noch keine Leads. Speichere in der <Link href="/recherche" className="text-brand-400 hover:underline">Suche</Link> passende Unternehmen.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter + Anreichern */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                filter === f.key ? "bg-brand-500/20 text-brand-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
              {f.label} <span className="text-gray-600">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {counts.anzureichern > 0 && (
          <button onClick={enrichAll} disabled={enriching} className="btn-ghost text-xs disabled:opacity-40">
            {enriching ? "Reichere an…" : `Alle anreichern (${counts.anzureichern})`}
          </button>
        )}
      </div>

      {(msg || error) && <div className={clsx("text-xs", error ? "text-red-400" : "text-brand-300")}>{error ?? msg}</div>}

      {/* Arbeitsleiste: der Reihe nach anschreiben */}
      <div className="card p-4 flex items-center justify-between gap-3 border-brand-500/30">
        <div className="text-sm text-gray-300">
          <span className="font-semibold text-white">{counts.bereit}</span> bereit ·{" "}
          {counts.anzureichern} noch anzureichern · {counts.geschrieben} geschrieben
        </div>
        {nextToWrite ? (
          <a href={buildHandoffUrl(nextToWrite)} className="btn-primary text-xs">
            Nächsten anschreiben → <span className="opacity-70">{nextToWrite.company_name}</span>
          </a>
        ) : counts.bereit === 0 && counts.anzureichern > 0 ? (
          <span className="text-xs text-gray-500">Erst anreichern</span>
        ) : (
          <span className="text-xs text-emerald-300">✓ Alle bereiten angeschrieben</span>
        )}
      </div>

      {/* Liste */}
      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-600">Nichts in diesem Filter.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((p) => <ProspectCard key={p.id} prospect={p} onChange={replaceLead} mode="leads" />)}
        </div>
      )}
    </div>
  );
}
