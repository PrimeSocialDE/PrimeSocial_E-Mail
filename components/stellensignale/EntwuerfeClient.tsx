"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StellenEntwurfMitFirma, EntwurfStatus } from "@/types/stellensignale";

const STATUS_BADGE: Record<EntwurfStatus, string> = {
  entwurf: "bg-white/5 text-gray-400",
  freigegeben: "bg-emerald-500/15 text-emerald-400",
  verworfen: "bg-red-500/10 text-red-400",
  gesendet: "bg-brand-500/15 text-brand-400",
};

export function EntwuerfeClient({ initial }: { initial: StellenEntwurfMitFirma[] }) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function erzeugen() {
    setLaeuft(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/stellensignale/entwuerfe/run", { method: "POST" });
      const d = await res.json();
      if (d.error) setMeldung(`Fehler: ${d.error}`);
      else setMeldung(`${d.erzeugt} Entwürfe erzeugt (${d.geprueft} geprüft).`);
      router.refresh();
    } catch (e) {
      setMeldung(`Fehler: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLaeuft(false);
    }
  }

  async function setStatus(id: string, status: EntwurfStatus) {
    setBusyId(id);
    try {
      await fetch("/api/stellensignale/entwuerfe/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button
          onClick={erzeugen}
          disabled={laeuft}
          className={
            laeuft
              ? "inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-500 cursor-not-allowed"
              : "inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-dark-900 hover:bg-brand-400 transition-colors"
          }
        >
          {laeuft ? (
            <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />Erzeuge…</>
          ) : (
            "Entwürfe erzeugen (nächster Batch)"
          )}
        </button>
        {meldung && <span className="text-sm text-gray-400">{meldung}</span>}
      </div>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-dark-950 px-6 py-12 text-center">
          <p className="text-gray-400 font-medium">Noch keine Entwürfe.</p>
          <p className="text-gray-600 text-sm mt-1">
            „Entwürfe erzeugen" schreibt für Firmen mit heißer Stelle + E-Mail je einen Entwurf vor.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map((e) => (
            <div key={e.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="text-gray-200 font-medium">{e.firma}</div>
                  <div className="text-xs text-gray-600">
                    {e.gewerk ?? "—"}{e.ort ? ` · ${e.ort}` : ""}
                    {e.email ? ` · ${e.email}` : " · keine E-Mail"}
                    {e.email_confidence != null ? ` (${e.email_confidence}%)` : ""}
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status]}`}>
                  {e.status}
                </span>
              </div>

              <div className="text-sm text-gray-300 font-medium mb-1">Betreff: {e.betreff}</div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-400 bg-black/20 rounded-lg p-3 border border-white/5">{e.text}</pre>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setStatus(e.id, "freigegeben")}
                  disabled={busyId === e.id || e.status === "freigegeben"}
                  className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors"
                >
                  Freigeben
                </button>
                <button
                  onClick={() => setStatus(e.id, "verworfen")}
                  disabled={busyId === e.id || e.status === "verworfen"}
                  className="rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-white/10 disabled:opacity-40 transition-colors"
                >
                  Verwerfen
                </button>
                <span className="text-xs text-gray-700 ml-1">Versand folgt separat — hier nur Freigabe.</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
