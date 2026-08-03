"use client";

import { useState } from "react";

// "Jetzt testen"-Button für die Einstellungen-Seite. Löst EINEN kleinen,
// gedeckelten Crawl-Lauf aus (auth-geschützte Route) und zeigt das Ergebnis.
interface RunResult {
  ok?: boolean;
  error?: string;
  testMaxQueries?: number;
  discovery?: {
    trefferGesamt: number;
    verworfen: number;
    neueFirmen: number;
    signaleUpserted: number;
    queriesAusgefuehrt: number;
    abgeschnitten: boolean;
    fehler: string[];
  };
  emails?: { geprueft: number; gefunden: number; perPattern: number };
}

export function TestRunButton() {
  const [laeuft, setLaeuft] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function starten() {
    setLaeuft(true);
    setResult(null);
    try {
      const res = await fetch("/api/stellensignale/run", { method: "POST" });
      const data = (await res.json()) as RunResult;
      setResult(data);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaeuft(false);
    }
  }

  const d = result?.discovery;

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
          <>
            <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
            Läuft…
          </>
        ) : (
          "Jetzt testen (1 kleiner Lauf)"
        )}
      </button>

      {result?.error && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {result.error === "Nicht eingeloggt"
            ? "Nicht eingeloggt — bitte neu anmelden."
            : `Fehler: ${result.error}`}
        </div>
      )}

      {result?.ok && d && (
        <div className="mt-3 rounded-lg border border-white/5 bg-dark-950 px-4 py-3 text-sm">
          <div className="text-gray-300 font-medium mb-1">
            Testlauf fertig (Deckel: {result.testMaxQueries} Queries)
          </div>
          <ul className="text-gray-500 text-xs space-y-0.5">
            <li>Queries ausgeführt: {d.queriesAusgefuehrt}{d.abgeschnitten ? " (Deckel erreicht)" : ""}</li>
            <li>Treffer gesamt: {d.trefferGesamt} · verworfen (Störer): {d.verworfen}</li>
            <li>Neue Firmen: {d.neueFirmen} · Signale gespeichert: {d.signaleUpserted}</li>
            {result.emails && (
              <li>
                E-Mails: {result.emails.gefunden}/{result.emails.geprueft} gefunden
                {result.emails.perPattern ? ` (davon ${result.emails.perPattern} per Pattern)` : ""}
              </li>
            )}
            {d.trefferGesamt === 0 && (
              <li className="text-amber-400/80 pt-1">
                0 Treffer — meist: keine Plattform scharf geschaltet (Flag + Actor-ID) oder Deckel/kein Token.
              </li>
            )}
          </ul>
          {d.fehler.length > 0 && (
            <div className="mt-2 text-xs text-amber-400/80">
              Hinweise: {d.fehler.slice(0, 3).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
