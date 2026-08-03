"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { clsx } from "clsx";
import type { ManualEmail, ManualContact, ManualResponseStatus } from "@/types/manual";
import { MANUAL_RESPONSE_STATUSES, MANUAL_RESPONSE_LABELS } from "@/types/manual";

function fmt(iso: string | null): string {
  if (!iso) return "–";
  return format(new Date(iso), "dd. MMM HH:mm", { locale: de });
}

const RESPONSE_COLORS: Record<ManualResponseStatus, string> = {
  no_response:    "text-gray-400",
  replied:        "text-brand-300",
  interested:     "text-emerald-400",
  not_interested: "text-red-400",
};

export function ManualAnalyticsClient({ initialEmails, contacts }: { initialEmails: ManualEmail[]; contacts: ManualContact[] }) {
  const [emails, setEmails] = useState(initialEmails);
  const [expanded, setExpanded] = useState<string | null>(null);

  const contactName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email;
      m.set(c.email, name);
    }
    return m;
  }, [contacts]);

  // Overall Open Rate = geöffnete / zugestellte (versendete) Mails.
  const sent = emails.filter((e) => e.sent_at);
  const opened = sent.filter((e) => e.opened_at);
  const openRate = sent.length > 0 ? Math.round((opened.length / sent.length) * 100) : 0;

  // Pro Empfänger verdichten.
  const byRecipient = useMemo(() => {
    const map = new Map<string, { email: string; total: number; opened: number; lastOpenedAt: string | null; openCount: number }>();
    for (const e of sent) {
      const r = map.get(e.recipient_email) ?? { email: e.recipient_email, total: 0, opened: 0, lastOpenedAt: null, openCount: 0 };
      r.total += 1;
      if (e.opened_at) {
        r.opened += 1;
        r.openCount += e.open_count ?? 0;
        if (!r.lastOpenedAt || new Date(e.opened_at) > new Date(r.lastOpenedAt)) r.lastOpenedAt = e.opened_at;
      }
      map.set(e.recipient_email, r);
    }
    return Array.from(map.values()).sort((a, b) => b.opened - a.opened);
  }, [sent]);

  async function setResponse(id: string, status: ManualResponseStatus) {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, response_status: status } : e)));
    await fetch(`/api/manual/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_status: status }),
    });
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-gray-600 font-medium">Open Rate</div>
          <div className={clsx("text-3xl font-heading font-bold mt-1", openRate > 30 ? "text-brand-400" : "text-white")}>{openRate}%</div>
          <div className="text-xs text-gray-600 mt-1">über alle versendeten Mails</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-gray-600 font-medium">Versendet</div>
          <div className="text-3xl font-heading font-bold mt-1 text-white">{sent.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-gray-600 font-medium">Geöffnet</div>
          <div className="text-3xl font-heading font-bold mt-1 text-white">{opened.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-gray-600 font-medium">Antworten</div>
          <div className="text-3xl font-heading font-bold mt-1 text-white">
            {emails.filter((e) => e.response_status !== "no_response").length}
          </div>
        </div>
      </div>

      {/* Pro Kontakt */}
      <div className="card p-5">
        <h2 className="font-semibold text-white text-sm mb-3">Öffnungen pro Kontakt</h2>
        {byRecipient.length === 0 ? (
          <p className="text-sm text-gray-600 py-6 text-center">Noch keine versendeten Mails.</p>
        ) : (
          <div className="space-y-1">
            {byRecipient.map((r) => (
              <div key={r.email} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02]">
                <div className="min-w-0">
                  <div className="text-sm text-gray-200 truncate">{contactName.get(r.email) ?? r.email}</div>
                  <div className="text-xs text-gray-600 truncate">{r.email}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  {r.opened > 0 ? (
                    <div className="text-xs text-emerald-400">
                      geöffnet {fmt(r.lastOpenedAt)}{r.openCount > 1 ? ` · ${r.openCount}×` : ""}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">nicht geöffnet</div>
                  )}
                  <div className="text-xs text-gray-700">{r.opened}/{r.total} Mails</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mail-Liste */}
      <div className="card p-5">
        <h2 className="font-semibold text-white text-sm mb-3">Alle Mails <span className="text-gray-600 font-normal">({emails.length})</span></h2>
        {emails.length === 0 ? (
          <p className="text-sm text-gray-600 py-6 text-center">Noch keine Mails.</p>
        ) : (
          <div className="space-y-2">
            {emails.map((e) => {
              const isOpen = expanded === e.id;
              return (
                <div key={e.id} className="border border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => setExpanded(isOpen ? null : e.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className={clsx("w-2 h-2 rounded-sm flex-shrink-0",
                          e.send_error ? "bg-red-500" :
                          e.sent_at ? (e.opened_at ? "bg-emerald-400" : "bg-brand-400") :
                          e.scheduled_for ? "bg-violet-400" : "bg-gray-600")} />
                        <span className="text-sm font-medium text-gray-200 truncate">{e.subject}</span>
                        {!e.sent_at && e.scheduled_for && !e.send_error && (
                          <span className="text-[10px] uppercase tracking-wider text-violet-300 bg-violet-500/15 rounded px-1.5 py-0.5 flex-shrink-0">geplant</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 truncate mt-0.5">
                        {contactName.get(e.recipient_email) ?? e.recipient_email} ·{" "}
                        {e.send_error ? `Fehler: ${e.send_error}` :
                         e.sent_at ? fmt(e.sent_at) :
                         e.scheduled_for ? `geplant für ${fmt(e.scheduled_for)}` : "nicht gesendet"}
                        {e.opened_at ? ` · geöffnet ${fmt(e.opened_at)}${e.open_count > 1 ? ` (${e.open_count}×)` : ""}` : e.sent_at ? " · nicht geöffnet" : ""}
                      </div>
                    </button>
                    <select
                      value={e.response_status}
                      onChange={(ev) => setResponse(e.id, ev.target.value as ManualResponseStatus)}
                      className={clsx("input !py-1 !px-2 text-xs flex-shrink-0", RESPONSE_COLORS[e.response_status])}
                    >
                      {MANUAL_RESPONSE_STATUSES.map((s) => (
                        <option key={s} value={s}>{MANUAL_RESPONSE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] space-y-2">
                      <div className="text-xs text-gray-500">Von {e.sender} an {e.recipient_email}</div>
                      <div className="text-xs text-gray-500">Betreff: <span className="text-gray-300">{e.subject}</span></div>
                      <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed bg-black/30 rounded-lg p-3">{e.body}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
