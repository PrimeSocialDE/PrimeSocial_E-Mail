// ─────────────────────────────────────────────────────────────────
// Daten-Layer für das RECHERCHE-Modul.
// Schreibt ausschließlich research_-Tabellen. Liest Automation
// (primesocial_leads) und Manuell (manual_*) NUR zum Dedup.
// Nutzt denselben Supabase-Client wie der Rest (anon-key, RLS-frei).
// ─────────────────────────────────────────────────────────────────
import { getClient, isSupabaseConfigured } from "@/lib/supabase";
import type {
  ResearchRun,
  ResearchProspect,
  ExcludedBranche,
  CoverageResult,
} from "@/types/research";

function configured(): boolean {
  return isSupabaseConfigured();
}
function db() {
  return getClient();
}

// ─────────────── Helpers ───────────────

// Domain aus URL oder E-Mail extrahieren, normalisiert (kein www, lowercase).
export function domainOf(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    if (raw.includes("@")) return raw.split("@")[1]?.replace(/^www\./, "") ?? null;
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return raw.replace(/^www\./, "").replace(/\/.*$/, "") || null;
  }
}

// Instagram-Handle normalisieren (ohne @, lowercase).
export function normHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  const h = input.trim().toLowerCase().replace(/^@/, "").replace(/\/$/, "");
  const last = h.includes("instagram.com") ? h.split("/").filter(Boolean).pop() ?? "" : h;
  return last || null;
}

// Dedup-Key aus Domain + Handle bilden (mindestens eins muss da sein).
export function buildDedupKey(domain: string | null, handle: string | null): string | null {
  const d = domain ?? "";
  const h = handle ?? "";
  if (!d && !h) return null;
  return `${d}|${h}`;
}

// ─────────────── Runs ───────────────
export async function createRun(
  r: { bundesland: string; stadt: string; branche?: string | null; trigger?: "manual" | "cron" }
): Promise<ResearchRun> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("research_runs").insert({
    bundesland: r.bundesland,
    stadt: r.stadt,
    branche: r.branche ?? null,
    trigger: r.trigger ?? "manual",
    status: "running",
  }).select().single();
  if (error) throw new Error(error.message);
  return data as ResearchRun;
}

export async function updateRun(id: string, updates: Partial<ResearchRun>): Promise<ResearchRun> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("research_runs").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as ResearchRun;
}

export async function getRuns(limit = 50): Promise<ResearchRun[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("research_runs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ResearchRun[];
}

// ─────────────── Prospects ───────────────
export async function createProspect(
  p: Partial<Omit<ResearchProspect, "id" | "created_at" | "updated_at">> & { company_name: string }
): Promise<ResearchProspect> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("research_prospects").insert(p).select().single();
  if (error) throw new Error(error.message);
  return data as ResearchProspect;
}

export async function updateProspect(id: string, updates: Partial<ResearchProspect>): Promise<ResearchProspect> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db()
    .from("research_prospects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as ResearchProspect;
}

export async function getProspect(id: string): Promise<ResearchProspect | null> {
  if (!configured()) return null;
  const { data, error } = await db().from("research_prospects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ResearchProspect) ?? null;
}

export async function getProspects(filters?: { status?: string; limit?: number; shortlisted?: boolean }): Promise<ResearchProspect[]> {
  if (!configured()) return [];
  let q = db().from("research_prospects").select("*");
  if (filters?.status) q = q.eq("status", filters.status);
  if (typeof filters?.shortlisted === "boolean") q = q.eq("shortlisted", filters.shortlisted);
  // qualifizierte Prospects zuerst nach Score, sonst nach Aktualität
  q = q.order("score", { ascending: false, nullsFirst: false })
       .order("created_at", { ascending: false })
       .limit(filters?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ResearchProspect[];
}

// Liegt zu dieser E-Mail bereits ein Prospect in der Recherche-Queue vor?
// Für die Coverage-Anzeige im Manuell-Schreiben (rein lesend).
export async function getProspectByEmail(
  email: string,
): Promise<{ company_name: string; status: string } | null> {
  if (!configured()) return null;
  const { data, error } = await db()
    .from("research_prospects")
    .select("company_name, status")
    .eq("best_email", email)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? { company_name: row.company_name, status: row.status } : null;
}

// Existiert ein Prospect mit diesem dedup_key bereits (innerhalb research)?
export async function prospectExistsByDedupKey(dedupKey: string): Promise<boolean> {
  if (!configured()) return false;
  const { data, error } = await db()
    .from("research_prospects").select("id").eq("dedup_key", dedupKey).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// ─────────────── Ausschluss-Liste ───────────────
export async function getExclusions(): Promise<ExcludedBranche[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("research_excluded_branches").select("*").order("term", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExcludedBranche[];
}

export async function addExclusion(term: string): Promise<ExcludedBranche> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db()
    .from("research_excluded_branches").insert({ term: term.trim() }).select().single();
  if (error) throw new Error(error.message);
  return data as ExcludedBranche;
}

export async function deleteExclusion(id: string): Promise<void> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { error } = await db().from("research_excluded_branches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────── Dedup (REIN LESEND gegen Automation + Manuell + Research) ───────────────
// Prüft anhand Domain (aus Website ODER E-Mail) + Instagram-Handle, ob das
// Unternehmen schon irgendwo bekannt ist. Kein Schreibzugriff auf fremde Tabellen.
export async function checkCoverage(args: {
  domain: string | null;
  handle: string | null;
  email?: string | null;
}): Promise<CoverageResult> {
  if (!configured()) return { known: false, source: null, detail: null };
  const { domain, handle, email } = args;
  const dom = domain ?? domainOf(email);

  // 1) primesocial_leads (Automation): email-Domain, website_url, instagram_handle
  if (dom || handle) {
    const ors: string[] = [];
    if (dom) { ors.push(`email.ilike.%@${dom}`); ors.push(`website_url.ilike.%${dom}%`); }
    if (handle) ors.push(`instagram_handle.ilike.%${handle}%`);
    const { data, error } = await db()
      .from("primesocial_leads").select("company_name, email").or(ors.join(",")).limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (row) return { known: true, source: "leads", detail: row.company_name ?? row.email ?? null };
  }

  // 2) Manuell: manual_contacts + manual_emails (über E-Mail-Domain)
  if (dom) {
    const [c, m] = await Promise.all([
      db().from("manual_contacts").select("email, company").ilike("email", `%@${dom}`).limit(1),
      db().from("manual_emails").select("recipient_email").ilike("recipient_email", `%@${dom}`).limit(1),
    ]);
    if (c.error) throw new Error(c.error.message);
    if (m.error) throw new Error(m.error.message);
    const cr = (c.data ?? [])[0];
    if (cr) return { known: true, source: "manual", detail: cr.company ?? cr.email ?? null };
    const mr = (m.data ?? [])[0];
    if (mr) return { known: true, source: "manual", detail: mr.recipient_email ?? null };
  }

  // 3) Research selbst (gleiche Domain/Handle schon mal gefunden)
  const key = buildDedupKey(dom, handle);
  if (key && (await prospectExistsByDedupKey(key))) {
    return { known: true, source: "research", detail: null };
  }

  return { known: false, source: null, detail: null };
}
