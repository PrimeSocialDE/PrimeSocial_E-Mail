"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Result {
  ok?: boolean;
  error?: string;
  geprueft?: number;
  gesperrt?: number;
  namen?: string[];
}

export function CleanupButton() {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function starten() {
    setLaeuft(true);
    setResult(null);
    try {
      const res = await fetch("/api/stellensignale/cleanup", { method: "POST" });
      setResult((await res.json()) as Result);
      router.refresh();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div>
      <button
        onClick={starten}
        disabled={laeuft}
        className={
          laeuft
            ? "inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-500 cursor-not-allowed"
            : "inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/15 transition-colors"
        }
      >
        {laeuft ? (
          <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />Sortiere…</>
        ) : (
          "Konzerne & Personaldienstleister aussortieren"
        )}
      </button>

      {result?.error && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">{result.error}</div>
      )}

      {result?.ok && (
        <div className="mt-3 rounded-lg border border-white/5 bg-dark-950 px-4 py-3 text-sm">
          <div className="text-gray-300 font-medium mb-1">
            {result.gesperrt} von {result.geprueft} Firmen aussortiert (auf „gesperrt" gesetzt, nichts gelöscht).
          </div>
          {result.namen && result.namen.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
              {result.namen.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
