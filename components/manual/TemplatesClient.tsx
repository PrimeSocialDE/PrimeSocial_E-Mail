"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import type { ManualTemplate } from "@/types/manual";

// Hebt {{platzhalter}} im Text optisch hervor.
function HighlightedBody({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p)
          ? <span key={i} className="text-brand-300 bg-brand-500/10 rounded px-1">{p}</span>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

export function TemplatesClient({ initialTemplates }: { initialTemplates: ManualTemplate[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);

  // Generator-State
  const [examples, setExamples] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entwurf (nach Generierung oder manuell)
  const [draft, setDraft] = useState<{ name: string; subject: string; body: string; placeholders: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/manual/template/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examples }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generierung fehlgeschlagen");
      setDraft({ name: "", subject: data.subject ?? "", body: data.body ?? "", placeholders: data.placeholders ?? [] });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft || !draft.name.trim() || !draft.body.trim()) {
      setError("Name und Body sind Pflicht.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/manual/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          subject: draft.subject,
          body: draft.body,
          placeholders: draft.placeholders,
          source_examples: examples || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Speichern fehlgeschlagen");
      setTemplates((prev) => [data, ...prev]);
      setDraft(null);
      setExamples("");
      router.refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Template wirklich löschen?")) return;
    const res = await fetch(`/api/manual/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      router.refresh();
    }
  }

  function startBlank() {
    setDraft({ name: "", subject: "", body: "", placeholders: [] });
    setError(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Linke Spalte: Generator + Entwurf */}
      <div className="space-y-5">
        <div className="card p-5">
          <h2 className="font-semibold text-white text-sm mb-1">Template aus Beispielmails generieren</h2>
          <p className="text-xs text-gray-500 mb-3">1–3 Beispielmails einfügen. Claude extrahiert Struktur, Ton und erkennt Platzhalter.</p>
          <textarea
            value={examples}
            onChange={(e) => setExamples(e.target.value)}
            rows={8}
            placeholder="Beispielmail(s) hier einfügen…"
            className="input w-full font-mono text-xs leading-relaxed resize-y"
          />
          <div className="flex items-center gap-3 mt-3">
            <button onClick={handleGenerate} disabled={generating || examples.trim().length < 20} className="btn-primary disabled:opacity-40">
              {generating ? "Generiere…" : "Template generieren"}
            </button>
            <button onClick={startBlank} className="btn-ghost">Leer starten</button>
          </div>
        </div>

        {error && <div className="card p-3 border-red-500/30 text-red-400 text-xs">{error}</div>}

        {draft && (
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-white text-sm">Entwurf prüfen & speichern</h2>
            <div>
              <label className="text-xs text-gray-500">Name</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="z.B. Busunternehmen — Opener" className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Betreff</label>
              <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Body</label>
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={10} className="input w-full mt-1 font-mono text-xs leading-relaxed resize-y" />
            </div>
            {draft.placeholders.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.placeholders.map((p) => <span key={p} className="badge-brand">{`{{${p}}}`}</span>)}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-40">
                {saving ? "Speichere…" : "Template speichern"}
              </button>
              <button onClick={() => setDraft(null)} className="btn-ghost">Verwerfen</button>
            </div>
          </div>
        )}
      </div>

      {/* Rechte Spalte: gespeicherte Templates */}
      <div className="card p-5">
        <h2 className="font-semibold text-white text-sm mb-3">Gespeicherte Templates <span className="text-gray-600 font-normal">({templates.length})</span></h2>
        {templates.length === 0 ? (
          <p className="text-sm text-gray-600 py-8 text-center">Noch keine Templates.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <details key={t.id} className="group border border-white/[0.06] rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02]">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-200 text-sm truncate">{t.name}</div>
                    {t.subject && <div className="text-xs text-gray-600 truncate mt-0.5">{t.subject}</div>}
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(t.id); }}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 ml-3"
                  >
                    Löschen
                  </button>
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-white/[0.06]">
                  {t.placeholders?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {t.placeholders.map((p) => <span key={p} className="badge-brand">{`{{${p}}}`}</span>)}
                    </div>
                  )}
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                    <HighlightedBody text={t.body} />
                  </pre>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
