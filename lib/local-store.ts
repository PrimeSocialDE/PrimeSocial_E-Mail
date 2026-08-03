import fs from "fs";
import path from "path";
import type { Lead, EmailSent, EmailDraft, Newsletter, NewsletterSubscriber, PitchPage, PitchPageEvent, ReferenceRequest, GoogleReview } from "@/types";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

interface DB {
  leads: Lead[];
  emails_sent: EmailSent[];
  email_drafts: EmailDraft[];
  newsletters: Newsletter[];
  newsletter_subscribers: NewsletterSubscriber[];
  prompt_overrides: Record<string, string>;
  pitch_pages: PitchPage[];
  pitch_page_events: PitchPageEvent[];
  reference_requests: ReferenceRequest[];
  google_reviews: GoogleReview[];
}

function readDB(): DB {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Partial<DB>;
    return {
      leads: raw.leads ?? [],
      emails_sent: raw.emails_sent ?? [],
      email_drafts: raw.email_drafts ?? [],
      newsletters: raw.newsletters ?? [],
      newsletter_subscribers: raw.newsletter_subscribers ?? [],
      prompt_overrides: raw.prompt_overrides ?? {},
      pitch_pages: raw.pitch_pages ?? [],
      pitch_page_events: raw.pitch_page_events ?? [],
      reference_requests: raw.reference_requests ?? [],
      google_reviews: raw.google_reviews ?? [],
    };
  } catch {
    return { leads: [], emails_sent: [], email_drafts: [], newsletters: [], newsletter_subscribers: [], prompt_overrides: {}, pitch_pages: [], pitch_page_events: [], reference_requests: [], google_reviews: [] };
  }
}

