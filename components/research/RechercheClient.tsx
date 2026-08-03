"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import Link from "next/link";
import type { ResearchProspect, ResearchRun, CityEntry } from "@/types/research";
import { ProspectCard } from "@/components/research/ProspectCard";
import { BrancheCombobox } from "@/components/research/BrancheCombobox";

// Stufe 1 — SUCHE: Unternehmen finden, sofort gescort (Größe/Branche/Score),
// gute speichern → wandern in die Leads.
export function RechercheClient({
  initialRuns, cities, brancheGroups,
}: {
  initialRuns: ResearchRun[];
  cities: CityEntry[];
  brancheGroups: { name: string; categories: string[] }[];
}) {
  // Zeigt NUR die Ergebnisse der aktuellen Suche (nicht den ganzen DB-Bestand).
  const [results, setResults] = useState<ResearchProspect[]>([]);
  const [runs] = useState<ResearchRun[]>(initialRuns);
  const [tab, setTab] = useState<"passend" | "aussortiert">("passend");
  const [searched, setSearched] = useState(false);

  const bundeslaender = useMemo(() => Array.from(new Set(cities.map((c) => c.bundesland))), [cities]);
  const [bundesland, setBundesland] = useState(bundeslaender[0] ?? "");
  const [stadt, setStadt] = useState("");
  const [branche, setBranche] = useState("");
  const [wholeState, setWholeState] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staedte = useMemo(() => cities.filter((c) => c.bundesland === bundesland).map((c) => c.stadt), [cities, bundesland]);

  const savedCount = useMemo(() => results.filter((p) => p.shortlisted).length, [results]);
  // Passend = nicht-verworfene Treffer der aktuellen Suche. Gespeicherte/
  // angeschriebene bleiben sichtbar (mit Badge), wandern aber nach unten.
  const passend = useMemo(() => {
    const rank = (p: ResearchProspect) => (p.status === "handed_off" ? 2 : p.shortlisted ? 1 : 0);
    return results
      .filter((p) => p.status !== "rejected" && p.status !== "discovered")
      .sort((a, b) => rank(a) - rank(b) || (b.score ?? 0) - (a.score ?? 0));
  }, [results]);
  const aussortiert = useMemo(() => results.filter((p) => p.status === "rejected"), [results]);
  const visible = tab === "passend" ? passend : aussortiert;

  // Top-Städte des Bundeslands (für landesweite Suche), in kurze Chunks geteilt.
  function topCityChunks(): string[][] {
    const list = cities
      .filter((c) => c.bundesland === bundesland)
      .sort((a, b) => (b.einwohner ?? 0) - (a.einwohner ?? 0)) // NRW nach Einwohner, NDS nach Reihenfolge
      .slice(0, 30)
      .map((c) => c.stadt);
    const size = 6;
    const chunks: string[][] = [];
    for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
    return chunks;
  }

  async function startRun() {
    setError(null); setMsg(null);
    if (!bundesland) { setError("Bundesland ist Pflicht."); return; }
    if (wholeState && !branche.trim()) { setError("Für eine landesweite Suche bitte eine Branche wählen."); return; }
    if (!wholeState && !stadt.trim()) { setError("Bundesland und Stadt sind Pflicht."); return; }
    setRunning(true);
    setResults([]);        // alte Such-Ergebnisse leeren → nur die neue Anfrage zeigen
    setSearched(true);
    setTab("passend");
    try {
      if (wholeState) {
        // Landesweit: in kurzen Teil-Läufen (Städte-Chunks) — kein Timeout.
        const chunks = topCityChunks();
        const totalCities = chunks.reduce((n, c) => n + c.length, 0);
        const acc: ResearchProspect[] = [];
        let found = 0;
        for (let i = 0; i < chunks.length; i++) {
          setMsg(`Landesweit… Teil ${i + 1}/${chunks.length} (${totalCities} Städte)`);
          try {
            const res = await fetch("/api/research/runs", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bundesland, branche: branche.trim(), cities: chunks[i] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Teil-Lauf fehlgeschlagen");
            found += data.found ?? 0;
            acc.push(...((data.prospects as ResearchProspect[]) ?? []));
            setResults([...acc]); // progressiv anzeigen
          } catch (e) {
            setMsg(`Teil ${i + 1} fehlgeschlagen (${String(e instanceof Error ? e.message : e)}) — mache weiter…`);
          }
        }
        setMsg(`Fertig: ${found} neue Unternehmen über ${totalCities} Städte gefunden & bewertet.`);
      } else {
        const res = await fetch("/api/research/runs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundesland, stadt: stadt.trim(), branche: branche.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Suche fehlgeschlagen");
        setResults((data.prospects as ResearchProspect[]) ?? []);
        setMsg(`${data.found} neue Unternehmen gefunden & bewertet (${data.skipped} übersprungen).`);
      }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setRunning(false); }
  }

  function replaceProspect(updated: ResearchProspect) {
    setResults((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="space-y-5">
      {/* Such-Leiste */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500">Bundesland</label>
            <select value={bundesland} onChange={(e) => { setBundesland(e.target.value); setStadt(""); }} className="input w-full mt-1">
              {bundeslaender.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Stadt</label>
            <input list="staedte-list" value={wholeState ? "" : stadt} onChange={(e) => setStadt(e.target.value)}
              disabled={wholeState} placeholder={wholeState ? `Ganz ${bundesland}` : "Stadt wählen"}
              className="input w-full mt-1 disabled:opacity-50" />
            <datalist id="staedte-list">{staedte.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-gray-500">Branche{wholeState ? " (Pflicht)" : ""}</label>
            <BrancheCombobox groups={brancheGroups} value={branche} onChange={setBranche} />
          </div>
          <button onClick={startRun} disabled={running} className="btn-primary disabled:opacity-40 h-[42px]">
            {running ? "Suche…" : "Suchen"}
          </button>
        </div>

        {/* Landesweit-Schalter */}
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer mt-3 w-fit">
          <input type="checkbox" checked={wholeState} onChange={(e) => setWholeState(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-500" />
          Ganzes Bundesland durchsuchen <span className="text-gray-600">(größte ~30 Städte · Branche nötig)</span>
        </label>

        {(msg || error) && <div className={clsx("text-xs mt-3", error ? "text-red-400" : "text-brand-300")}>{error ?? msg}</div>}
      </div>

      {/* Tabs + Hinweis auf Leads */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setTab("passend")}
            className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              tab === "passend" ? "bg-brand-500/20 text-brand-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
            Passend <span className="text-gray-600">{passend.length}</span>
          </button>
          <button onClick={() => setTab("aussortiert")}
            className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              tab === "aussortiert" ? "bg-brand-500/20 text-brand-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
            Aussortiert <span className="text-gray-600">{aussortiert.length}</span>
          </button>
        </div>
        <Link href="/recherche/leads" className="text-xs text-brand-400 hover:underline">
          {savedCount} gespeichert → zu Leads
        </Link>
      </div>

      {/* Ergebnisse */}
      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-600">
          {!searched ? "Starte oben eine Suche — hier erscheinen nur die Treffer der aktuellen Anfrage." : tab === "passend" ? "Keine neuen Treffer für diese Suche (evtl. alle schon in der Datenbank)." : "Nichts aussortiert."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((p) => <ProspectCard key={p.id} prospect={p} onChange={replaceProspect} mode="suche" />)}
        </div>
      )}

      {/* Letzte Läufe */}
      {runs.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-2">Letzte Läufe</h3>
          <div className="space-y-1">
            {runs.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs text-gray-500">
                <span>{r.stadt}{r.branche ? ` · ${r.branche}` : " · breit"}</span>
                <span className={clsx(r.status === "error" ? "text-red-400" : "text-gray-600")}>
                  {r.status === "error" ? "Fehler" : `+${r.found_count} neu / ${r.skipped_count} übersprungen`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
