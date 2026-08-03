"use client";

import { useState } from "react";
import { clsx } from "clsx";

interface CronResult {
  success: boolean;
  log?: string[];
  sent?: number;
  error?: string;
  timestamp?: string;
}

export function CronButtonClient() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CronResult | null>(null);
  const [showLog, setShowLog] = useState(false);

  async function handleRun() {
    setLoading(true);
    setResult(null);
    setShowLog(false);
    try {
      const res = await fetch("/api/cron/trigger", { method: "POST" });
      const data = await res.json();
      setResult(data);
      setShowLog(true);
    } catch (e) {
      setResult({ success: false, error: String(e) });
      setShowLog(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleRun}
        disabled={loading}
        className={clsx("btn-ghost text-xs", loading && "opacity-60 pointer-events-none")}
      >
        {loading ? (
          <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
        {loading ? "Verarbeite..." : "Jetzt verarbeiten"}
      </button>

      {result && showLog && (
        <div className="absolute right-0 top-full mt-2 z-50 w-96 max-w-[90vw]">
          <div className="card border border-white/10 shadow-2xl">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx("w-2 h-2 rounded-full", result.success ? "bg-green-400" : "bg-red-400")} />
                <span className="text-xs font-medium text-gray-300">
                  {result.success ? "Erfolgreich" : "Fehler"}
                </span>
                {result.sent != null && (
                  <span className="text-xs text-gray-600">{result.sent} gesendet</span>
                )}
              </div>
              <button onClick={() => setShowLog(false)} className="text-gray-600 hover:text-gray-300 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {result.log && result.log.length > 0 && (
              <div className="px-4 py-3 max-h-64 overflow-y-auto">
                <div className="space-y-1">
                  {result.log.map((line, i) => (
                    <div key={i} className="text-xs text-gray-400 font-mono leading-relaxed">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.error && !result.log && (
              <div className="px-4 py-3 text-xs text-red-400">{result.error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