function writeDB(db: DB): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export const localStore = {
  // ── Leads ──────────────────────────────────────────────────────
  getLeads(filters?: {
    segment?: string;
    status?: string;
    dueSoon?: boolean;
    step?: number;
    search?: string;
  }): Lead[] {
    const db = readDB();
    let leads = [...db.leads];
    if (filters?.segment) leads = leads.filter((l) => l.segment === filters.segment);
    if (filters?.status)  leads = leads.filter((l) => l.status  === filters.status);
    if (filters?.step)    leads = leads.filter((l) => l.workflow_step === filters.step);
    if (filters?.dueSoon) {
      const t = new Date(); t.setDate(t.getDate() + 1);
      leads = leads.filter((l) => l.next_touchpoint_at && new Date(l.next_touchpoint_at) <= t);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      leads = leads.filter((l) =>
        l.company_name.toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q) ||
        (l.contact_first_name ?? "").toLowerCase().includes(q) ||
        (l.contact_last_name ?? "").toLowerCase().includes(q) ||
        (l.contact_name ?? "").toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q) ||
        (l.instagram_handle ?? "").toLowerCase().includes(q)
      );
    }
    return leads.sort((a, b) => {
      if (!a.next_touchpoint_at) return 1;
      if (!b.next_touchpoint_at) return -1;
      return new Date(a.next_touchpoint_at).getTime() - new Date(b.next_touchpoint_at).getTime();
    });
  },

  getLead(id: string): Lead {
    const l = readDB().leads.find((l) => l.id === id);
    if (!l) throw new Error(`Lead "${id}" nicht gefunden`);
    return l;
  },

  updateLead(id: string, updates: Partial<Lead>): Lead {
    const db = readDB();
    const i = db.leads.findIndex((l) => l.id === id);
    if (i === -1) throw new Error(`Lead "${id}" nicht gefunden`);
    db.leads[i] = { ...db.leads[i], ...updates, updated_at: new Date().toISOString() };
    writeDB(db);
    return db.leads[i];
  },

  createLead(lead: Omit<Lead, "id" | "created_at" | "updated_at">): Lead {
    const db = readDB();
    const now = new Date().toISOString();
    const newLead: Lead = { ...lead, id: `local-${Date.now()}`, created_at: now, updated_at: now };
    db.leads.push(newLead);
    writeDB(db);
    return newLead;
  },

  // ── Emails Sent ─────────────────────────────────────────────────
  getEmailsForLead(leadId: string): EmailSent[] {
    return readDB().emails_sent
      .filter((e) => e.lead_id === leadId)
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  },

  saveEmailSent(email: Omit<EmailSent, "id">): EmailSent {
    const db = readDB();
    const e: EmailSent = { ...email, id: `email-${Date.now()}` };
    db.emails_sent.push(e);
    writeDB(db);
    return e;
  },

  findEmailByMessageId(messageId: string): { id: string; lead_id: string } | null {
    const e = readDB().emails_sent.find((e) => e.brevo_message_id === messageId);
    return e ? { id: e.id, lead_id: e.lead_id } : null;
  },

  unsubscribeLeadByEmail(email: string): void {
    const db = readDB();
    const lead = db.leads.find((l) => l.email?.toLowerCase() === email.toLowerCase());
    if (lead) {
      const i = db.leads.findIndex((l) => l.id === lead.id);
      db.leads[i] = { ...db.leads[i], status: "unsubscribed", updated_at: new Date().toISOString() };
      writeDB(db);
    }
  },

  updateEmailSent(id: string, updates: Partial<EmailSent>): void {
    const db = readDB();
    const i = db.emails_sent.findIndex((e) => e.id === id);
    if (i >= 0) { db.emails_sent[i] = { ...db.emails_sent[i], ...updates }; writeDB(db); }
  },

  // ── Email Drafts ────────────────────────────────────────────────
  getDraftsForLead(leadId: string): EmailDraft[] {
    return readDB().email_drafts
      .filter((d) => d.lead_id === leadId)
      .sort((a, b) => a.step_number - b.step_number);
  },

  getDraft(id: string): EmailDraft | null {
    return readDB().email_drafts.find((d) => d.id === id) ?? null;
  },

  saveDraft(draft: Omit<EmailDraft, "id" | "created_at">): EmailDraft {
    const db = readDB();
    const now = new Date().toISOString();
    const d: EmailDraft = { ...draft, id: `draft-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, created_at: now };
    db.email_drafts.push(d);
    writeDB(db);
    return d;
  },

  updateDraft(id: string, updates: Partial<EmailDraft>): EmailDraft {
    const db = readDB();
    const i = db.email_drafts.findIndex((d) => d.id === id);
    if (i === -1) throw new Error(`Draft "${id}" nicht gefunden`);
    db.email_drafts[i] = { ...db.email_drafts[i], ...updates };
    writeDB(db);
    return db.email_drafts[i];
  },

  deleteDraftsForLead(leadId: string): void {
    const db = readDB();
    db.email_drafts = db.email_drafts.filter((d) => d.lead_id !== leadId || d.status === "sent");
    writeDB(db);
  },

  getPendingDrafts(): EmailDraft[] {
    const now = new Date().toISOString();
    return readDB().email_drafts.filter(
      (d) => d.status === "pending" && d.scheduled_for <= now
    );
  },

  // ── Newsletter ──────────────────────────────────────────────────
  getNewsletters(): Newsletter[] {
    return readDB().newsletters.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  getNewsletter(id: string): Newsletter | null {
    return readDB().newsletters.find((n) => n.id === id) ?? null;
  },

  saveNewsletter(newsletter: Omit<Newsletter, "id" | "created_at">): Newsletter {
    const db = readDB();
    const n: Newsletter = { ...newsletter, id: `nl-${Date.now()}`, created_at: new Date().toISOString() };
    db.newsletters.push(n);
    writeDB(db);
    return n;
  },

  updateNewsletter(id: string, updates: Partial<Newsletter>): Newsletter {
    const db = readDB();
    const i = db.newsletters.findIndex((n) => n.id === id);
    if (i === -1) throw new Error(`Newsletter "${id}" nicht gefunden`);
    db.newsletters[i] = { ...db.newsletters[i], ...updates };
    writeDB(db);
    return db.newsletters[i];
  },

  // ── Newsletter Subscribers ──────────────────────────────────────
  getSubscribers(): NewsletterSubscriber[] {
    return readDB().newsletter_subscribers.filter((s) => !s.unsubscribed_at);
  },

  getSubscriberByEmail(email: string): NewsletterSubscriber | null {
    return readDB().newsletter_subscribers.find((s) => s.email === email) ?? null;
  },

  addSubscriber(sub: Omit<NewsletterSubscriber, "id" | "subscribed_at">): NewsletterSubscriber {
    const db = readDB();
    const existing = db.newsletter_subscribers.findIndex((s) => s.email === sub.email);
    if (existing >= 0) {
      // Reaktivieren wenn vorher abgemeldet
      db.newsletter_subscribers[existing].unsubscribed_at = null;
      writeDB(db);
      return db.newsletter_subscribers[existing];
    }
    const s: NewsletterSubscriber = { ...sub, id: `sub-${Date.now()}`, subscribed_at: new Date().toISOString() };
    db.newsletter_subscribers.push(s);
    writeDB(db);
    return s;
  },

  unsubscribeByEmail(email: string): void {
    const db = readDB();
    const i = db.newsletter_subscribers.findIndex((s) => s.email === email);
    if (i >= 0) {
      db.newsletter_subscribers[i].unsubscribed_at = new Date().toISOString();
      writeDB(db);
    }
    // Auch Lead auf unsubscribed setzen
    const li = db.leads.findIndex((l) => l.email === email);
    if (li >= 0) {
      db.leads[li].status = "unsubscribed";
      db.leads[li].updated_at = new Date().toISOString();
      writeDB(db);
    }
  },

  // ── Stats ───────────────────────────────────────────────────────
  getDashboardStats() {
    const db = readDB();
    const now = new Date();

    // Open Rate = geöffnete (oder geklickte) Mails / alle ZUGESTELLTEN Mails.
    // Bounces zählen nicht als zugestellt. Ein Klick zählt als Öffnung; pro Mail
    // max. einmal (ein Zeitstempel je Mail).
    const delivered = db.emails_sent.filter((e) => !e.bounced).length;
    const opened = db.emails_sent.filter((e) => e.opened_at || e.clicked_at);

    const WORKFLOW = new Set(["INKONSISTENT", "KEINEVIDEO", "SOLIDE"]);
    const WATCH    = new Set(["INAKTIV", "VIRALAUSREISSER", "WENIGREICHWEITE"]);
    const OUT      = new Set(["KEININSTAGRAM", "KEINSUMMARY", "KEINFIT"]);

    return {
      totalLeads:    db.leads.length,
      openRate:      delivered > 0
        ? Math.round((opened.length / delivered) * 100)
        : 0,
      dueLeads:      db.leads.filter(
        (l) => l.next_touchpoint_at && new Date(l.next_touchpoint_at) <= now
      ).length,
      segmented:     db.leads.filter((l) => l.segment != null).length,
      inWorkflow:    db.leads.filter((l) => l.status === "active" && l.segment && WORKFLOW.has(l.segment)).length,
      onRadar:       db.leads.filter((l) => l.segment && WATCH.has(l.segment)).length,
      inRetry:       db.leads.filter((l) => {
        const sa = (l as { scrape_attempts?: number }).scrape_attempts ?? 0;
        const su = (l as { summary_attempts?: number }).summary_attempts ?? 0;
        return (sa > 0 && sa < 3) || (su > 0 && su < 3);
      }).length,
      outComplete:   db.leads.filter((l) =>
        (l.segment && OUT.has(l.segment)) || l.status === "bounced" || l.status === "unsubscribed"
      ).length,
      replied:         db.leads.filter((l) => l.status === "replied").length,
      calendlyBooked:  db.leads.filter((l) => (l as { calendly_booked_at?: string | null }).calendly_booked_at != null).length,
      pitchCtaClicked: db.leads.filter((l) => (l as { pitch_cta_clicked_at?: string | null }).pitch_cta_clicked_at != null).length,
      pitchVisited:    db.leads.filter((l) => (l as { pitch_visited_at?: string | null }).pitch_visited_at != null).length,
    };
  },

  // ── Prompt Overrides ────────────────────────────────────────────
  getPromptOverride(segment: string, step: number): string | null {
    return readDB().prompt_overrides[`${segment}_${step}`] ?? null;
  },

  setPromptOverride(segment: string, step: number, rules: string): void {
    const db = readDB();
    db.prompt_overrides[`${segment}_${step}`] = rules;
    writeDB(db);
  },

  // ── Pitch Pages ─────────────────────────────────────────────────
  getPitchPage(id: string): PitchPage | null {
    return readDB().pitch_pages.find((p) => p.id === id) ?? null;
  },

  getPitchPageBySlug(slug: string): PitchPage | null {
    return readDB().pitch_pages.find((p) => p.slug === slug) ?? null;
  },

  getPitchPageByLeadId(leadId: string): PitchPage | null {
    return readDB().pitch_pages.find((p) => p.lead_id === leadId) ?? null;
  },

  createPitchPage(page: Omit<PitchPage, "id" | "created_at" | "updated_at" | "views" | "last_viewed_at" | "total_scroll_depth" | "cta_clicks">): PitchPage {
    const db = readDB();
    const now = new Date().toISOString();
    const newPage: PitchPage = {
      ...page,
      id: `pitch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      views: 0,
      last_viewed_at: null,
      total_scroll_depth: 0,
      cta_clicks: 0,
      created_at: now,
      updated_at: now,
    };
    db.pitch_pages.push(newPage);
    writeDB(db);
    return newPage;
  },

  updatePitchPage(id: string, updates: Partial<PitchPage>): PitchPage {
    const db = readDB();
    const i = db.pitch_pages.findIndex((p) => p.id === id);
    if (i === -1) throw new Error(`PitchPage "${id}" nicht gefunden`);
    db.pitch_pages[i] = { ...db.pitch_pages[i], ...updates, updated_at: new Date().toISOString() };
    writeDB(db);
    return db.pitch_pages[i];
  },

  savePitchPageEvent(event: Omit<PitchPageEvent, "id" | "created_at">): PitchPageEvent {
    const db = readDB();
    const e: PitchPageEvent = {
      ...event,
      id: `pev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    db.pitch_page_events.push(e);
    writeDB(db);
    return e;
  },

  getPitchPageEvents(pitchPageId: string): PitchPageEvent[] {
    return readDB().pitch_page_events
      .filter((e) => e.pitch_page_id === pitchPageId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // ── Google Reviews ───────────────────────────────────────────────
  getActiveGoogleReviews(): GoogleReview[] {
    return readDB().google_reviews
      .filter((r) => r.is_active)
      .sort((a, b) => a.display_order - b.display_order);
  },

  getAllGoogleReviews(): GoogleReview[] {
    return readDB().google_reviews
      .sort((a, b) => a.display_order - b.display_order);
  },

  saveGoogleReview(review: Omit<GoogleReview, "id" | "created_at">): GoogleReview {
    const db = readDB();
    const r: GoogleReview = {
      ...review,
      id: `gr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    db.google_reviews.push(r);
    writeDB(db);
    return r;
  },

  upsertGoogleReviewByName(review: Omit<GoogleReview, "id" | "created_at">): GoogleReview {
    const db = readDB();
    const idx = db.google_reviews.findIndex((r) => r.reviewer_name === review.reviewer_name);
    if (idx >= 0) {
      db.google_reviews[idx] = { ...db.google_reviews[idx], ...review };
      writeDB(db);
      return db.google_reviews[idx];
    }
    const r: GoogleReview = {
      ...review,
      id: `gr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    db.google_reviews.push(r);
    writeDB(db);
    return r;
  },

  // ── Reference Requests ───────────────────────────────────────────
  saveReferenceRequest(req: Omit<ReferenceRequest, "id" | "created_at">): ReferenceRequest {
    const db = readDB();
    const r: ReferenceRequest = {
      ...req,
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    db.reference_requests.push(r);
    writeDB(db);
    return r;
  },

  getReferenceRequests(): ReferenceRequest[] {
    return readDB().reference_requests
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  incrementPitchPageStats(
    id: string,
    delta: { views?: number; scrollDepth?: number; ctaClicks?: number; touchViewedAt?: boolean },
  ): void {
    const db = readDB();
    const i = db.pitch_pages.findIndex((p) => p.id === id);
    if (i === -1) return;
    const p = db.pitch_pages[i];
    db.pitch_pages[i] = {
      ...p,
      views: p.views + (delta.views ?? 0),
      total_scroll_depth: p.total_scroll_depth + (delta.scrollDepth ?? 0),
      cta_clicks: p.cta_clicks + (delta.ctaClicks ?? 0),
      last_viewed_at: delta.touchViewedAt ? new Date().toISOString() : p.last_viewed_at,
    };
    writeDB(db);
  },

  getSegmentWorkflowStats(segment: string): {
    leads: { total: number; active: number; replied: number; converted: number };
    steps: Record<number, { sent: number; opened: number; clicked: number; bounced: number }>;
  } {
    const db = readDB();
    const segLeads = db.leads.filter((l) => l.segment === segment);
    const leadIds = new Set(segLeads.map((l) => l.id));
    const emails = db.emails_sent.filter((e) => leadIds.has(e.lead_id));
    const steps: Record<number, { sent: number; opened: number; clicked: number; bounced: number }> = {};
    for (const e of emails) {
      if (!steps[e.step_number]) steps[e.step_number] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
      steps[e.step_number].sent++;
      if (e.opened_at) steps[e.step_number].opened++;
      if (e.clicked_at) steps[e.step_number].clicked++;
      if (e.bounced) steps[e.step_number].bounced++;
    }
    return {
      leads: {
        total: segLeads.length,
        active: segLeads.filter((l) => l.status === "active").length,
        replied: segLeads.filter((l) => l.status === "replied").length,
        converted: segLeads.filter((l) => l.status === "converted").length,
      },
      steps,
    };
  },
};

