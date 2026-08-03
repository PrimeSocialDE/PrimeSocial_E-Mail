import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadStepEvent, EmailSent, EmailDraft, Newsletter, NewsletterSubscriber, PitchPage, PitchPageEvent, ReferenceRequest, GoogleReview } from "@/types";
import { localStore } from "@/lib/local-store";

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return !!(url && !url.includes("your-project") && url.startsWith("https://"));
}

let _client: SupabaseClient | null = null;
export function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  // SICHERHEIT: Bevorzugt den Service-Role-Key (serverseitig, NICHT öffentlich —
  // kein NEXT_PUBLIC-Prefix, landet daher nie im Client-Bundle). Dieser Key
  // umgeht RLS. Alle Tabellen-Zugriffe laufen ausschließlich serverseitig
  // (API-Routes + Server-Pages), daher ist das hier sicher.
  // Fallback auf den anon-key, solange der Service-Role-Key nicht gesetzt ist
  // (dann greift weiterhin die RLS-Policy für anon → nichts bricht beim Rollout).
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY!;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────
export async function getLeads(filters?: {
  segment?: string;
  status?: string;
  dueSoon?: boolean;
  step?: number;
  search?: string;
}): Promise<Lead[]> {
  if (!isSupabaseConfigured()) {
    const leads = localStore.getLeads(filters);
    await attachStepEvents(leads);
    return leads;
  }

  // Supabase default limit = 1000, wir holen alle in Batches
  const PAGE_SIZE = 1000;
  const allData: Lead[] = [];
  let from = 0;

  while (true) {
    let q = getClient()
      .from("primesocial_leads")
      .select("*")
      .order("next_touchpoint_at", { ascending: true, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);

    if (filters?.segment) q = q.eq("segment", filters.segment);
    if (filters?.status)  q = q.eq("status",  filters.status);
    if (filters?.step)    q = q.eq("workflow_step", filters.step);
    if (filters?.dueSoon) {
      const t = new Date(); t.setDate(t.getDate() + 1);
      q = q.lte("next_touchpoint_at", t.toISOString());
    }
    if (filters?.search) {
      const s = filters.search.replace(/'/g, "''");
      q = q.or(`company_name.ilike.%${s}%,email.ilike.%${s}%,contact_first_name.ilike.%${s}%,contact_last_name.ilike.%${s}%,city.ilike.%${s}%,instagram_handle.ilike.%${s}%`);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data as Lead[];
    allData.push(...rows);

    if (rows.length < PAGE_SIZE) break; // Letzte Seite
    from += PAGE_SIZE;
  }

  await attachStepEvents(allData);
  return allData;
}

// Reichert Leads mit pro-Step Versand-Status an (geöffnet / versendet / Bounce),
// damit das Dashboard die Step-Quadrate einfärben kann. Liest nur die nötigen
// Spalten aus emails_sent und verdichtet pro Lead+Step das "beste" Signal.
async function attachStepEvents(leads: Lead[]): Promise<void> {
  if (leads.length === 0) return;
  const ids = leads.map((l) => l.id);

  type RawEvent = { lead_id: string; step_number: number; sent_at: string | null; opened_at: string | null; bounced: boolean };
  const rows: RawEvent[] = [];

  if (isSupabaseConfigured()) {
    const sb = getClient();
    // .in() mit großen Listen vermeiden → in Chunks abfragen.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data, error } = await sb
        .from("emails_sent")
        .select("lead_id, step_number, sent_at, opened_at, bounced")
        .in("lead_id", chunk);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as RawEvent[]));
    }
  } else {
    for (const id of ids) {
      for (const e of localStore.getEmailsForLead(id)) {
        rows.push({ lead_id: e.lead_id, step_number: e.step_number, sent_at: e.sent_at, opened_at: e.opened_at, bounced: e.bounced });
      }
    }
  }

  const byLead = new Map<string, LeadStepEvent[]>();
  for (const r of rows) {
    const arr = byLead.get(r.lead_id) ?? [];
    let ev = arr.find((e) => e.step_number === r.step_number);
    if (!ev) { ev = { step_number: r.step_number, sent: false, opened: false, bounced: false }; arr.push(ev); }
    if (r.sent_at)  ev.sent = true;
    if (r.opened_at) ev.opened = true;
    if (r.bounced)  ev.bounced = true;
    byLead.set(r.lead_id, arr);
  }

  for (const lead of leads) lead.step_events = byLead.get(lead.id) ?? [];
}

