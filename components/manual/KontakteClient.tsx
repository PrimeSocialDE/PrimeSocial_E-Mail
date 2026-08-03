"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ManualContact } from "@/types/manual";

type Draft = { email: string; first_name: string; last_name: string; company: string; branche: string; notes: string };
const EMPTY: Draft = { email: "", first_name: "", last_name: "", company: "", branche: "", notes: "" };

function toDraft(c: ManualContact): Draft {
  return {
    email: c.email,
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    company: c.company ?? "",
    branche: c.branche ?? "",
    notes: c.notes ?? "",
  };
}

export function KontakteClient({ initialContacts }: { initialContacts: ManualContact[] }) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initialContacts);
  const [editingId, setEditingId] = useState<string | null>(null); // null = nicht im Edit, "new" = neuer Kontakt
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startNew() { setEditingId("new"); setDraft(EMPTY); setError(null); }
  function startEdit(c: ManualContact) { setEditingId(c.id); setDraft(toDraft(c)); setError(null); }
  function cancel() { setEditingId(null); setDraft(EMPTY); setError(null); }

  async function save() {
    if (!draft.email.trim()) { setError("E-Mail ist Pflicht."); return; }
    setSaving(true);
    setError(null);
    try {
      const isNew = editingId === "new";
      const res = await fetch(isNew ? "/api/manual/contacts" : `/api/manual/contacts/${editingId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.email.trim(),
          first_name: draft.first_name || null,
          last_name: draft.last_name || null,
          company: draft.company || null,
          branche: draft.branche || null,
          notes: draft.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Speichern fehlgeschlagen");
      setContacts((prev) => {
        const exists = prev.some((c) => c.id === data.id);
        return exists ? prev.map((c) => (c.id === data.id ? data : c)) : [data, ...prev];
      });
      cancel();
      router.refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Kontakt wirklich löschen?")) return;
    const res = await fetch(`/api/manual/contacts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    }
  }

  const editing = editingId !== null;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">{contacts.length} Kontakt{contacts.length === 1 ? "" : "e"}</div>
        {!editing && <button onClick={startNew} className="btn-primary">Neuer Kontakt</button>}
      </div>

      {editing && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-white text-sm">{editingId === "new" ? "Neuer Kontakt" : "Kontakt bearbeiten"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">E-Mail *</label>
              <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Firma</label>
              <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Vorname</label>
              <input value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Nachname</label>
              <input value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Branche</label>
              <input value={draft.branche} onChange={(e) => setDraft({ ...draft, branche: e.target.value })} className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Notizen</label>
              <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="input w-full mt-1" />
            </div>
          </div>
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-40">{saving ? "Speichere…" : "Speichern"}</button>
            <button onClick={cancel} className="btn-ghost">Abbrechen</button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-sm text-gray-600">Noch keine Kontakte.</p></div>
      ) : (
        <div className="card p-2">
          <div className="divide-y divide-white/[0.04]">
            {contacts.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-white/[0.02] rounded-lg group">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">
                      {name || c.email}
                      {c.company && <span className="text-gray-600 font-normal"> · {c.company}</span>}
                      {c.branche && <span className="text-gray-700 font-normal text-xs"> · {c.branche}</span>}
                    </div>
                    <div className="text-xs text-gray-600 truncate">{c.email}{c.notes ? ` — ${c.notes}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Link href={`/manuell/schreiben?to=${encodeURIComponent(c.email)}`} className="text-xs text-gray-500 hover:text-brand-400 transition-colors">Mail</Link>
                    <button onClick={() => startEdit(c)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Bearbeiten</button>
                    <button onClick={() => remove(c.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Löschen</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
