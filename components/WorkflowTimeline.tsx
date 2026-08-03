import { clsx } from "clsx";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Lead, EmailSent } from "@/types";
import { WORKFLOW_STEPS } from "@/types";

export function WorkflowTimeline({ lead, emails = [] }: { lead: Lead; emails?: EmailSent[] }) {
  const current = lead.workflow_step;
  const start = lead.workflow_started_at ? new Date(lead.workflow_started_at) : null;

  // Welche Steps haben bereits eine gesendete Mail?
  const sentSteps = new Set(emails.map((e) => e.step_number));

  return (
    <div className="space-y-1">
      {WORKFLOW_STEPS.map((step, i) => {
        const sent   = sentSteps.has(step.step);
        const done   = step.step < current;
        const active = step.step === current;

        const scheduledDate = start
          ? new Date(start.getTime() + step.day * 86400000)
          : null;

        // Mail-Daten für diesen Step
        const stepEmail = emails.find((e) => e.step_number === step.step);

        return (
          <div key={step.step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={clsx(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border",
                sent   ? "bg-brand-500 border-brand-500 text-dark-900" :
                active ? "bg-brand-500/20 border-brand-500 text-brand-400" :
                         "bg-transparent border-white/10 text-gray-600"
              )}>
                {sent ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.step}
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className={clsx("w-px flex-1 my-0.5 min-h-[12px]", sent ? "bg-brand-500/40" : "bg-white/5")} />
              )}
            </div>

            <div className="flex-1 pb-3">
              <div className="flex items-center justify-between">
                <span className={clsx("text-sm",
                  sent   ? "text-brand-400 font-medium" :
                  active ? "text-white font-semibold" : "text-gray-400"
                )}>
                  {step.name}
                </span>
                <span className="text-xs text-gray-700">Tag {step.day}</span>
              </div>
              <div className="text-xs text-gray-600 mt-0.5">{step.description}</div>
              {sent && stepEmail && (
                <div className="text-xs text-brand-400/60 mt-0.5">
                  Gesendet: {format(new Date(stepEmail.sent_at), "dd. MMM yyyy, HH:mm", { locale: de })}
                  {stepEmail.opened_at && <span className="text-green-400 ml-2">Geöffnet</span>}
                </div>
              )}
              {!sent && scheduledDate && (
                <div className="text-xs text-gray-700 mt-0.5">
                  {format(scheduledDate, "dd. MMM yyyy", { locale: de })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
