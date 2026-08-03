import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Lead } from "@/types";

type HotLead = Lead & { hotSignal: string; signalAt: string };

const SIGNAL_LABELS: Record<string, string> = {
  calendly_booked:   "Calendly-Termin gebucht",
  replied:           "hat geantwortet",
  pitch_cta_clicked: "Calendly-Button geklickt",
  pitch_visited:     "Pitch-Page besucht",
};

const SIGNAL_COLORS: Record<string, string> = {
  calendly_booked:   "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  replied:           "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  pitch_cta_clicked: "bg-amber-500/15  text-amber-300  border-amber-500/30",
  pitch_visited:     "bg-blue-500/15   text-blue-300   border-blue-500/30",
};

const SIGNAL_ICONS: Record<string, string> = {
  calendly_booked:   "📅",
  replied:           "✉",
  pitch_cta_clicked: "🔥",
  pitch_visited:     "👁",
};

export function HotLeadsBanner({ leads }: { leads: HotLead[] }) {
  if (leads.length === 0) return null;

  return (
    <div className="card border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-dark-900 to-dark-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 text-sm">
            🔥
          </span>
          <h2 className="text-lg font-heading font-bold text-white">Heiße Leads</h2>
          <span className="text-xs text-gray-500">({leads.length})</span>
        </div>
        <span className="text-xs text-gray-500">Sortiert nach Stärke des Signals</span>
      </div>

      <div className="space-y-2">
        {leads.slice(0, 10).map((l) => (
          <Link
            key={l.id}
            href={`/leads/${l.id}`}
            className="flex items-center gap-4 px-4 py-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors"
          >
            <span className="text-lg w-6 text-center">{SIGNAL_ICONS[l.hotSignal] ?? "•"}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">{l.company_name}</div>
              <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${SIGNAL_COLORS[l.hotSignal]}`}>
                  {SIGNAL_LABELS[l.hotSignal]}
                </span>
                <span>· {format(new Date(l.signalAt), "dd. MMM HH:mm", { locale: de })}</span>
              </div>
            </div>
            <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>

      {leads.length > 10 && (
        <div className="text-xs text-gray-500 mt-3 text-center">
          + {leads.length - 10} weitere heiße Leads
        </div>
      )}
    </div>
  );
}
