"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Result {
  ok?: boolean;
  error?: string;
  aktiv?: boolean;
  queriesAusgefuehrt?: number;
  trefferGesamt?: number;
  verworfen?: number;
  neueFirmen?: number;
  websitesNachgetragen?: number;
  proben?: string[];
  fehler?: string[];
}

export function MapsRunButton() {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function starten() {
    setLaeuft(true);
    setResult(null);
    try {
      const res = await fetch("/api/stellensignale/maps/run", { method: "POST" });
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
            : "inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-dark-900 hover:bg-brand-400 transition-colors"
        }
      >
        {laeuft ? (
          <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />Suche Firmen…</>
        ) : (
          "Firmen finden (Google Maps)"
        )}
      </button>

      {result?.error && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">{result.error}</div>
      )}

      {result?.ok && (
        <div className="mt-3 rounded-lg border border-white/5 bg-dark-950 px-4 py-3 text-sm">
          <div className="text-gray-300 font-medium mb-1">
            {result.neueFirmen} neue Firmen · {result.trefferGesamt} Treffer · {result.verworfen} aussortiert
            {result.websitesNachgetragen ? ` · ${result.websitesNachgetragen} Websites nachgetragen` : ""}
          </div>
          {result.aktiv === false && (
            <div className="text-amber-400/80 text-xs">
              Maps ist aus. In Vercel <span className="text-gray-400">STELLENSIGNALE_MAPS=true</span> setzen und neu deployen.
            </div>
          )}
          {result.proben && result.proben.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
              {result.proben.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          )}
          {result.fehler && result.fehler.length > 0 && (
            <div className="mt-2 text-xs text-amber-400/80">{result.fehler.slice(0, 3).join(" · ")}</div>
          )}
        </div>
      )}
    </div>
  );
}
