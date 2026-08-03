"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { ResearchProspect, EmployeeBucket } from "@/types/research";
import { EMPLOYEE_BUCKET_LABELS, isLargeBucket } from "@/types/research";
import { buildHandoffUrl } from "@/components/research/handoff";

function bucketLabel(b: string | null): string | null {
  if (!b) return null;
  return EMPLOYEE_BUCKET_LABELS[b as EmployeeBucket] ?? b;
}

function VerifyBadge({ status }: { status: ResearchProspect["email_verify_status"] }) {
  if (!status || status === "unknown") return <span className="text-gray-600">· unverifiziert</span>;
  const map: Record<string, string> = { deliverable: "text-emerald-400", risky: "text-yellow-400", undeliverable: "text-red-400" };
  const label: Record<string, string> = { deliverable: "zustellbar", risky: "risky", undeliverable: "nicht zustellbar" };
  return <span className={clsx(map[status] ?? "text-gray-600")}>· {label[status] ?? status}</span>;
}

export function ProspectCard({
  prospect, onChange, mode,
}: {
  prospect: ResearchProspect;
  onChange: (p: ResearchProspect) => void;
  mode: "suche" | "leads";
}) {
  const p = prospect;
  const [busy, setBusy] = useState<null | "process" | "reject" | "ig" | "save">(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/research/prospects/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Aktualisierung fehlgeschlagen");
    return data.prospect as ResearchProspect;
  }

  async function action(kind: "process" | "ig", url: string) {
    setBusy(kind); setErr(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aktion fehlgeschlagen");
      onChange(data.prospect);
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); }
  }

  async function setFlag(kind: "save" | "reject", body: Record<string, unknown>) {
    setBusy(kind); setErr(null);
    try { onChange(await patch(body)); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(null); }
  }

  const scoreColor = (p.score ?? 0) >= 70 ? "text-emerald-400" : (p.score ?? 0) >= 45 ? "text-yellow-400" : "text-gray-500";
  const large = isLargeBucket(p.employee_bucket);
  const maText = bucketLabel(p.employee_bucket);
  const needsEnrich = p.status === "scored"; // gespeichert, aber noch nicht angereichert

  return (
    <div className={clsx("card p-4 space-y-3",
      p.status === "rejected" && "opacity-60",
      mode === "suche" && p.status === "handed_off" && "ring-1 ring-sky-500/30",
      mode === "suche" && p.shortlisted && p.status !== "handed_off" && "ring-1 ring-emerald-500/30",
    )}>
      {/* Kopf: Name + Score */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white truncate">{p.company_name}</h3>
            {p.already_known_in && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300">bekannt</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span title={p.address ?? undefined} className="text-gray-400">📍 {p.city ?? "?"}{p.bundesland ? `, ${p.bundesland}` : ""}</span>
            {p.branche_final && <span>· {p.branche_final}</span>}
            {maText && (
              <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-medium",
                large ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-gray-400")}>
                {maText}{large ? " ✓" : ""}
              </span>
            )}
            {typeof p.rating === "number" && <span className="text-gray-600">★ {p.rating} ({p.reviews_count ?? 0})</span>}
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer"
                className="text-brand-400 hover:underline inline-flex items-center gap-0.5">
                Website ↗
              </a>
            )}
          </div>
        </div>
        {typeof p.score === "number" && <div className={clsx("text-lg font-bold tabular-nums flex-shrink-0", scoreColor)}>{p.score}</div>}
      </div>

      {/* Leads-Modus: angereicherte Kontaktdaten + Dossier */}
      {mode === "leads" && (
        <>
          <div className="text-xs text-gray-400 space-y-0.5">
            {p.gf_name && <div>👤 GF: {p.gf_name}</div>}
            {p.marketing_email && <div className="truncate">📧 Marketing: {p.marketing_email}</div>}
            {p.gf_email && <div className="truncate">📧 GF: {p.gf_email}</div>}
            {p.general_email && <div className="truncate">📧 Allgemein: {p.general_email}</div>}
            {!needsEnrich && !p.marketing_email && !p.gf_email && (
              <div className="text-yellow-400/80">⚠ Keine GF-/Marketing-Mail gefunden{p.general_email ? " — nur allgemeine Mail" : ""}</div>
            )}
            {p.best_email
              ? <div className="truncate text-gray-300">✉️ Versand an: {p.best_email} <VerifyBadge status={p.email_verify_status} /></div>
              : !needsEnrich && <div className="text-gray-600">✉️ keine E-Mail gefunden</div>}
            {p.phone && <div>📞 {p.phone}</div>}
            {p.instagram_handle && (
              <div>
                <a href={`https://instagram.com/${p.instagram_handle}`} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">@{p.instagram_handle}</a>
              </div>
            )}
          </div>

          {p.ig_weaknesses && p.ig_weaknesses.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.ig_weaknesses.map((w, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300/90">{w.label}</span>
              ))}
            </div>
          )}

          {p.hook && (
            <div className="text-xs text-gray-300 bg-white/[0.03] border-l-2 border-brand-500/40 pl-3 py-1.5 rounded-r">
              &bdquo;{p.hook}&ldquo;
            </div>
          )}
        </>
      )}

      {p.reject_reason && p.status === "rejected" && <div className="text-xs text-gray-500">{p.reject_reason}</div>}
      {err && <div className="text-xs text-red-400">{err}</div>}

      {/* Aktionen */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {mode === "suche" && (
          <>
            {p.status === "handed_off" ? (
              <span className="text-xs text-sky-300">✓ Angeschrieben</span>
            ) : p.shortlisted ? (
              <span className="text-xs text-emerald-300">✓ Als Lead gespeichert</span>
            ) : (
              <button onClick={() => setFlag("save", { shortlisted: true })} disabled={busy !== null}
                className="btn-primary text-xs disabled:opacity-40">
                {busy === "save" ? "Speichere…" : "Speichern → Leads"}
              </button>
            )}
            {!p.shortlisted && p.status !== "handed_off" && p.status !== "rejected" && (
              <button onClick={() => setFlag("reject", { status: "rejected" })} disabled={busy !== null}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40 ml-auto">
                Verwerfen
              </button>
            )}
          </>
        )}

        {mode === "leads" && (
          <>
            {needsEnrich
              ? <button onClick={() => action("process", `/api/research/prospects/${p.id}/process`)} disabled={busy !== null}
                  className="btn-primary text-xs disabled:opacity-40">
                  {busy === "process" ? "Reichere an…" : "Anreichern"}
                </button>
              : p.status !== "rejected" && (
                <a href={buildHandoffUrl(p)} className="btn-primary text-xs">
                  {p.status === "handed_off" ? "Erneut schreiben →" : "Ins Schreiben →"}
                </a>
              )}
            {!needsEnrich && !p.instagram_checked && (
              <button onClick={() => action("ig", `/api/research/prospects/${p.id}/instagram`)} disabled={busy !== null}
                className="btn-ghost text-xs disabled:opacity-40">
                {busy === "ig" ? "Prüfe Instagram…" : "Instagram prüfen"}
              </button>
            )}
            {!needsEnrich && p.instagram_checked && (
              p.instagram_handle
                ? <a href={`https://instagram.com/${p.instagram_handle}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:underline">📷 @{p.instagram_handle} ↗</a>
                : <span className="text-[11px] text-gray-600">Kein IG-Account gefunden</span>
            )}
            <button onClick={() => setFlag("save", { shortlisted: false })} disabled={busy !== null}
              className="text-xs text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-40 ml-auto">
              Aus Leads entfernen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
