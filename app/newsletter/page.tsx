"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Newsletter } from "@/types";

export default function NewsletterPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<Newsletter | null>(null);

  const [form, setForm] = useState({ brief: "", mode: "ai" as "ai" | "manual", subject: "", body_html: "", body_text: "" });

  useEffect(() => {
    fetch("/api/newsletter")
      .then((r) => r.json())
      .then((data) => {
        setNewsletters(data.newsletters ?? []);
        setSubscriberCount(data.subscriberCount ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const body = form.mode === "ai"
        ? { brief: form.brief }
        : { subject: form.subject, body_html: form.body_html, body_text: form.body_text };

      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewsletters((prev) => [data, ...prev]);
      setSuccess("Newsletter erstellt!");
      setForm({ brief: "", mode: "ai", subject: "", body_html: "", body_text: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(nl: Newsletter) {
    if (!confirm(`Wirklich an ${subscriberCount} Abonnenten senden?`)) return;
    setSending(nl.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/newsletter/${nl.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewsletters((prev) => prev.map((n) => n.id === nl.id ? data.newsletter : n));
      setSuccess(`Newsletter an ${data.sent} Abonnenten gesendet!`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">Newsletter</h1>
          <p className="text-gray-500 text-sm mt-1">
            {subscriberCount} Abonnenten · Leads aus abgeschlossenen Sequenzen
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-brand-500/10 border border-brand-500/20 rounded-lg p-3 text-sm text-brand-400">{success}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Erstellen */}
        <div className="lg:col-span-1 card p-5">
          <h2 className="font-semibold text-white mb-4">Neuer Newsletter</h2>

          {/* Mode Toggle */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-4">
            <button onClick={() => setForm((f) => ({ ...f, mode: "ai" }))}
              className={clsx("flex-1 py-1.5 text-xs rounded-md font-medium transition-colors",
                form.mode === "ai" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300")}>
              Claude schreibt
            </button>
            <button onClick={() => setForm((f) => ({ ...f, mode: "manual" }))}
              className={clsx("flex-1 py-1.5 text-xs rounded-md font-medium transition-colors",
                form.mode === "manual" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300")}>
              Manuell
            </button>
          </div>

          <div className="space-y-3">
            {form.mode === "ai" ? (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">
                  Briefing für Claude
                </label>
                <textarea
                  value={form.brief}
                  onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
                  rows={6}
                  placeholder="z.B. Thema: 3 Fehler die Unternehmen auf Instagram machen. Ton: locker. Fokus auf Video-Content."
                  className="input resize-y"
                />
                <p className="text-xs text-gray-600 mt-1">Claude erstellt Betreff, Text und HTML-Design automatisch.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Betreff</label>
                  <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">Plain Text</label>
                  <textarea value={form.body_text} onChange={(e) => setForm((f) => ({ ...f, body_text: e.target.value }))} rows={4} className="input resize-y" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-1">HTML Body</label>
                  <textarea value={form.body_html} onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))} rows={4} className="input resize-y font-mono text-xs" />
                </div>
              </>
            )}

            <button
              onClick={handleCreate}
              disabled={creating || (form.mode === "ai" ? !form.brief.trim() : !form.subject.trim() || !form.body_html.trim())}
              className="btn-primary w-full">
              {creating ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generiere...</>
              ) : "Newsletter erstellen"}
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="card p-10 text-center text-gray-500 text-sm">Lade...</div>
          ) : newsletters.length === 0 ? (
            <div className="card p-10 text-center text-gray-500 text-sm">Noch keine Newsletter erstellt.</div>
          ) : (
            newsletters.map((nl) => (
              <div key={nl.id} className="card overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        nl.status === "sent" ? "bg-brand-500/20 text-brand-400" :
                        nl.status === "sending" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-white/10 text-gray-400"
                      )}>
                        {nl.status === "sent" ? `Gesendet (${nl.recipient_count})` :
                         nl.status === "sending" ? "Wird gesendet..." : "Entwurf"}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-200 truncate">{nl.subject}</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Erstellt: {format(new Date(nl.created_at), "dd. MMM yyyy HH:mm", { locale: de })}
                      {nl.sent_at && ` · Gesendet: ${format(new Date(nl.sent_at), "dd. MMM yyyy HH:mm", { locale: de })}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setPreview(preview?.id === nl.id ? null : nl)}
                      className="btn-ghost text-xs py-1">
                      {preview?.id === nl.id ? "Schließen" : "Vorschau"}
                    </button>
                    {nl.status === "draft" && (
                      <button
                        onClick={() => handleSend(nl)}
                        disabled={sending === nl.id || subscriberCount === 0}
                        className="btn-primary text-xs">
                        {sending === nl.id ? "Sende..." : `Senden (${subscriberCount})`}
                      </button>
                    )}
                  </div>
                </div>
                {preview?.id === nl.id && (
                  <div className="border-t border-white/5 p-4">
                    <iframe
                      srcDoc={nl.body_html}
                      className="w-full h-96 bg-white rounded-lg border border-white/10"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
