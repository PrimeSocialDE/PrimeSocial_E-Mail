"use client";

import { useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

// Zweistufiges, durchsuchbares Branche-Feld:
//  - leer: zeigt die Hauptbranchen (Nischen) → aufklappen zeigt die Unterbranchen
//  - tippen: filtert live über alle Unterbranchen
//  - eigene (Custom-)Branchen frei eingebbar
export function BrancheCombobox({
  groups, value, onChange,
}: {
  groups: { name: string; categories: string[] }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);       // true sobald getippt → Filtermodus
  const [expanded, setExpanded] = useState<string | null>(null); // aufgeklappte Nische
  const inputRef = useRef<HTMLInputElement>(null);

  const q = value.trim().toLowerCase();
  const searching = dirty && q.length > 0;

  const filtered = useMemo(() => {
    if (!searching) return [];
    return groups
      .map((g) => ({ name: g.name, categories: g.categories.filter((c) => c.toLowerCase().includes(q)) }))
      .filter((g) => g.categories.length > 0);
  }, [groups, q, searching]);

  const exactMatch = useMemo(
    () => groups.some((g) => g.categories.some((c) => c.toLowerCase() === q)),
    [groups, q],
  );

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setDirty(false);
    setExpanded(null);
    inputRef.current?.blur();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setDirty(true); setOpen(true); }}
        onFocus={(e) => { setOpen(true); setDirty(false); e.target.select(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}
        placeholder="Branche suchen oder wählen"
        className="input w-full mt-1"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-96 overflow-y-auto card !rounded-xl p-1.5 shadow-2xl">
            {/* Breit-Suche */}
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")}
              className={clsx("w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-white/5",
                value === "" ? "text-brand-300" : "text-brand-400")}>
              Alle Branchen (breit durchsuchen)
            </button>

            {/* Custom-Branche */}
            {searching && !exactMatch && (
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(value.trim())}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-gray-200 hover:bg-white/5">
                Eigene Branche verwenden: &bdquo;{value.trim()}&ldquo;
              </button>
            )}

            <div className="h-px bg-white/[0.06] my-1" />

            {searching ? (
              // ── Suchmodus: flache Trefferliste mit Nischen-Label ──
              filtered.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-gray-600">Keine Treffer — eigene Branche oben verwenden.</div>
              ) : filtered.map((g) => (
                <div key={g.name} className="mt-0.5">
                  <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-gray-600">{g.name}</div>
                  {g.categories.map((c) => (
                    <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}
                      className={clsx("w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-white/5", value === c ? "text-brand-300" : "text-gray-300")}>
                      {c}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              // ── Browse-Modus: Hauptbranchen, aufklappbar zu Unterbranchen ──
              groups.map((g) => {
                const isOpen = expanded === g.name;
                return (
                  <div key={g.name}>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => setExpanded(isOpen ? null : g.name)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-gray-200 hover:bg-white/5">
                      <span>{g.name} <span className="text-gray-600 font-normal">({g.categories.length})</span></span>
                      <svg className={clsx("w-3.5 h-3.5 flex-shrink-0 text-gray-500 transition-transform", isOpen && "rotate-180")}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="ml-2 mb-1 border-l border-white/[0.07] pl-2">
                        {g.categories.map((c) => (
                          <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}
                            className={clsx("w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-white/5", value === c ? "text-brand-300" : "text-gray-300")}>
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
