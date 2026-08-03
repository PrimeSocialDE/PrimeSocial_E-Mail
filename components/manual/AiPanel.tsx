"use client";

import { useState } from "react";
import { clsx } from "clsx";

interface ChatTurn { role: "user" | "assistant"; content: string }

// AI-Assistent für die Schreiben-Seite.
// Tab "Tipps": datengetriebene Hinweise, schreibt NICHT.
// Tab "Chat": darf den Entwurf aktiv umschreiben → onApply schreibt zurück.
export function AiPanel({
  draft,
  onApply,
}: {
  draft: { subject: string; body: string };
  onApply: (next: { subject?: string; body?: string }) => void;
}) {
  const [tab, setTab] = useState<"tipps" | "chat">("tipps");

  // Tipps
  const [tips, setTips] = useState<string[] | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  // Chat
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pending, setPending] = useState<{ subject?: string; body?: string } | null>(null);

  async function runTips() {
    setTipsLoading(true);
    setTipsError(null);
    try {
      const res = await fetch("/api/manual/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, body: draft.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prüfung fehlgeschlagen");
      setTips(data.tips ?? []);
    } catch (e) {
      setTipsError(String(e instanceof Error ? e.message : e));
    } finally {
      setTipsLoading(false);
    }
  }

  async function sendChat() {
    if (!input.trim()) return;
    const newHistory: ChatTurn[] = [...history, { role: "user", content: input.trim() }];
    setHistory(newHistory);
    setInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/manual/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: newHistory, draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat fehlgeschlagen");
      setHistory((prev) => [...prev, { role: "assistant", content: data.reply ?? "" }]);
      if (data.subject !== undefined || data.body !== undefined) {
        setPending({ subject: data.subject, body: data.body });
      }
    } catch (e) {
      setHistory((prev) => [...prev, { role: "assistant", content: `Fehler: ${String(e instanceof Error ? e.message : e)}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex gap-2 mb-3">
        <button onClick={() => setTab("tipps")}
          className={clsx("badge-brand cursor-pointer", tab !== "tipps" && "opacity-40")}>Tipps</button>
        <button onClick={() => setTab("chat")}
          className={clsx("badge-brand cursor-pointer", tab !== "chat" && "opacity-40")}>Chat</button>
      </div>

      {tab === "tipps" && (
        <div>
          <p className="text-xs text-gray-600 mb-2">Datengetriebene Hinweise auf Basis deiner letzten Mails. Schreibt nichts um.</p>
          <button onClick={runTips} disabled={tipsLoading || !draft.body.trim()} className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40">
            {tipsLoading ? "Prüfe…" : "Mail prüfen"}
          </button>
          {tipsError && <div className="text-red-400 text-xs mt-2">{tipsError}</div>}
          {tips && (
            <ul className="mt-3 space-y-2">
              {tips.length === 0 && <li className="text-xs text-gray-500">Keine Auffälligkeiten.</li>}
              {tips.map((t, i) => (
                <li key={i} className="text-xs text-gray-300 flex gap-2">
                  <span className="text-brand-400 flex-shrink-0">•</span><span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "chat" && (
        <div>
          <p className="text-xs text-gray-600 mb-2">Bitte Claude, die Mail anzupassen (z.B. „mach das für einen Sanitär-Handwerksbetrieb").</p>
          <div className="space-y-2 max-h-64 overflow-y-auto mb-2">
            {history.map((t, i) => (
              <div key={i} className={clsx("text-xs rounded-lg px-3 py-2",
                t.role === "user" ? "bg-brand-500/10 text-gray-200" : "bg-white/[0.03] text-gray-300")}>
                {t.content}
              </div>
            ))}
            {chatLoading && <div className="text-xs text-gray-600 px-3">Claude denkt nach…</div>}
          </div>

          {pending && (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-2 mb-2">
              <div className="text-xs text-brand-300 mb-1">Neue Version vorgeschlagen.</div>
              <div className="flex gap-2">
                <button onClick={() => { onApply(pending); setPending(null); }} className="btn-primary !py-1 !px-3 text-xs">Übernehmen</button>
                <button onClick={() => setPending(null)} className="btn-ghost !py-1 !px-2 text-xs">Verwerfen</button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !chatLoading) sendChat(); }}
              placeholder="Nachricht an Claude…" className="input w-full !py-1.5 text-xs" />
            <button onClick={sendChat} disabled={chatLoading || !input.trim()} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  );
}
