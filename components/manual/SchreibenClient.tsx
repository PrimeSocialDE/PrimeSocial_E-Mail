"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import type { ManualTemplate, ManualDriveLink, ManualContact, ManualSender, LeadMatchResult, ManualRecipientHistory } from "@/types/manual";
import { MANUAL_SENDERS, MANUAL_DEFAULT_SENDER } from "@/types/manual";
import { AiPanel } from "@/components/manual/AiPanel";
import { DateTimePicker } from "@/components/manual/DateTimePicker";

function placeholdersInText(text: string): string[] {
  const found = text.match(/\{\{[^}]+\}\}/g) ?? [];
  return Array.from(new Set(found));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" }); } catch { return ""; }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// Sekundärtext für ein Preset, z.B. "Di., 08:00"
function fmtPreset(d: Date): string {
  return d.toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function atTime(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// Gmail-artige Schnell-Vorschläge, abhängig von der aktuellen Uhrzeit.
function buildPresets(): { label: string; date: Date }[] {
  const now = new Date();
  const out: { label: string; date: Date }[] = [];

  // Heute Abend 18:00 — nur wenn noch sinnvoll in der Zukunft
  const evening = atTime(now, 18);
  if (evening.getTime() > now.getTime() + 10 * 60_000) out.push({ label: "Heute Abend", date: evening });

  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  out.push({ label: "Morgen früh", date: atTime(tomorrow, 8) });
  out.push({ label: "Morgen Nachmittag", date: atTime(tomorrow, 13) });

  // Nächster Montag 08:00
  const daysToMon = ((1 - now.getDay() + 7) % 7) || 7;
  const monday = new Date(now); monday.setDate(monday.getDate() + daysToMon);
  out.push({ label: "Montag früh", date: atTime(monday, 8) });

  return out;
}

interface SchreibenPrefill {
  company?: string;
  branche?: string;
  first?: string;
  hook?: string;
}

export function SchreibenClient({
  templates, driveLinks, contacts = [], initialTo = "", prefill,
}: {
  templates: ManualTemplate[];
  driveLinks: ManualDriveLink[];
  contacts?: ManualContact[];
  initialTo?: string;
  prefill?: SchreibenPrefill;
}) {
  const [sender, setSender] = useState<ManualSender>(MANUAL_DEFAULT_SENDER);
  const [recipient, setRecipient] = useState(initialTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(prefill?.hook ? `${prefill.hook}\n\n` : "");
  const [templateId, setTemplateId] = useState<string>("");

  const [leadWarning, setLeadWarning] = useState<LeadMatchResult | null>(null);
  const [manualHistory, setManualHistory] = useState<ManualRecipientHistory | null>(null);
  const [research, setResearch] = useState<{ company_name: string; status: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedEmail, setCheckedEmail] = useState<string | null>(null);

  // Optionaler Kontakt-Speichern-Block — bei Handoff aus der Recherche vorbefüllt.
  const hasPrefill = !!(prefill?.company || prefill?.first || prefill?.branche);
  const [saveContact, setSaveContact] = useState(hasPrefill);
  const [contactFirst, setContactFirst] = useState(prefill?.first ?? "");
  const [contactCompany, setContactCompany] = useState(prefill?.company ?? "");
  const [contactBranche, setContactBranche] = useState(prefill?.branche ?? "");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ scheduled: boolean; when?: string } | null>(null);

  // Geplanter Versand (Gmail-Style Split-Button)
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);

  const openPlaceholders = placeholdersInText(`${subject}\n${body}`);

  async function checkRecipient(email: string = recipient) {
    const addr = email.trim();
    if (!addr) { setLeadWarning(null); setManualHistory(null); setResearch(null); return; }
    setChecking(true);
    try {
      const res = await fetch("/api/manual/recipient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      const data = await res.json();
      if (res.ok) {
        setLeadWarning(data.lead ?? null);
        setManualHistory(data.manual ?? null);
        setResearch(data.research ?? null);
        setCheckedEmail(addr);
      } else {
        setLeadWarning(null); setManualHistory(null); setResearch(null); setCheckedEmail(null);
      }
    } catch {
      setLeadWarning(null); setManualHistory(null); setResearch(null); setCheckedEmail(null);
    } finally {
      setChecking(false);
    }
  }

  // Live-Check: sobald eine vollständige E-Mail eingetippt ist, sofort prüfen
  // (debounced), damit der Hinweis VOR dem Schreiben erscheint — nicht erst beim Senden.
  useEffect(() => {
    const addr = recipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setLeadWarning(null); setManualHistory(null); setResearch(null); setCheckedEmail(null);
      return;
    }
    const t = setTimeout(() => checkRecipient(addr), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient]);

  function pickContact(email: string) {
    setRecipient(email);
    if (email) checkRecipient(email);
    else { setLeadWarning(null); setManualHistory(null); setResearch(null); }
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject ?? "");
      setBody(t.body);
    }
  }

  // Kern-Versand. scheduledIso = null → sofort, sonst geplant.
  async function doSend(scheduledIso: string | null) {
    setError(null);
    if (!recipient.trim() || !subject.trim() || !body.trim()) {
      setError("Empfänger, Betreff und Body sind Pflicht.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/manual/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender,
          recipient_email: recipient.trim(),
          subject,
          body,
          template_id: templateId || null,
          saveContact: saveContact ? { first_name: contactFirst || null, company: contactCompany || null, branche: contactBranche || null } : null,
          scheduled_for: scheduledIso,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Versand fehlgeschlagen");
      setResult(scheduledIso ? { scheduled: true, when: scheduledIso } : { scheduled: false });
      // Felder zurücksetzen (Absender beibehalten)
      setRecipient(""); setSubject(""); setBody(""); setTemplateId("");
      setLeadWarning(null); setManualHistory(null); setResearch(null); setSaveContact(false);
      setContactFirst(""); setContactCompany(""); setContactBranche("");
      setMenuOpen(false); setShowCustom(false); setScheduleDate(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSending(false);
    }
  }

  function handleSend() { doSend(null); }

  function scheduleSend(date: Date) {
    if (date.getTime() < Date.now()) { setError("Der geplante Zeitpunkt liegt in der Vergangenheit."); return; }
    doSend(date.toISOString());
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Editor */}
      <div className="lg:col-span-2 space-y-4">
        {result && (
          <div className="card p-3 border-brand-500/30 text-brand-300 text-sm flex items-center justify-between">
            <span>{result.scheduled ? `✓ Versand geplant für ${fmtDateTime(result.when ?? null)} Uhr.` : "✓ Mail versendet."}</span>
            <button onClick={() => setResult(null)} className="text-gray-500 hover:text-gray-300 text-xs">schließen</button>
          </div>
        )}

        <div className="card p-5 space-y-4">
          {/* Absender + Empfänger */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">Absender</label>
              <select value={sender} onChange={(e) => setSender(e.target.value as ManualSender)} className="input w-full mt-1">
                {MANUAL_SENDERS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Empfänger</label>
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                onBlur={() => checkRecipient()}
                placeholder="kontakt@firma.de"
                className="input w-full mt-1"
              />
            </div>
          </div>

          {/* Kontakt auswählen (optional) */}
          {contacts.length > 0 && (
            <div>
              <label className="text-xs text-gray-500">Aus Kontakten wählen</label>
              <select value="" onChange={(e) => pickContact(e.target.value)} className="input w-full mt-1">
                <option value="">— Kontakt wählen —</option>
                {contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email;
                  return <option key={c.id} value={c.email}>{name} ({c.email})</option>;
                })}
              </select>
            </div>
          )}

          {/* Template-Auswahl */}
          <div>
            <label className="text-xs text-gray-500">Template</label>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className="input w-full mt-1">
              <option value="">— Kein Template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Betreff */}
          <div>
            <label className="text-xs text-gray-500">Betreff</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input w-full mt-1" />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs text-gray-500">Nachricht</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14}
              placeholder="Schreib deine Mail…" className="input w-full mt-1 font-mono text-sm leading-relaxed resize-y" />
          </div>

          {openPlaceholders.length > 0 && (
            <div className="text-xs text-yellow-400/80">
              Noch unausgefüllte Platzhalter: {openPlaceholders.join(", ")}
            </div>
          )}

          {/* Kontakt speichern */}
          <div className="border-t border-white/[0.06] pt-3">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={saveContact} onChange={(e) => setSaveContact(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-500" />
              Empfänger als manuellen Kontakt speichern
            </label>
            {saveContact && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <input value={contactFirst} onChange={(e) => setContactFirst(e.target.value)} placeholder="Vorname" className="input w-full" />
                <input value={contactCompany} onChange={(e) => setContactCompany(e.target.value)} placeholder="Firma" className="input w-full" />
                <input value={contactBranche} onChange={(e) => setContactBranche(e.target.value)} placeholder="Branche" className="input w-full" />
              </div>
            )}
          </div>

          {error && <div className="text-red-400 text-xs">{error}</div>}

          <div className="flex items-center gap-3 flex-wrap">
            {/* Split-Button: Senden + Dropdown (Gmail-Style) */}
            <div className="relative inline-flex">
              <button onClick={handleSend} disabled={sending}
                className="btn-primary !rounded-r-none disabled:opacity-40">
                {sending ? "Sende…" : "Senden"}
              </button>
              <button onClick={() => setMenuOpen((o) => !o)} disabled={sending}
                title="Versand planen"
                className="btn-primary !rounded-l-none !px-2.5 border-l border-black/20 disabled:opacity-40">
                <svg className={clsx("w-4 h-4 transition-transform", menuOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-2 z-20 w-64 card !rounded-xl p-1.5 shadow-2xl">
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-gray-600">Senden planen</div>
                    {buildPresets().map((p) => (
                      <button key={p.label} onClick={() => scheduleSend(p.date)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5 transition-colors">
                        <span>{p.label}</span>
                        <span className="text-xs text-gray-500">{fmtPreset(p.date)}</span>
                      </button>
                    ))}
                    <div className="h-px bg-white/[0.06] my-1" />
                    <button onClick={() => { setMenuOpen(false); setShowCustom(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-brand-300 hover:bg-white/5 transition-colors">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Datum &amp; Uhrzeit auswählen…
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="text-xs text-gray-600">über {sender}</span>
          </div>

          {showCustom && (
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.06] p-4 space-y-3">
              <label className="text-xs text-gray-400">Versandzeitpunkt — Tag antippen, Uhrzeit wählen</label>
              <DateTimePicker value={scheduleDate} onChange={setScheduleDate} />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scheduleDate && scheduleSend(scheduleDate)}
                  disabled={sending || !scheduleDate}
                  className="btn-primary disabled:opacity-40"
                >
                  {sending ? "Plane…" : "Geplant senden"}
                </button>
                <button onClick={() => { setShowCustom(false); setScheduleDate(null); }} className="btn-ghost">Abbrechen</button>
                {scheduleDate && <span className="text-xs text-gray-500">{fmtDateTime(scheduleDate.toISOString())} Uhr</span>}
              </div>
              <p className="text-xs text-gray-600">Geplante Mails werden alle paar Minuten automatisch verschickt (±5 Min).</p>
            </div>
          )}
        </div>
      </div>

      {/* Rechte Seitenleiste */}
      <div className="space-y-4">
        {/* Empfänger-Status — erscheint live, sobald eine E-Mail eingetippt ist */}
        {checking && (
          <div className="card p-3 text-xs text-gray-500 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            Prüfe Empfänger…
          </div>
        )}

        {!checking && leadWarning?.matched && (
          <div className="rounded-xl border-2 border-yellow-500/60 bg-yellow-500/15 px-4 py-3 text-sm text-yellow-200 shadow-lg">
            <div className="font-semibold mb-0.5">⚠️ Bereits im Automation-Workflow</div>
            Liegt schon als Lead vor
            {leadWarning.company_name ? ` (${leadWarning.company_name})` : ""}
            {leadWarning.segment ? ` · Segment ${leadWarning.segment}` : ""}
            {typeof leadWarning.workflow_step === "number" ? ` · Step ${leadWarning.workflow_step}` : ""}
            {leadWarning.status ? ` · ${leadWarning.status}` : ""}. Nicht doppelt anschreiben.
          </div>
        )}

        {!checking && manualHistory && manualHistory.count > 0 && (
          <div className="rounded-xl border-2 border-orange-500/60 bg-orange-500/15 px-4 py-3 text-sm text-orange-200 shadow-lg">
            <div className="font-semibold mb-0.5">📨 Schon manuell angeschrieben</div>
            Bereits {manualHistory.count} manuelle Mail{manualHistory.count === 1 ? "" : "s"} an diese Adresse
            {manualHistory.lastSentAt ? ` · zuletzt ${fmtDate(manualHistory.lastSentAt)}` : ""}
            {manualHistory.lastSubject ? ` · „${manualHistory.lastSubject}"` : ""}.
          </div>
        )}

        {!checking && research && (
          <div className="rounded-xl border-2 border-sky-500/50 bg-sky-500/15 px-4 py-3 text-sm text-sky-200 shadow-lg">
            <div className="font-semibold mb-0.5">🔎 In der Recherche-Queue</div>
            Liegt als Prospect vor
            {research.company_name ? ` (${research.company_name})` : ""}
            {research.status ? ` · Status ${research.status}` : ""}.
          </div>
        )}

        {!checking && checkedEmail && !leadWarning?.matched && !(manualHistory && manualHistory.count > 0) && !research && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
            ✓ Neuer Empfänger — noch nie kontaktiert.
          </div>
        )}

        {/* Drive-Links Quick-Access (read-only) */}
        <div className="card p-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-2">Drive-Links</h3>
          {driveLinks.length === 0 ? (
            <p className="text-xs text-gray-600">Keine Links hinterlegt.</p>
          ) : (
            <div className="space-y-1">
              {driveLinks.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-400 hover:text-brand-400 hover:bg-white/5 transition-colors">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <span className="truncate">{l.label}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* AI-Assistent: Tipps (nur Hinweise) + Chat (darf umschreiben) */}
        <AiPanel
          draft={{ subject, body }}
          onApply={(next) => {
            if (next.subject !== undefined) setSubject(next.subject);
            if (next.body !== undefined) setBody(next.body);
          }}
        />
      </div>
    </div>
  );
}
