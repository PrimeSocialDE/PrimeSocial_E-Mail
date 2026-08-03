"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Lead, EmailSent, Segment } from "@/types";
import { STATUS_LABELS, STATUS_COLORS, SEGMENT_LABELS, SEGMENTS, SEGMENT_COLORS, WORKFLOW_STEPS } from "@/types";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { SegmentBadge } from "@/components/SegmentBadge";

type Tab = "overview" | "workflow" | "emails" | "actions";

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [emails, setEmails] = useState<EmailSent[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapingWebsite, setScrapingWebsite] = useState(false);
  const [websiteResult, setWebsiteResult] = useState<{
    emails: string[]; bestEmail: string | null; gfName: string | null;
    phone: string | null; websiteSummary: string | null;
    hunter: null | {
      source: "finder"; email: string; score: number; position: string | null;
    } | {
      source: "domain"; emails: { email: string; score: number; firstName: string | null; lastName: string | null; position: string | null }[];
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((data) => {
        // API gibt { lead, emails } zurück
        if (data.lead) {
          setLead(data.lead);
          setEmails(Array.isArray(data.emails) ? data.emails : []);
        } else {
          // Fallback: direktes Lead-Objekt (lokaler Store)
          setLead(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleScrape() {
    setScraping(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}/scrape`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLead(data.lead);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  }

  async function handleScrapeWebsite() {
    setScrapingWebsite(true);
    setError(null);
    setWebsiteResult(null);
    try {
      const res = await fetch(`/api/leads/${id}/scrape-website`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWebsiteResult(data);
      // Reload lead if fields were updated
      if (data.updatedFields?.length > 0) {
        const refreshed = await fetch(`/api/leads/${id}`).then((r) => r.json());
        setLead(refreshed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScrapingWebsite(false);
    }
  }

  async function handleUseEmail(email: string) {
    if (!lead) return;
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.ok) setLead(data);
  }

  async function handleStatusChange(status: Lead["status"]) {
    if (!lead) return;
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) { setLead(data); router.refresh(); }
  }

  async function handleRegenerateDrafts() {
    if (!lead) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/leads/${id}/regenerate-drafts`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`${data.draftsGenerated} Drafts neu generiert`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSegmentChange(segment: Segment) {
    if (!lead) return;
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment }),
    });
    const data = await res.json();
    if (res.ok) { setLead(data); router.refresh(); }
  }

  async function handleDeleteLead() {
    if (!lead) return;
    const confirmed = window.confirm(
      `Lead "${lead.company_name}" wirklich komplett löschen?\n\nDas entfernt alle Drafts, gesendeten Mails und ggf. die Pitch-Seite. Nicht umkehrbar.`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Löschen fehlgeschlagen");
      }
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20 text-gray-500">
        Lead nicht gefunden.{" "}
        <Link href="/dashboard" className="text-brand-400 hover:underline">Zurück</Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Übersicht" },
    { id: "workflow", label: "Workflow" },
    { id: "emails", label: `E-Mails (${emails.length})` },
    { id: "actions", label: "Aktionen" },
  ];

  const ig = lead.instagram_data;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Link href="/dashboard" className="mt-1 text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-heading font-bold text-white">{lead.company_name}</h1>
            {lead.segment && <SegmentBadge segment={lead.segment} />}
            <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[lead.status])}>
              {STATUS_LABELS[lead.status]}
            </span>
            {/* Hot-Signals: prominent neben dem Status, damit man beim Öffnen sofort sieht ob es warm ist */}
            {lead.calendly_booked_at && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                📅 Calendly gebucht
              </span>
            )}
            {lead.status === "replied" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ✉ Hat geantwortet
              </span>
            )}
            {lead.pitch_cta_clicked_at && !lead.calendly_booked_at && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                🔥 CTA geklickt
              </span>
            )}
            {lead.pitch_visited_at && !lead.pitch_cta_clicked_at && !lead.calendly_booked_at && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                👁 Pitch besucht
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            {lead.contact_first_name ?? lead.contact_name ?? "–"}
            {lead.email && <span> · {lead.email}</span>}
            {lead.city && <span> · {lead.city}</span>}
          </p>
        </div>
        <Link href={`/leads/${lead.id}/pitch`} className="btn-secondary text-sm flex-shrink-0">
          Pitch-Seite
        </Link>
        <Link href={`/compose/${lead.id}`} className="btn-primary text-sm flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          Nächste Mail
        </Link>
        <button
          onClick={handleDeleteLead}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
          title="Lead komplett aus dem Workflow + DB entfernen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
          Löschen
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit mb-6">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx("px-4 py-2 text-sm rounded-lg font-medium transition-colors",
              tab === t.id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5">
              <h2 className="font-semibold text-white mb-4">Lead-Info</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="Unternehmen" value={lead.company_name} />
                <InfoRow label="Ansprechpartner" value={[lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(" ") || lead.contact_name} />
                <InfoRow label="Firmen-Mail" value={lead.email} link={`mailto:${lead.email}`} />
                {lead.private_email && (
                  <InfoRow label="Private Mail" value={lead.private_email} link={`mailto:${lead.private_email}`} />
                )}
                <InfoRow label="Stadt" value={lead.city} />
                <InfoRow label="Instagram" value={lead.instagram_handle ? `@${lead.instagram_handle.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/+$/, "")}` : null} link={lead.instagram_handle?.startsWith("http") ? lead.instagram_handle : lead.instagram_handle ? `https://instagram.com/${lead.instagram_handle}` : undefined} />
                <InfoRow label="Website" value={lead.website_url} link={lead.website_url ?? undefined} />
                <InfoRow label="Status" value={STATUS_LABELS[lead.status]} />
                <InfoRow label="Erstellt" value={lead.created_at && !isNaN(new Date(lead.created_at).getTime()) ? format(new Date(lead.created_at), "dd. MMM yyyy", { locale: de }) : "–"} />
              </div>
              {lead.instagram_problem && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="text-xs text-gray-500 font-medium mb-1">Instagram-Problem</div>
                  <p className="text-xs text-gray-400 leading-relaxed">{lead.instagram_problem}</p>
                </div>
              )}
              {lead.segment_reasoning && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="text-xs text-gray-500 font-medium mb-1">Segment-Reasoning</div>
                  <p className="text-xs text-gray-400 leading-relaxed">{lead.segment_reasoning}</p>
                </div>
              )}
              {lead.website_summary && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 font-medium mb-1">Website-Zusammenfassung</div>
                  <p className="text-xs text-gray-400 leading-relaxed">{lead.website_summary}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {ig && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-white text-sm">Instagram</h2>
                  <button onClick={handleScrape} disabled={scraping} className="btn-ghost text-xs py-1">
                    {scraping ? "Scraping..." : "Aktualisieren"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <StatBox label="Follower" value={ig.followersCount?.toLocaleString("de-DE") ?? "–"} />
                  <StatBox label="Posts" value={ig.postsCount?.toString() ?? "–"} />
                  <StatBox label="Folgt" value={ig.followsCount?.toLocaleString("de-DE") ?? "–"} />
                </div>
                {ig.biography && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{ig.biography}</p>
                )}
                {ig.scrapedAt && (
                  <div className="text-xs text-gray-700 mt-2">
                    Gescraped: {format(new Date(ig.scrapedAt), "dd. MMM yyyy", { locale: de })}
                  </div>
                )}
                {ig.latestPosts && ig.latestPosts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-xs text-gray-500 font-medium mb-2">Letzte Posts</div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {ig.latestPosts.slice(0, 6).map((post, i) => (
                        <div key={post.id ?? i} className="bg-white/[0.03] rounded-lg p-2.5">
                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                            <span className={clsx(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium",
                              post.type === "Video" || post.type === "Reel" ? "bg-purple-500/15 text-purple-400" :
                              post.type === "Sidecar" ? "bg-blue-500/15 text-blue-400" :
                              "bg-gray-500/15 text-gray-400"
                            )}>
                              {post.type ?? "Post"}
                            </span>
                            {post.timestamp && (
                              <span>{format(new Date(post.timestamp), "dd.MM.yy", { locale: de })}</span>
                            )}
                            {post.likesCount != null && <span>{post.likesCount.toLocaleString("de-DE")} Likes</span>}
                            {post.videoViewCount != null && <span>{post.videoViewCount.toLocaleString("de-DE")} Views</span>}
                            {post.commentsCount != null && <span>{post.commentsCount} Komm.</span>}
                          </div>
                          {post.caption && (
                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{post.caption}</p>
                          )}
                          {post.url && (
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-brand-400 hover:underline mt-1 inline-block">
                              Öffnen →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!ig && lead.instagram_handle && (
              <div className="card p-5">
                <h2 className="font-semibold text-white text-sm mb-3">Instagram</h2>
                <p className="text-xs text-gray-500 mb-3">Noch keine Daten gescraped.</p>
                <button onClick={handleScrape} disabled={scraping} className="btn-secondary text-xs">
                  {scraping ? "Scraping..." : "Jetzt scrapen"}
                </button>
              </div>
            )}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-white text-sm">Step {lead.workflow_step}/{WORKFLOW_STEPS.length}</h2>
                {lead.next_touchpoint_at && (
                  <span className="text-xs text-gray-500">
                    {format(new Date(lead.next_touchpoint_at), "dd. MMM", { locale: de })}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                {WORKFLOW_STEPS.map((s) => (
                  <div key={s.step} className={clsx("flex-1 h-1.5 rounded-full",
                    s.step < lead.workflow_step  ? "bg-brand-500" :
                    s.step === lead.workflow_step ? "bg-brand-400" : "bg-white/10"
                  )} />
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {WORKFLOW_STEPS.find((s) => s.step === lead.workflow_step)?.name ?? "–"}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === "workflow" && (
        <div className="max-w-2xl">
          <WorkflowTimeline lead={lead} emails={emails} />
        </div>
      )}

      {tab === "emails" && (
        <div className="space-y-3">
          {emails.length === 0 ? (
            <div className="text-gray-500 text-sm py-10 text-center">Noch keine E-Mails gesendet.</div>
          ) : (
            <>
              <div className="text-xs text-gray-600 mb-2">{emails.length} E-Mail{emails.length !== 1 ? "s" : ""} gesendet</div>
              {emails.map((e) => <EmailCard key={e.id} email={e} />)}
            </>
          )}
        </div>
      )}

      {tab === "actions" && (
        <div className="max-w-lg space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-4">Status ändern</h2>
            <div className="flex flex-wrap gap-2">
              {(["new", "active", "paused", "replied", "converted"] as Lead["status"][]).map((s) => (
                <button key={s} onClick={() => handleStatusChange(s)}
                  className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    lead.status === s
                      ? "bg-brand-500/15 text-brand-400 border-brand-500/30"
                      : "text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-200"
                  )}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-4">Segment ändern</h2>
            <div className="flex flex-wrap gap-2">
              {SEGMENTS.map((s) => (
                <button key={s} onClick={() => handleSegmentChange(s)}
                  className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    lead.segment === s
                      ? "bg-brand-500/15 text-brand-400 border-brand-500/30"
                      : "text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-200"
                  )}>
                  {SEGMENT_LABELS[s]}
                </button>
              ))}
              <button onClick={() => handleSegmentChange("KEINFIT" as Segment)}
                className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  lead.segment === "KEINFIT"
                    ? "bg-brand-500/15 text-brand-400 border-brand-500/30"
                    : "text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-200"
                )}>
                {SEGMENT_LABELS["KEINFIT"]}
              </button>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2">Drafts neu generieren</h2>
            <p className="text-xs text-gray-500 mb-3">
              Alle ausstehenden E-Mail-Entwürfe löschen und mit dem aktuellen Prompt neu generieren.
            </p>
            <button onClick={handleRegenerateDrafts} disabled={regenerating} className="btn-secondary">
              {regenerating ? "Generiere..." : "Drafts regenerieren"}
            </button>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-4">Instagram scrapen</h2>
            <p className="text-xs text-gray-500 mb-3">
              Apify-Scraper für @{lead.instagram_handle ?? "–"} ausführen und Segment neu bestimmen.
            </p>
            <button onClick={handleScrape} disabled={scraping || !lead.instagram_handle} className="btn-secondary">
              {scraping ? "Scraping..." : "Scraper starten"}
            </button>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-1">Website & Hunter</h2>
            <p className="text-xs text-gray-500 mb-3">
              Impressum scrapen + Hunter.io nach GF-E-Mail durchsuchen.
            </p>
            {lead.website_url ? (
              <>
                <button onClick={handleScrapeWebsite} disabled={scrapingWebsite} className="btn-secondary">
                  {scrapingWebsite ? "Suche läuft..." : "E-Mail finden"}
                </button>
                {websiteResult && (
                  <div className="mt-4 space-y-4">
                    {/* Hunter Finder result */}
                    {websiteResult.hunter?.source === "finder" && (
                      <div className="rounded-lg bg-brand-500/10 border border-brand-500/20 px-3 py-2.5">
                        <div className="text-xs text-brand-400 font-medium mb-1">Hunter Finder ·{" "}
                          <span className="text-gray-500">Confidence {websiteResult.hunter.score}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-200 flex-1 truncate">{websiteResult.hunter.email}</span>
                          <button
                            onClick={() => handleUseEmail((websiteResult.hunter as { email: string }).email)}
                            className={clsx("text-xs px-2 py-0.5 rounded border transition-colors shrink-0",
                              lead.email === (websiteResult.hunter as { email: string }).email
                                ? "border-brand-500/30 text-brand-400 bg-brand-500/10"
                                : "border-white/10 text-gray-500 hover:text-gray-200 hover:border-white/20"
                            )}
                          >
                            {lead.email === (websiteResult.hunter as { email: string }).email ? "Aktiv" : "Verwenden"}
                          </button>
                        </div>
                        {websiteResult.hunter.position && (
                          <div className="text-xs text-gray-600 mt-0.5">{websiteResult.hunter.position}</div>
                        )}
                      </div>
                    )}

                    {/* Hunter Domain results */}
                    {websiteResult.hunter?.source === "domain" && websiteResult.hunter.emails.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-600 mb-1.5">Hunter Domain-Suche</div>
                        <div className="space-y-1.5">
                          {(websiteResult.hunter as { source: "domain"; emails: { email: string; score: number; firstName: string | null; lastName: string | null; position: string | null }[] }).emails.map((e) => (
                            <div key={e.email} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-300 truncate">{e.email}</div>
                                {(e.firstName || e.position) && (
                                  <div className="text-xs text-gray-600 truncate">
                                    {[e.firstName, e.lastName].filter(Boolean).join(" ")}{e.position ? ` · ${e.position}` : ""}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-gray-700 shrink-0">{e.score}%</span>
                              <button
                                onClick={() => handleUseEmail(e.email)}
                                className={clsx("text-xs px-2 py-0.5 rounded border transition-colors shrink-0",
                                  lead.email === e.email
                                    ? "border-brand-500/30 text-brand-400 bg-brand-500/10"
                                    : "border-white/10 text-gray-500 hover:text-gray-200 hover:border-white/20"
                                )}
                              >
                                {lead.email === e.email ? "Aktiv" : "Verwenden"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* GF name from scraping */}
                    {websiteResult.gfName && (
                      <div>
                        <div className="text-xs text-gray-600 mb-0.5">GF aus Impressum</div>
                        <div className="text-sm text-gray-300">{websiteResult.gfName}</div>
                      </div>
                    )}

                    {/* Scraped emails */}
                    {websiteResult.emails.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-600 mb-1.5">Website E-Mails</div>
                        <div className="space-y-1.5">
                          {websiteResult.emails.map((email) => (
                            <div key={email} className="flex items-center gap-2">
                              <span className={clsx("text-sm flex-1 truncate",
                                email === websiteResult.bestEmail && !websiteResult.hunter ? "text-brand-400" : "text-gray-500"
                              )}>
                                {email}
                              </span>
                              <button
                                onClick={() => handleUseEmail(email)}
                                className={clsx("text-xs px-2 py-0.5 rounded border transition-colors shrink-0",
                                  lead.email === email
                                    ? "border-brand-500/30 text-brand-400 bg-brand-500/10"
                                    : "border-white/10 text-gray-500 hover:text-gray-200 hover:border-white/20"
                                )}
                              >
                                {lead.email === email ? "Aktiv" : "Verwenden"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!websiteResult.hunter && websiteResult.emails.length === 0 && (
                      <div className="text-xs text-gray-600">Keine E-Mail gefunden.</div>
                    )}

                    {websiteResult.phone && (
                      <div>
                        <div className="text-xs text-gray-600 mb-0.5">Telefon</div>
                        <div className="text-sm text-gray-500">{websiteResult.phone}</div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-600">Keine Website-URL hinterlegt.</p>
            )}
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-4">Nächste E-Mail verfassen</h2>
            <p className="text-xs text-gray-500 mb-3">
              Step {lead.workflow_step}: {WORKFLOW_STEPS.find((s) => s.step === lead.workflow_step)?.description ?? "–"}
            </p>
            <Link href={`/compose/${lead.id}`} className="btn-primary inline-flex">
              E-Mail öffnen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string | null | undefined; link?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-600 mb-0.5">{label}</div>
      {link && value ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline text-sm truncate block">
          {value}
        </a>
      ) : (
        <div className="text-sm text-gray-300 truncate">{value ?? "–"}</div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  );
}

function EmailCard({ email }: { email: EmailSent }) {
  const [open, setOpen] = useState(false);
  const stepInfo = WORKFLOW_STEPS.find((s) => s.step === email.step_number);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
        <div className="text-left min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded shrink-0">
              Step {email.step_number}
            </span>
            <span className="text-sm font-medium text-gray-200 truncate">{email.subject}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{format(new Date(email.sent_at), "dd. MMM yyyy, HH:mm 'Uhr'", { locale: de })}</span>
            {email.sent_to_email && (
              <span className="text-gray-600">→ {email.sent_to_email}</span>
            )}
            {stepInfo && <span className="text-gray-600">· {stepInfo.name}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {email.replied_at && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
                ✉ Geantwortet
              </span>
            )}
            {email.calendly_clicked_at && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
                📅 Calendly geklickt
              </span>
            )}
            {email.pitch_clicked_at && (
              <span className="text-xs text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                🔥 Landing-Page geklickt
              </span>
            )}
            {email.opened_at && (
              <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                Geöffnet {format(new Date(email.opened_at), "dd.MM. HH:mm", { locale: de })}
              </span>
            )}
            {email.clicked_at && !email.pitch_clicked_at && !email.calendly_clicked_at && (
              <span className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                Geklickt {format(new Date(email.clicked_at), "dd.MM. HH:mm", { locale: de })}
              </span>
            )}
            {email.bounced && (
              <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Bounce</span>
            )}
            {!email.opened_at && !email.replied_at && !email.bounced && (
              <span className="text-xs text-gray-600">Noch nicht geöffnet</span>
            )}
          </div>
        </div>
        <svg className={clsx("w-4 h-4 text-gray-600 flex-shrink-0 ml-3 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-white/5">
          <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans leading-relaxed mt-4 max-h-80 overflow-y-auto">{email.body_text}</pre>
          {email.pdf_url && (
            <a href={email.pdf_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-400 mt-3 hover:underline">
              PDF ansehen →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
