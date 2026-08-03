"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  leadId: string;
  hasPitch: boolean;
  pitchStatus: string | null;
  publicUrl: string | null;
  excluded: boolean;
}

export function PitchManagementControls({ leadId, hasPitch, pitchStatus, publicUrl, excluded }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(endpoint: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      start(() => router.refresh());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (excluded) {
    return (
      <div className="card p-6 space-y-2">
        <h2 className="text-lg font-semibold">Kein Pitch für dieses Segment</h2>
        <p className="text-sm text-gray-400">
          Leads mit Segment <code className="text-brand-300">KEININSTAGRAM</code>,{" "}
          <code className="text-brand-300">KEINFIT</code> oder <code className="text-brand-300">SOLIDE</code> bekommen
          keine Pitch-Seite. Ändere das Segment des Leads, falls eine Pitch-Seite nötig ist.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Pitch-Seite</h2>
          <p className="text-sm text-gray-400 mt-1">
            {hasPitch ? (
              <>
                Status: <span className="badge-brand">{pitchStatus}</span>
                {publicUrl ? (
                  <>
                    {" · "}
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:underline">
                      {publicUrl}
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              <>Noch keine Pitch-Seite vorhanden.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => call(`/api/leads/${leadId}/pitch/generate`, "generate")}
            disabled={busy !== null || pending}
            className="btn-secondary"
          >
            {busy === "generate" ? "Generiere..." : hasPitch ? "Regenerieren" : "Generieren"}
          </button>
          {hasPitch ? (
            <>
              <button
                onClick={() => call(`/api/leads/${leadId}/pitch/publish`, "publish")}
                disabled={busy !== null || pending || pitchStatus === "published"}
                className="btn-primary"
              >
                {busy === "publish" ? "Veröffentliche..." : pitchStatus === "published" ? "Veröffentlicht" : "Veröffentlichen"}
              </button>
              {publicUrl ? (
                <button onClick={copyLink} className="btn-ghost">
                  {copied ? "Kopiert!" : "Link kopieren"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
