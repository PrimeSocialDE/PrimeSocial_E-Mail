"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Probe { firma: string; website: string | null; ergebnis: string }
interface Result {
  ok?: boolean;
  error?: string;
  kandidaten?: number;
  geprueft?: number;
  gefunden?: number;
  perPattern?: number;
  proben?: Probe[];
  fehler?: string[];
}

export function EmailRunButton() {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function starten() {
    setLaeuft(true);
    setResult(null);
    try {
      const res = await fetch("/api/stellensignale/emails/run", { method: "POST" });
      const d = (await res.json()) as Result;
      setResult(d);
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
          <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />Suche…</>
        ) : (
          "E-Mails suchen (nur Impressum, schnell)"
        )}
      </button>

      {result?.error && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {result.error}
        </div>
      )}

      {result?.ok && (
        <div className="mt-3 rounded-lg border border-white/5 bg-dark-950 px-4 py-3 text-sm">
          <div className="text-gray-300 font-medium mb-1">
            {result.gefunden}/{result.geprueft} E-Mails gefunden ·{" "}
            {result.kandidaten} Firmen mit Website ohne Mail insgesamt
          </div>
          {result.kandidaten === 0 && (
            <div className="text-amber-400/80 text-xs">
              Keine Firma mit Website ohne Mail. Erst „Jetzt testen" (Crawl) laufen lassen, damit Firmen Websites bekommen.
            </div>
          )}
          {result.proben && result.proben.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
              {result.proben.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-gray-400">{p.firma}</span>
                  <span className="text-gray-700">{p.website ?? "—"}</span>
                  <span className={p.ergebnis.startsWith("keine") || p.ergebnis.startsWith("FEHLER") ? "text-amber-400/70" : "text-emerald-400/80"}>
                    → {p.ergebnis}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