export async function getLead(id: string): Promise<Lead> {
  if (!isSupabaseConfigured()) return localStore.getLead(id);
  const { data, error } = await getClient().from("primesocial_leads").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  if (!isSupabaseConfigured()) return localStore.updateLead(id, updates);
  const { data, error } = await getClient()
    .from("primesocial_leads")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

export async function createLead(lead: Omit<Lead, "id" | "created_at" | "updated_at">): Promise<Lead> {
  if (!isSupabaseConfigured()) return localStore.createLead(lead);
  const now = new Date().toISOString();
  const { data, error } = await getClient()
    .from("primesocial_leads")
    .insert({ ...lead, created_at: now, updated_at: now })
    .select().single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

// Komplett-Löschung eines Leads — inklusive Drafts, gesendete Mails und
// (falls vorhanden) Pitch-Page-Events. Wird vom Lead-Detail-Frontend gerufen,
// wenn der User explizit "Lead entfernen" klickt oder ein Lead per Mail das
// Löschen seiner Daten verlangt (DSGVO).
export async function deleteLead(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    localStore.deleteDraftsForLead(id);
    return;
  }
  const sb = getClient();
  // Reihenfolge wichtig: erst Child-Tabellen, dann Lead, damit keine FK-Constraints
  // greifen — selbst wenn cascade nicht überall aktiv ist.
  await sb.from("email_drafts").delete().eq("lead_id", id);
  await sb.from("emails_sent").delete().eq("lead_id", id);
  // Pitch-Page-Events haengen an pitch_pages, nicht direkt am Lead — Pitch-Page
  // wird ueber lead_id verlinkt. Erst Events, dann Pitch-Page, dann Lead.
  const { data: pitchPages } = await sb.from("pitch_pages").select("id").eq("lead_id", id);
  if (pitchPages && pitchPages.length > 0) {
    const pageIds = pitchPages.map((p) => p.id);
    await sb.from("pitch_page_events").delete().in("pitch_page_id", pageIds);
    await sb.from("pitch_pages").delete().eq("lead_id", id);
  }
  const { error } = await sb.from("primesocial_leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Emails Sent
// ─────────────────────────────────────────────
export async function getEmailsForLead(leadId: string): Promise<EmailSent[]> {
  if (!isSupabaseConfigured()) return localStore.getEmailsForLead(leadId);
  const { data, error } = await getClient()
    .from("emails_sent").select("*")
    .eq("lead_id", leadId).order("sent_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as EmailSent[];
}

export async function saveEmailSent(email: Omit<EmailSent, "id">): Promise<EmailSent> {
  if (!isSupabaseConfigured()) return localStore.saveEmailSent(email);
  const { data, error } = await getClient()
    .from("emails_sent").insert(email).select().single();
  if (error) throw new Error(error.message);
  return data as EmailSent;
}

export async function updateEmailSent(id: string, updates: Partial<EmailSent>): Promise<void> {
  if (!isSupabaseConfigured()) { localStore.updateEmailSent(id, updates); return; }
  await getClient().from("emails_sent").update(updates).eq("id", id);
}

// ─────────────────────────────────────────────
// Email Drafts
// ─────────────────────────────────────────────
export async function getDraftsForLead(leadId: string): Promise<EmailDraft[]> {
  if (!isSupabaseConfigured()) return localStore.getDraftsForLead(leadId);
  const { data, error } = await getClient()
    .from("email_drafts").select("*")
    .eq("lead_id", leadId).order("step_number");
  if (error) throw new Error(error.message);
  return data as EmailDraft[];
}

export async function getDraft(id: string): Promise<EmailDraft | null> {
  if (!isSupabaseConfigured()) return localStore.getDraft(id);
  const { data } = await getClient().from("email_drafts").select("*").eq("id", id).single();
  return data as EmailDraft | null;
}

export async function saveDraft(draft: Omit<EmailDraft, "id" | "created_at">): Promise<EmailDraft> {
  if (!isSupabaseConfigured()) return localStore.saveDraft(draft);
  const { data, error } = await getClient()
    .from("email_drafts").insert({ ...draft, created_at: new Date().toISOString() }).select().single();
  if (error) throw new Error(error.message);
  return data as EmailDraft;
}

export async function updateDraft(id: string, updates: Partial<EmailDraft>): Promise<EmailDraft> {
  if (!isSupabaseConfigured()) return localStore.updateDraft(id, updates);
  const { data, error } = await getClient()
    .from("email_drafts").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as EmailDraft;
}

export async function deleteDraftsForLead(leadId: string): Promise<void> {
  if (!isSupabaseConfigured()) { localStore.deleteDraftsForLead(leadId); return; }
  await getClient().from("email_drafts")
    .delete().eq("lead_id", leadId).neq("status", "sent");
}

export async function cancelPendingDrafts(leadId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getClient().from("email_drafts")
    .update({ status: "cancelled" })
    .eq("lead_id", leadId)
    .eq("status", "pending");
}

export async function getPendingDrafts(): Promise<EmailDraft[]> {
  if (!isSupabaseConfigured()) return localStore.getPendingDrafts();
  const now = new Date().toISOString();
  const { data, error } = await getClient()
    .from("email_drafts").select("*")
    .eq("status", "pending").lte("scheduled_for", now);
  if (error) throw new Error(error.message);
  return data as EmailDraft[];
}

// ─────────────────────────────────────────────
// Dashboard-ToDos (Hot-Signal-Reaktionen)
// ─────────────────────────────────────────────
import type { DashboardTodo, DashboardTodoType, DashboardTodoSource } from "@/types";

export async function createDashboardTodo(input: {
  lead_id: string;
  type: DashboardTodoType;
  email_id?: string | null;
  source: DashboardTodoSource;
  triggered_at?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return; // local-store: kein ToDo-Tracking — UI-only flow
  const sb = getClient();
  // upsert mit onConflict ignoriert Dupletten — falls Brevo denselben Klick
  // zweimal feuert, kein neuer ToDo. Wichtig: COALESCE-Schlüssel im UNIQUE-Index
  // matcht die echte (lead_id, type, email_id)-Kombo.
  const { error } = await sb.from("dashboard_todos").upsert(
    {
      lead_id:      input.lead_id,
      type:         input.type,
      email_id:     input.email_id ?? null,
      source:       input.source,
      triggered_at: input.triggered_at ?? new Date().toISOString(),
    },
    { onConflict: "lead_id,type,email_id", ignoreDuplicates: true },
  );
  if (error) {
    // Tabelle existiert noch nicht oder Constraint-Konflikt → Webhook nicht
    // crashen lassen. Klick-Signal selbst (emails_sent.pitch_clicked_at) ist
    // schon gespeichert, das hier ist nur die ToDo-Box.
    console.error("[createDashboardTodo] supabase error, ignored:", error.message);
  }
}

export interface DashboardTodoWithLead extends DashboardTodo {
  lead: {
    id: string;
    company_name: string;
    contact_first_name: string | null;
    segment: string | null;
    pitch_lead_type: string | null;
  };
  email_step: number | null;     // welcher Step der Mail (falls aus email)
}

export async function getOpenTodos(): Promise<DashboardTodoWithLead[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getClient();
  // Join: Lead + Step der zugehörigen Mail (falls vorhanden).
  // Supabase nested select: dashboard_todos → primesocial_leads + emails_sent.
  const { data, error } = await sb
    .from("dashboard_todos")
    .select(`
      *,
      lead:primesocial_leads!inner (id, company_name, contact_first_name, segment, pitch_lead_type),
      email:emails_sent (step_number)
    `)
    .is("completed_at", null)
    .order("triggered_at", { ascending: false })
    .limit(100);
  if (error) {
    // Tabelle existiert noch nicht (Migration noch nicht ausgeführt) → leeres
    // Dashboard statt Crash. Selbe Fail-Safe-Strategie wie bei getHotLeads.
    console.error("[getOpenTodos] supabase error, returning empty:", error.message);
    return [];
  }
  return (data ?? []).map((row: { email?: { step_number: number } | null; [key: string]: unknown }) => ({
    ...(row as unknown as DashboardTodoWithLead),
    email_step: row.email?.step_number ?? null,
  }));
}

export async function setTodoCompleted(id: string, completed: boolean): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getClient();
  const { error } = await sb
    .from("dashboard_todos")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Newsletter
// ─────────────────────────────────────────────
export async function getNewsletters(): Promise<Newsletter[]> {
  if (!isSupabaseConfigured()) return localStore.getNewsletters();
  const { data, error } = await getClient()
    .from("newsletters").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Newsletter[];
}

export async function getNewsletter(id: string): Promise<Newsletter | null> {
  if (!isSupabaseConfigured()) return localStore.getNewsletter(id);
  const { data } = await getClient().from("newsletters").select("*").eq("id", id).single();
  return data as Newsletter | null;
}

export async function saveNewsletter(nl: Omit<Newsletter, "id" | "created_at">): Promise<Newsletter> {
  if (!isSupabaseConfigured()) return localStore.saveNewsletter(nl);
  const { data, error } = await getClient()
    .from("newsletters").insert({ ...nl, created_at: new Date().toISOString() }).select().single();
  if (error) throw new Error(error.message);
  return data as Newsletter;
}

export async function updateNewsletter(id: string, updates: Partial<Newsletter>): Promise<Newsletter> {
  if (!isSupabaseConfigured()) return localStore.updateNewsletter(id, updates);
  const { data, error } = await getClient()
    .from("newsletters").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Newsletter;
}

// ─────────────────────────────────────────────
// Newsletter Subscribers
// ─────────────────────────────────────────────
export async function getSubscribers(): Promise<NewsletterSubscriber[]> {
  if (!isSupabaseConfigured()) return localStore.getSubscribers();
  const { data, error } = await getClient()
    .from("newsletter_subscribers").select("*").is("unsubscribed_at", null);
  if (error) throw new Error(error.message);
  return data as NewsletterSubscriber[];
}

export async function addSubscriber(sub: Omit<NewsletterSubscriber, "id" | "subscribed_at"> & { subscribed_at?: string }): Promise<NewsletterSubscriber> {
  if (!isSupabaseConfigured()) return localStore.addSubscriber(sub);
  const { data, error } = await getClient()
    .from("newsletter_subscribers")
    .upsert({ ...sub, subscribed_at: sub.subscribed_at ?? new Date().toISOString(), unsubscribed_at: null }, { onConflict: "email" })
    .select().single();
  if (error) throw new Error(error.message);
  return data as NewsletterSubscriber;
}

export async function unsubscribeByEmail(email: string): Promise<void> {
  if (!isSupabaseConfigured()) { localStore.unsubscribeByEmail(email); return; }
  const now = new Date().toISOString();
  await Promise.all([
    getClient().from("newsletter_subscribers").update({ unsubscribed_at: now }).eq("email", email),
    getClient().from("primesocial_leads").update({ status: "unsubscribed", updated_at: now }).eq("email", email),
  ]);
}

export async function getSubscriberByEmail(email: string): Promise<NewsletterSubscriber | null> {
  if (!isSupabaseConfigured()) return localStore.getSubscriberByEmail(email);
  const { data } = await getClient().from("newsletter_subscribers").select("*").eq("email", email).single();
  return data as NewsletterSubscriber | null;
}

// ─────────────────────────────────────────────
// Prompt Overrides
// ─────────────────────────────────────────────
export async function getPromptOverride(segment: string, step: number): Promise<string | null> {
  if (!isSupabaseConfigured()) return localStore.getPromptOverride(segment, step);
  const { data } = await getClient()
    .from("prompt_overrides")
    .select("rules")
    .eq("segment", segment)
    .eq("step", step)
    .single();
  return (data as { rules: string } | null)?.rules ?? null;
}

export async function setPromptOverride(segment: string, step: number, rules: string): Promise<void> {
  if (!isSupabaseConfigured()) { localStore.setPromptOverride(segment, step, rules); return; }
  await getClient()
    .from("prompt_overrides")
    .upsert({ segment, step, rules, updated_at: new Date().toISOString() }, { onConflict: "segment,step" });
}

export async function getSegmentWorkflowStats(segment: string): Promise<{
  leads: { total: number; active: number; replied: number; converted: number };
  steps: Record<number, { sent: number; opened: number; clicked: number; bounced: number }>;
}> {
  if (!isSupabaseConfigured()) return localStore.getSegmentWorkflowStats(segment);
  const db = getClient();
  const { data: leads } = await db.from("primesocial_leads").select("id,status").eq("segment", segment);
  const leadIds = (leads ?? []).map((l: { id: string }) => l.id);

  const steps: Record<number, { sent: number; opened: number; clicked: number; bounced: number }> = {};
  if (leadIds.length > 0) {
    const { data: emails } = await db
      .from("emails_sent")
      .select("step_number,opened_at,clicked_at,bounced")
      .in("lead_id", leadIds);
    for (const e of emails ?? []) {
      const s = e.step_number as number;
      if (!steps[s]) steps[s] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
      steps[s].sent++;
      if (e.opened_at) steps[s].opened++;
      if (e.clicked_at) steps[s].clicked++;
      if (e.bounced) steps[s].bounced++;
    }
  }
  const allLeads = leads ?? [];
  return {
    leads: {
      total: allLeads.length,
      active: allLeads.filter((l: { status: string }) => l.status === "active").length,
      replied: allLeads.filter((l: { status: string }) => l.status === "replied").length,
      converted: allLeads.filter((l: { status: string }) => l.status === "converted").length,
    },
    steps,
  };
}

// ─────────────────────────────────────────────
// Pitch Pages
// ─────────────────────────────────────────────
export async function getPitchPage(id: string): Promise<PitchPage | null> {
  if (!isSupabaseConfigured()) return localStore.getPitchPage(id);
  const { data } = await getClient().from("pitch_pages").select("*").eq("id", id).single();
  return data as PitchPage | null;
}

export async function getPitchPageBySlug(slug: string): Promise<PitchPage | null> {
  if (!isSupabaseConfigured()) return localStore.getPitchPageBySlug(slug);
  const { data } = await getClient().from("pitch_pages").select("*").eq("slug", slug).single();
  return data as PitchPage | null;
}

export async function getPitchPageByLeadId(leadId: string): Promise<PitchPage | null> {
  if (!isSupabaseConfigured()) return localStore.getPitchPageByLeadId(leadId);
  const { data } = await getClient().from("pitch_pages").select("*").eq("lead_id", leadId).limit(1).maybeSingle();
  return data as PitchPage | null;
}

export async function createPitchPage(
  page: Omit<PitchPage, "id" | "created_at" | "updated_at" | "views" | "last_viewed_at" | "total_scroll_depth" | "cta_clicks">,
): Promise<PitchPage> {
  if (!isSupabaseConfigured()) return localStore.createPitchPage(page);
  const now = new Date().toISOString();
  const { data, error } = await getClient()
    .from("pitch_pages")
    .insert({
      ...page,
      views: 0,
      total_scroll_depth: 0,
      cta_clicks: 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PitchPage;
}

export async function updatePitchPage(id: string, updates: Partial<PitchPage>): Promise<PitchPage> {
  if (!isSupabaseConfigured()) return localStore.updatePitchPage(id, updates);
  const { data, error } = await getClient()
    .from("pitch_pages")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PitchPage;
}

export async function savePitchPageEvent(
  event: Omit<PitchPageEvent, "id" | "created_at">,
): Promise<PitchPageEvent> {
  if (!isSupabaseConfigured()) return localStore.savePitchPageEvent(event);
  const { data, error } = await getClient()
    .from("pitch_page_events")
    .insert({ ...event, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PitchPageEvent;
}

export async function getPitchPageEvents(pitchPageId: string): Promise<PitchPageEvent[]> {
  if (!isSupabaseConfigured()) return localStore.getPitchPageEvents(pitchPageId);
  const { data, error } = await getClient()
    .from("pitch_page_events")
    .select("*")
    .eq("pitch_page_id", pitchPageId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as PitchPageEvent[];
}

export async function incrementPitchPageStats(
  id: string,
  delta: { views?: number; scrollDepth?: number; ctaClicks?: number; touchViewedAt?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured()) { localStore.incrementPitchPageStats(id, delta); return; }
  const db = getClient();
  // Lesend + schreibend (atomar nicht verfügbar ohne RPC) — ausreichend für Tracking
  const { data } = await db.from("pitch_pages").select("views,total_scroll_depth,cta_clicks").eq("id", id).single();
  const row = data as { views: number; total_scroll_depth: number; cta_clicks: number } | null;
  if (!row) return;
  const updates: Record<string, unknown> = {
    views: row.views + (delta.views ?? 0),
    total_scroll_depth: row.total_scroll_depth + (delta.scrollDepth ?? 0),
    cta_clicks: row.cta_clicks + (delta.ctaClicks ?? 0),
    updated_at: new Date().toISOString(),
  };
  if (delta.touchViewedAt) updates.last_viewed_at = new Date().toISOString();
  await db.from("pitch_pages").update(updates).eq("id", id);
}

// ─────────────────────────────────────────────
// Google Reviews (Sektion auf Pitch-Seite v2)
// ─────────────────────────────────────────────
export async function getActiveGoogleReviews(): Promise<GoogleReview[]> {
  if (!isSupabaseConfigured()) return localStore.getActiveGoogleReviews();
  const { data, error } = await getClient()
    .from("google_reviews")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data as GoogleReview[];
}

export async function getAllGoogleReviews(): Promise<GoogleReview[]> {
  if (!isSupabaseConfigured()) return localStore.getAllGoogleReviews();
  const { data, error } = await getClient()
    .from("google_reviews")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data as GoogleReview[];
}

export async function saveGoogleReview(
  review: Omit<GoogleReview, "id" | "created_at">,
): Promise<GoogleReview> {
  if (!isSupabaseConfigured()) return localStore.saveGoogleReview(review);
  const { data, error } = await getClient()
    .from("google_reviews")
    .insert({ ...review, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as GoogleReview;
}

// Idempotenter Upsert basierend auf reviewer_name — fürs Seed-Script
export async function upsertGoogleReviewByName(
  review: Omit<GoogleReview, "id" | "created_at">,
): Promise<GoogleReview> {
  if (!isSupabaseConfigured()) return localStore.upsertGoogleReviewByName(review);
  // Existierende suchen
  const { data: existing } = await getClient()
    .from("google_reviews")
    .select("*")
    .eq("reviewer_name", review.reviewer_name)
    .maybeSingle();
  if (existing) {
    const { data, error } = await getClient()
      .from("google_reviews")
      .update(review)
      .eq("id", (existing as { id: string }).id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as GoogleReview;
  }
  return saveGoogleReview(review);
}

// ─────────────────────────────────────────────
// Reference Requests (Formular auf /r/[slug])
// ─────────────────────────────────────────────
export async function saveReferenceRequest(
  req: Omit<ReferenceRequest, "id" | "created_at">,
): Promise<ReferenceRequest> {
  if (!isSupabaseConfigured()) return localStore.saveReferenceRequest(req);
  const { data, error } = await getClient()
    .from("reference_requests")
    .insert({ ...req, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ReferenceRequest;
}

export async function getReferenceRequests(): Promise<ReferenceRequest[]> {
  if (!isSupabaseConfigured()) return localStore.getReferenceRequests();
  const { data, error } = await getClient()
    .from("reference_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as ReferenceRequest[];
}

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────
export interface DashboardStats {
  totalLeads: number;
  openRate: number;
  dueLeads: number;
  // Fortschritts-Übersicht (was wo gerade steht):
  segmented:   number;   // hat ein Segment (egal welches)
  inWorkflow:  number;   // bekommt aktuell Mails: mail-eligible Segment + status='active'
  onRadar:     number;   // wartet auf 90-Tage-Re-Scrape: INAKTIV / VIRALAUSREISSER / WENIGREICHWEITE (bekommen aktuell keine Mails)
  inRetry:     number;   // Apify- oder Summary-Retry aktiv (scrape_attempts oder summary_attempts > 0, < 3)
  outComplete: number;   // komplett raus: KEININSTAGRAM/KEINSUMMARY/KEINFIT oder bounced/unsubscribed
  // Hot signals (für Dashboard-Banner)
  replied: number;
  calendlyBooked: number;
  pitchCtaClicked: number;
  pitchVisited: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (!isSupabaseConfigured()) return localStore.getDashboardStats();

  const db = getClient();

  // Leads in Batches holen (> 1000)
  const allLeads: {
    id: string;
    status: string;
    next_touchpoint_at: string | null;
    segment: string | null;
    scrape_attempts: number | null;
    summary_attempts: number | null;
    pitch_visited_at: string | null;
    pitch_cta_clicked_at: string | null;
    calendly_booked_at: string | null;
  }[] = [];
  let from = 0;
  while (true) {
    const { data } = await db
      .from("primesocial_leads")
      .select("id,status,next_touchpoint_at,segment,scrape_attempts,summary_attempts,pitch_visited_at,pitch_cta_clicked_at,calendly_booked_at")
      .range(from, from + 999);
    const rows = data ?? [];
    allLeads.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }

  // Open Rate = geöffnete Mails / alle ZUGESTELLTEN Mails (Overall-Rate).
  // Gebouncte Mails zählen nicht als zugestellt → aus dem Nenner raus.
  // Ein Link-Klick zählt als Öffnung (Brevo feuert das Open-Pixel nicht immer,
  // ein Klick beweist aber das Öffnen). Mehrfach-Öffnungen/-Klicks zählen pro
  // Mail nur einmal, da opened_at/clicked_at je Mail nur ein Zeitstempel ist.
  const [delivered, openedOrClicked] = await Promise.all([
    db.from("emails_sent").select("id", { count: "exact", head: true }).not("bounced", "is", true),
    db.from("emails_sent").select("id", { count: "exact", head: true }).or("opened_at.not.is.null,clicked_at.not.is.null"),
  ]);
  const now = new Date();

  const WORKFLOW_SEGMENTS = new Set(["INKONSISTENT", "KEINEVIDEO", "SOLIDE"]);
  const RADAR_WATCH_SEGMENTS = new Set(["INAKTIV", "VIRALAUSREISSER", "WENIGREICHWEITE"]);
  const OUT_SEGMENTS         = new Set(["KEININSTAGRAM", "KEINSUMMARY", "KEINFIT"]);

  return {
    totalLeads:   allLeads.length,
    openRate:     (delivered.count ?? 0) > 0
      ? Math.round(((openedOrClicked.count ?? 0) / (delivered.count ?? 1)) * 100)
      : 0,
    dueLeads:     allLeads.filter((l) => l.next_touchpoint_at && new Date(l.next_touchpoint_at) <= now).length,
    segmented:    allLeads.filter((l) => l.segment != null).length,
    inWorkflow:   allLeads.filter((l) => l.status === "active" && l.segment && WORKFLOW_SEGMENTS.has(l.segment)).length,
    onRadar:      allLeads.filter((l) => l.segment && RADAR_WATCH_SEGMENTS.has(l.segment)).length,
    inRetry:      allLeads.filter((l) => {
      const sa = l.scrape_attempts ?? 0;
      const su = l.summary_attempts ?? 0;
      return (sa > 0 && sa < 3) || (su > 0 && su < 3);
    }).length,
    outComplete:  allLeads.filter((l) =>
      (l.segment && OUT_SEGMENTS.has(l.segment)) ||
      l.status === "bounced" ||
      l.status === "unsubscribed"
    ).length,
    replied:         allLeads.filter((l) => l.status === "replied").length,
    calendlyBooked:  allLeads.filter((l) => l.calendly_booked_at != null).length,
    pitchCtaClicked: allLeads.filter((l) => l.pitch_cta_clicked_at != null).length,
    pitchVisited:    allLeads.filter((l) => l.pitch_visited_at != null).length,
  };
}

// Hot-Leads: alle Leads mit einem positiven Signal, sortiert nach Priorität
// (Calendly > Reply > CTA-Klick > Pitch-Visit) und Recency.
// Wird im Dashboard ganz oben angezeigt — das sind die warmen Leads.
export async function getHotLeads(): Promise<(Lead & { hotSignal: string; signalAt: string })[]> {
  if (!isSupabaseConfigured()) return [];
  const db = getClient();
  const { data } = await db
    .from("primesocial_leads")
    .select("*")
    .or("calendly_booked_at.not.is.null,pitch_cta_clicked_at.not.is.null,pitch_visited_at.not.is.null,status.eq.replied")
    .limit(50);
  if (!data) return [];

  // Priorität: Calendly > Reply > CTA > Pitch-Visit
  const annotated = data.map((l) => {
    if (l.calendly_booked_at)   return { ...l, hotSignal: "calendly_booked",   signalAt: l.calendly_booked_at,   priority: 4 };
    if (l.status === "replied") return { ...l, hotSignal: "replied",           signalAt: l.updated_at ?? l.created_at, priority: 3 };
    if (l.pitch_cta_clicked_at) return { ...l, hotSignal: "pitch_cta_clicked", signalAt: l.pitch_cta_clicked_at, priority: 2 };
    if (l.pitch_visited_at)     return { ...l, hotSignal: "pitch_visited",     signalAt: l.pitch_visited_at,     priority: 1 };
    return null;
  }).filter((l): l is NonNullable<typeof l> => l != null);

  // Sort: höhere Priorität zuerst, dann neueres Signal zuerst
  annotated.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(b.signalAt).getTime() - new Date(a.signalAt).getTime();
  });

  return annotated.map(({ priority: _p, ...rest }) => rest);
}
