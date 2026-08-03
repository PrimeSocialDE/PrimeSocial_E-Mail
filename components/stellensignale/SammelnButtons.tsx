"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bedienfeld für die Sammel-Läufe. Jede Phase einzeln auslösbar, damit man
 * gezielt nachlegen kann statt immer alles laufen zu lassen.
 *
 * Alle Läufe sind kostenlos (nur HTTP), erzeugen KEINE Entwürfe und
 * versenden nichts.
 */
const PHASEN = [
  { id: "osm",      label: "Firmen finden",     hilfe: "OpenStreetMap — Betriebe der Region, unabhängig von Stellenanzeigen" },
  { id: "stellen",  label: "Stellen suchen",    hilfe: "Arbeitsagentur — wer gerade eine Fachkraft sucht" },
  { id: "karriere", label: "Karriereseiten",    hilfe: "Eigene Websites bekannter Firmen — unabhängige Zweitquelle" },
  { id: "websites", label: "Websites ermitteln", hilfe: "Domain aus dem Firmennamen, mit Prüfung gegen den Seiteninhalt" },
  { id: "emails",   label: "E-Mails finden",    hilfe: "Impressum auswerten" },
  { id: "alles",    label: "Alles nacheinander", hilfe: "Alle Phasen mit Zeitbudget — dauert bis zu vier Minuten" },
];

export function SammelnButtons({ zentren }: { zentren: number }) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  async function starten(phase: string) {
    setLaeuft(phase);
    setErgebnis(null);
    try {
      const q = phase === "osm" || phase === "alles" ? `&orte=6&offset=${offset}` : "";
      const res = await fetch(`/api/stellensignale/sammeln?phase=${phase}${q}`, { method: "POST" });
      const d = await res.json();
      setErgebnis(JSON.stringify(d, null, 2));
      if (phase === "osm" || phase === "alles") setOffset((o) => (o + 6) % Math.max(1, zentren));
      router.refresh();
    } catch (e) {
      setErgebnis(String(e instanceof Error ? e.message : e));
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-300">Sammeln</h2>
        <p className="text-[11px] text-gray-600 mt-0.5">
          Kostenlos — nur HTTP-Abrufe. Erzeugt keine Entwürfe und versendet nichts.
          Firmen werden über Name und Domain entdoppelt, bereits angeschriebene
          Adressen bekommen keine zweite Erstansprache.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PHASEN.map((p) => (
          <button
            key={p.id}
            onClick={() => starten(p.id)}
            disabled={laeuft !== null}
            title={p.hilfe}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              p.id === "alles"
                ? "bg-brand-500/15 text-brand-300 hover:bg-brand-500/25"
                : "bg-white/5 text-gray-300 hover:bg-white/10"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {laeuft === p.id ? "läuft …" : p.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-600 mt-3">
        Orte-Rotation: nächster Block ab Position {offset + 1} von {zentren}.
        Jeder Lauf nimmt sechs Zentren, danach rückt der Block weiter.
      </p>

      {ergebnis && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-gray-400">
          {ergebnis}
        </pre>
      )}
    </div>
  );
}
