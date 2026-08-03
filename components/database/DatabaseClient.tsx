"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { Company } from "@/types/company";

// Daten-Score: wie viel % der Kernfelder wir zu diesem Unternehmen haben.
const SCORE_FIELDS: (keyof Company)[] = [
  "company_name", "website", "stadt", "bundesland", "branche", "employee_bucket",
  "gf_name", "gf_email", "marketing_email", "general_email", "phone", "instagram_handle",
];
function dataScore(c: Company): number {
  const filled = SCORE_FIELDS.filter((f) => {
    const v = c[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((filled / SCORE_FIELDS.length) * 100);
}
function scoreColor(p: number): string {
  return p >= 70 ? "text-emerald-400" : p >= 40 ? "text-yellow-400" : "text-gray-500";
}

function cell(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function DatabaseClient({ initialCompanies, total }: { initialCompanies: Company[]; total: number }) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [totalCount, setTotalCount] = useState(total);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/companies?search=${encodeURIComponent(search.trim())}&limit=500`).then((x) => x.json());
        if (r.companies) setCompanies(r.companies);
        if (typeof r.total === "number") setTotalCount(r.total);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const COLS: { key: string; label: string; min: string }[] = [
    { key: "score", label: "Daten", min: "min-w-[64px]" },
    { key: "stadt", label: "Stadt", min: "min-w-[120px]" },
    { key: "bundesland", label: "Bundesland", min: "min-w-[130px]" },
    { key: "branche", label: "Branche", min: "min-w-[150px]" },
    { key: "employee_bucket", label: "Größe", min: "min-w-[90px]" },
    { key: "gf_name", label: "GF / Inhaber", min: "min-w-[150px]" },
    { key: "gf_email", label: "GF-Mail", min: "min-w-[200px]" },
    { key: "marketing_email", label: "Marketing-Mail", min: "min-w-[200px]" },
    { key: "general_email", label: "Allgemeine Mail", min: "min-w-[200px]" },
    { key: "phone", label: "Telefon", min: "min-w-[140px]" },
    { key: "instagram", label: "Instagram", min: "min-w-[150px]" },
    { key: "rating", label: "Bewertung", min: "min-w-[110px]" },
    { key: "sources", label: "Quellen", min: "min-w-[130px]" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen: Name, Domain, Stadt, Branche, GF, Instagram…"
          className="input flex-1 min-w-[260px]" />
        <span className="text-xs text-gray-500">
          {loading ? "Suche…" : `${companies.length} angezeigt · ${totalCount} gesamt`}
        </span>
      </div>

      {companies.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-600">
          {search ? "Keine Treffer." : "Noch keine Unternehmen."}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-600 border-b border-white/[0.06]">
                <th className="text-left font-medium px-3 py-2 sticky left-0 bg-dark-900 min-w-[220px] z-10">Unternehmen</th>
                {COLS.map((col) => (
                  <th key={col.key} className={clsx("text-left font-medium px-3 py-2 whitespace-nowrap", col.min)}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const open = openId === c.id;
                const score = dataScore(c);
                return (
                  <tr key={c.id} onClick={() => setOpenId(open ? null : c.id)}
                    className={clsx("border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors", open && "bg-white/[0.03]")}>
                    {/* Unternehmen — sticky */}
                    <td className="px-3 py-2 sticky left-0 bg-dark-900 min-w-[220px]">
                      <div className="text-white truncate max-w-[260px]">{c.company_name ?? c.domain ?? "—"}</div>
                      {c.domain && <div className="text-[11px] text-gray-600 truncate max-w-[260px]">{c.domain}</div>}
                    </td>
                    {/* Daten-Score */}
                    <td className="px-3 py-2"><span className={clsx("font-semibold tabular-nums", scoreColor(score))}>{score}%</span></td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.stadt)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.bundesland)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.branche)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.employee_bucket && c.employee_bucket !== "unknown" ? c.employee_bucket : "—"}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.gf_name)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.gf_email)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.marketing_email)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.general_email)}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{cell(c.phone)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {c.instagram_handle
                        ? <a href={`https://instagram.com/${c.instagram_handle}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-400 hover:underline">@{c.instagram_handle}</a>
                        : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{typeof c.rating === "number" ? `★ ${c.rating} (${c.reviews_count ?? 0})` : "—"}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{(c.sources ?? []).join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail-Panel des ausgewählten Unternehmens (alle Mails + Zeitstempel) */}
      {openId && (() => {
        const c = companies.find((x) => x.id === openId);
        if (!c) return null;
        return (
          <div className="card p-4 text-xs text-gray-400 space-y-2">
            <div className="text-sm text-white font-semibold">{c.company_name ?? c.domain}</div>
            {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{c.website}</a>}
            {c.emails && c.emails.length > 0 && (
              <div><span className="text-gray-600">Alle gesammelten Mails ({c.emails.length}): </span><span className="text-gray-300">{c.emails.join(", ")}</span></div>
            )}
            {c.notes && <div><span className="text-gray-600">Notizen: </span>{c.notes}</div>}
            <div className="text-gray-600">
              Quellen: {(c.sources ?? []).join(", ") || "—"} · zuletzt angereichert:{" "}
              {c.last_enriched_at ? new Date(c.last_enriched_at).toLocaleString("de-DE") : "—"}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
