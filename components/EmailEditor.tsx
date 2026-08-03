"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import type { Lead, GeneratedEmail } from "@/types";
import { WORKFLOW_STEPS } from "@/types";

interface PdfContent {
  pdf_start: string;
  pdf_problem: string;
  pdf_lösung: string;
  detectedSegment?: string;
  reasoning?: string;
}

interface Props {
  lead: Lead;
}

export function EmailEditor({ lead }: Props) {
  const router = useRouter();
  const step = lead.workflow_step === 0 ? 1 : lead.workflow_step;
  const stepConfig = WORKFLOW_STEPS.find((s) => s.step === step);

  const [email, setEmail] = useState<GeneratedEmail | null>(null);
  const [pdfContent, setPdfContent] = useState<PdfContent | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState<"edit" | "preview">("edit");

  const needsPdf = stepConfig?.type === "claude_opener";

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setEmail(null);
    setPdfContent(null);
    setPdfUrl(null);

    try {
      const res = await fetch(`/api/leads/${lead.id}/generate-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setEmail({ subject: data.subject, body: data.body });
      setPdfContent(data.pdfContent ?? null);
      setLocalMode(data.localMode ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreatePdf() {
    if (!pdfContent) return;
    setCreatingPdf(true);
    setError(null);

    try {
      const res = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, pdfContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPdfUrl(data.pdfUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPdf(false);
    }
  }

  async function handleSend() {
    if (!email) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${lead.id}/send-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step,
          subject: email.subject,
          body: email.body,
          pdfUrl: pdfUrl ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="card p-6 flex items-center gap-3 text-brand-400">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium">
          {localMode ? "Lokal gespeichert (kein Brevo-Key)" : "E-Mail gesendet!"}
        </span>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <div className="font-semibold text-white">Step {step}: {stepConfig?.name ?? "–"}</div>
          <div className="text-xs text-gray-500 mt-0.5">{stepConfig?.description}</div>
        </div>
        {stepConfig && (
          <div className="text-xs text-gray-600 bg-white/5 rounded-full px-2.5 py-1">Tag {stepConfig.day}</div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {localMode && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-xs text-blue-400">
            Lokaler Modus — ANTHROPIC_API_KEY für KI-Texte eintragen.
          </div>
        )}

        {!email ? (
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            {generating ? (
              <><Spinner /><span>Generiere...</span></>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg><span>E-Mail generieren</span></>
            )}
          </button>
        ) : (
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
              {["edit", "preview"].map((t) => (
                <button key={t} onClick={() => setPreview(t as "edit" | "preview")}
                  className={clsx("px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
                    preview === t ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                  )}>
                  {t === "edit" ? "Bearbeiten" : "Vorschau"}
                </button>
              ))}
            </div>

            {preview === "edit" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">Betreff</label>
                  <input
                    value={email.subject}
                    onChange={(e) => setEmail({ ...email, subject: e.target.value })}
                    className="input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">E-Mail</label>
                  <textarea
                    value={email.body}
                    onChange={(e) => setEmail({ ...email, body: e.target.value })}
                    rows={14}
                    className="input mt-1 font-mono resize-y"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-dark-900 rounded-lg p-4 border border-white/5">
                <div className="text-xs text-gray-500 mb-1 font-medium">Betreff</div>
                <div className="text-gray-200 font-medium mb-4">{email.subject}</div>
                <div className="text-xs text-gray-500 mb-1 font-medium">Body</div>
                <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{email.body}</pre>
              </div>
            )}

            {pdfContent && (
              <div className="bg-dark-900 rounded-lg p-4 border border-white/5 space-y-2">
                <div className="text-xs font-medium text-gray-400 mb-2">
                  PDF-Inhalt
                  {pdfContent.detectedSegment && (
                    <span className="ml-2 text-brand-400">→ {pdfContent.detectedSegment}</span>
                  )}
                </div>
                <div className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                  {pdfContent.pdf_start}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              {needsPdf && !pdfUrl && (
                <>
                  <button onClick={handleCreatePdf} disabled={creatingPdf || !pdfContent} className="btn-secondary">
                    {creatingPdf ? <><Spinner /><span>PDF…</span></> : (
                      <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg><span>PDF erstellen</span></>
                    )}
                  </button>
                  {!pdfContent && (
                    <button onClick={() => setPdfUrl("skipped")} className="text-xs text-gray-600 hover:text-gray-400 underline">
                      PDF überspringen
                    </button>
                  )}
                </>
              )}

              {pdfUrl && pdfUrl !== "skipped" && (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  PDF bereit
                </a>
              )}

              <button
                onClick={handleSend}
                disabled={sending || (needsPdf && !pdfUrl)}
                className="btn-primary"
              >
                {sending ? <><Spinner /><span>Senden…</span></> : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg><span>{localMode ? "Lokal speichern" : "Senden"}</span></>
                )}
              </button>

              <button onClick={handleGenerate} disabled={generating} className="btn-ghost text-xs">
                Neu generieren
              </button>
            </div>

            {needsPdf && !pdfUrl && pdfContent && (
              <p className="text-xs text-yellow-500/70">PDF wird für Step 1 benötigt oder überspringen.</p>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
