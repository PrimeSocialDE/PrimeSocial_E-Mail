"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { clsx } from "clsx";
import type { DashboardTodoType } from "@/types";

// Server-rendered ToDos haben das gleiche Shape wie DashboardTodoWithLead in
// lib/supabase.ts — wir doppeln das Interface hier, damit dieser Client-
// Component keinen DB-Import braucht.
interface TodoRow {
  id: string;
  type: DashboardTodoType;
  source: "email" | "pitch_page";
  triggered_at: string;
  completed_at: string | null;
  email_step: number | null;
  lead: {
    id: string;
    company_name: string;
    contact_first_name: string | null;
    segment: string | null;
    pitch_lead_type: string | null;
  };
}

const TYPE_LABEL: Record<DashboardTodoType, string> = {
  pitch_clicked:    "Landing-Page geklickt",
  calendly_clicked: "Calendly geklickt",
};

const TYPE_BADGE: Record<DashboardTodoType, string> = {
  pitch_clicked:    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  calendly_clicked: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const TYPE_ICON: Record<DashboardTodoType, string> = {
  pitch_clicked:    "🔥",
  calendly_clicked: "📅",
};

export function TodoBoard({ initialTodos }: { initialTodos: TodoRow[] }) {
  const [todos, setTodos] = useState<TodoRow[]>(initialTodos);
  const [hide, setHide] = useState<Set<string>>(new Set()); // lokale "wird abgehakt"-Marker für optimistic UI
  const [, startTransition] = useTransition();

  // Wenn der Server neue ToDos liefert (z.B. nach router.refresh), aktualisieren
  useEffect(() => { setTodos(initialTodos); }, [initialTodos]);

  async function toggle(id: string, completed: boolean) {
    // Optimistic: ausblenden bevor der Server antwortet
    if (completed) {
      setHide((prev) => new Set(prev).add(id));
    }
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) {
        // Rollback bei Fehler
        setHide((prev) => { const n = new Set(prev); n.delete(id); return n; });
        return;
      }
      // Nach erfolgreichem Abhaken: aus der Liste entfernen (server zeigt eh nur offene)
      startTransition(() => {
        setTodos((prev) => prev.filter((t) => t.id !== id));
        setHide((prev) => { const n = new Set(prev); n.delete(id); return n; });
      });
    } catch {
      setHide((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const visible = todos.filter((t) => !hide.has(t.id));

  if (visible.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500/15 text-brand-400 text-xs">✓</span>
          <h2 className="font-semibold text-white">Offene ToDos</h2>
        </div>
        <p className="text-sm text-gray-500 mt-2">Aktuell keine Reaktion erforderlich. Sobald ein Lead auf einen Button klickt, taucht der ToDo hier auf.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">!</span>
          <h2 className="font-semibold text-white">Offene ToDos</h2>
          <span className="text-xs text-gray-500">({visible.length})</span>
        </div>
        <span className="text-xs text-gray-500">Abhaken sobald reagiert wurde</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 bg-white/[0.02]">
            <th className="px-5 py-2 font-medium w-10"></th>
            <th className="px-5 py-2 font-medium">Lead</th>
            <th className="px-5 py-2 font-medium">Signal</th>
            <th className="px-5 py-2 font-medium">Quelle</th>
            <th className="px-5 py-2 font-medium">Wann</th>
            <th className="px-5 py-2 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((todo) => (
            <tr key={todo.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-3">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={(e) => toggle(todo.id, e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
                  title="Abhaken"
                />
              </td>
              <td className="px-5 py-3">
                <Link href={`/leads/${todo.lead.id}`} className="font-medium text-gray-200 hover:text-brand-400">
                  {todo.lead.company_name}
                </Link>
                {todo.lead.contact_first_name && (
                  <div className="text-xs text-gray-500">{todo.lead.contact_first_name}</div>
                )}
              </td>
              <td className="px-5 py-3">
                <span className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border", TYPE_BADGE[todo.type])}>
                  <span>{TYPE_ICON[todo.type]}</span>
                  {TYPE_LABEL[todo.type]}
                </span>
              </td>
              <td className="px-5 py-3 text-xs text-gray-400">
                {todo.source === "email"
                  ? todo.email_step ? `Mail ${todo.email_step}` : "Mail"
                  : "Pitch-Seite"}
              </td>
              <td className="px-5 py-3 text-xs text-gray-400">
                {format(new Date(todo.triggered_at), "dd. MMM HH:mm", { locale: de })}
              </td>
              <td className="px-5 py-3 text-right">
                <Link href={`/leads/${todo.lead.id}`} className="text-xs text-brand-400 hover:underline">
                  öffnen →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
