"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SearchInput({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  function commit(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next.trim()) sp.set("search", next.trim());
    else sp.delete("search");
    startTransition(() => router.push(`/search?${sp.toString()}`));
  }

  // Debounce: Suche wird nach 300ms inaktivität ausgelöst, damit nicht jedes
  // Tippen einen Server-Roundtrip auslöst.
  function onChange(next: string) {
    setValue(next);
    if (next.length === 0 || next.length >= 2) {
      // 2-Zeichen-Mindest spart Server-Last bei kurzen Suchen
      const handler = setTimeout(() => commit(next), 300);
      return () => clearTimeout(handler);
    }
  }

  return (
    <div className="relative flex-1 min-w-[240px] max-w-md">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(value); }}
        placeholder="Unternehmen, E-Mail, @handle, Stadt..."
        className="input pl-9"
      />
    </div>
  );
}
