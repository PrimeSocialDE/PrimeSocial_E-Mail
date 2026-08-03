// ─────────────────────────────────────────────────────────────────
// Daten-Layer + Merge-Engine für die zentrale Unternehmens-DB (companies).
// Kernidee: ANREICHERN statt überschreiben. Jeder Scrape aus jedem Modul
// füllt Lücken und sammelt E-Mails/IG, ohne vorhandene Daten zu verlieren.
// Dedup über domain (primär) → instagram_handle → company_name+stadt.
// ─────────────────────────────────────────────────────────────────
import { getClient, isSupabaseConfigured } from "@/lib/supabase";
import { domainOf, normHandle } from "@/lib/research/db";
import type { Company, CompanyInput } from "@/types/company";

function configured(): boolean { return isSupabaseConfigured(); }
function db() { return getClient(); }

function firstNonEmpty<T>(existing: T | null | undefined, incoming: T | null | undefined): T | null {
  const ok = (v: unknown) => v !== null && v !== undefined && v !== "";
  return (ok(existing) ? existing : ok(incoming) ? incoming : existing ?? null) as T | null;
}

function normEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

function collectEmails(input: CompanyInput, existing: string[] = []): string[] {
  const all = [
    ...existing,
    ...(input.emails ?? []),
    input.gf_email, input.marketing_email, input.general_email,
  ].map(normEmail).filter((e): e is string => !!e);
  return Array.from(new Set(all));
}

async function findExisting(domain: string | null, handle: string | null, name: string | null, stadt: string | null): Promise<Company | null> {
  if (domain) {
    const { data } = await db().from("companies").select("*").eq("domain", domain).limit(1);
    if (data && data[0]) return data[0] as Company;
  }
  if (handle) {
    const { data } = await db().from("companies").select("*").eq("instagram_handle", handle).limit(1);
    if (data && data[0]) return data[0] as Company;
  }
  if (name && stadt) {
    const { data } = await db().from("companies").select("*").ilike("company_name", name).eq("stadt", stadt).limit(1);
    if (data && data[0]) return data[0] as Company;
  }
  return null;
}

// Kern: Upsert mit Merge. Legt an oder reichert an. Gibt den Datensatz zurück.
export async function upsertCompany(input: CompanyInput): Promise<Company | null> {
  if (!configured()) return null;

  const domain = domainOf(input.website) ?? domainOf(input.gf_email) ?? domainOf(input.marketing_email) ?? domainOf(input.general_email);
  const handle = normHandle(input.instagram_handle);
  const name = input.company_name ?? null;
  const stadt = input.stadt ?? null;
  const nowIso = new Date().toISOString();

  const existing = await findExisting(domain, handle, name, stadt);
  const incomingEmails = collectEmails(input, existing?.emails ?? []);
  const sources = Array.from(new Set([...(existing?.sources ?? []), ...(input.source ? [input.source] : [])]));

  const merged = {
    company_name:     firstNonEmpty(existing?.company_name, input.company_name),
    domain:           firstNonEmpty(existing?.domain, domain),
    website:          firstNonEmpty(existing?.website, input.website),
    stadt:            firstNonEmpty(existing?.stadt, input.stadt),
    bundesland:       firstNonEmpty(existing?.bundesland, input.bundesland),
    branche:          firstNonEmpty(existing?.branche, input.branche),
    employee_bucket:  firstNonEmpty(existing?.employee_bucket, input.employee_bucket),
    gf_name:          firstNonEmpty(existing?.gf_name, input.gf_name),
    gf_email:         firstNonEmpty(existing?.gf_email, normEmail(input.gf_email)),
    marketing_email:  firstNonEmpty(existing?.marketing_email, normEmail(input.marketing_email)),
    general_email:    firstNonEmpty(existing?.general_email, normEmail(input.general_email)),
    emails:           incomingEmails,
    phone:            firstNonEmpty(existing?.phone, input.phone),
    instagram_handle: firstNonEmpty(existing?.instagram_handle, handle),
    // IG-Daten: frischer Scrape gewinnt, sonst bestehende behalten
    instagram_data:   input.instagram_data ?? existing?.instagram_data ?? null,
    rating:           firstNonEmpty(existing?.rating, input.rating),
    reviews_count:    firstNonEmpty(existing?.reviews_count, input.reviews_count),
    sources,
    updated_at:       nowIso,
    last_enriched_at: nowIso,
  };

  if (existing) {
    const { data, error } = await db().from("companies").update(merged).eq("id", existing.id).select().single();
    if (error) throw new Error(error.message);
    return data as Company;
  }
  const { data, error } = await db().from("companies").insert(merged).select().single();
  if (error) throw new Error(error.message);
  return data as Company;
}

// ─────────────── Queries ───────────────
export async function getCompanies(opts?: { search?: string; limit?: number }): Promise<Company[]> {
  if (!configured()) return [];
  let q = db().from("companies").select("*");
  const s = opts?.search?.trim().replace(/[,()%*]/g, " ").trim();
  if (s) {
    const like = `%${s}%`;
    q = q.or(`company_name.ilike.${like},domain.ilike.${like},stadt.ilike.${like},branche.ilike.${like},gf_name.ilike.${like},instagram_handle.ilike.${like}`);
  }
  q = q.order("updated_at", { ascending: false }).limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Company[];
}

export async function getCompany(id: string): Promise<Company | null> {
  if (!configured()) return null;
  const { data, error } = await db().from("companies").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Company) ?? null;
}

export async function countCompanies(): Promise<number> {
  if (!configured()) return 0;
  const { count, error } = await db().from("companies").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Zentrale Coverage-Prüfung (Dedup): ist das Unternehmen schon bekannt?
export async function checkCompanyCoverage(args: { domain?: string | null; handle?: string | null; email?: string | null }): Promise<{ known: boolean; company: Company | null }> {
  if (!configured()) return { known: false, company: null };
  const domain = args.domain ?? domainOf(args.email);
  const handle = normHandle(args.handle);
  const company = await findExisting(domain ?? null, handle, null, null);
  return { known: !!company, company };
}
