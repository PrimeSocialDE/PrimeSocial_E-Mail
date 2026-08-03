import { NextRequest, NextResponse } from "next/server";
import { getClient, isSupabaseConfigured } from "@/lib/supabase";
import { upsertCompany } from "@/lib/company/db";
import type { CompanyInput } from "@/types/company";

// Einmaliger Backfill der zentralen companies-DB aus den bestehenden Quellen.
// Seitenweise (source + offset + limit), damit es ins Zeitlimit passt.
// Aufruf z.B.: POST /api/companies/backfill {"source":"research","offset":0,"limit":200}
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Source = "research" | "automation" | "manual";

function mapRow(source: Source, r: Record<string, unknown>): CompanyInput {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? (v as string) : null);
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  if (source === "research") {
    return {
      company_name: s(r.company_name), website: s(r.website), stadt: s(r.city), bundesland: s(r.bundesland),
      branche: s(r.branche_final) ?? s(r.gmaps_category), employee_bucket: s(r.employee_bucket),
      gf_name: s(r.gf_name), gf_email: s(r.gf_email), marketing_email: s(r.marketing_email), general_email: s(r.general_email),
      emails: [s(r.best_email)], phone: s(r.phone), rating: n(r.rating), reviews_count: n(r.reviews_count),
      instagram_handle: s(r.instagram_handle), source: "research",
    };
  }
  if (source === "automation") {
    return {
      company_name: s(r.company_name), website: s(r.website_url), stadt: s(r.city),
      gf_name: s(r.contact_name), emails: [s(r.email), s(r.private_email)],
      instagram_handle: s(r.instagram_handle), instagram_data: r.instagram_data ?? null,
      source: "automation",
    };
  }
  // manual
  return {
    company_name: s(r.company), branche: s(r.branche),
    gf_name: [s(r.first_name), s(r.last_name)].filter(Boolean).join(" ") || null,
    emails: [s(r.email)], source: "manual",
  };
}

const TABLE: Record<Source, string> = {
  research: "research_prospects",
  automation: "primesocial_leads",
  manual: "manual_contacts",
};

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase nicht konfiguriert" }, { status: 500 });
  try {
    const body = await req.json().catch(() => ({}));
    const source = body.source as Source;
    if (!source || !TABLE[source]) {
      return NextResponse.json({ error: "source muss research|automation|manual sein" }, { status: 400 });
    }
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 500) : 200;
    const offset = typeof body.offset === "number" ? body.offset : 0;

    const { data, error } = await getClient()
      .from(TABLE[source]).select("*").range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];

    let ok = 0, failed = 0;
    for (const r of rows) {
      try { await upsertCompany(mapRow(source, r)); ok++; }
      catch (e) { failed++; console.warn("[backfill] upsert:", e); }
    }

    const done = rows.length < limit;
    return NextResponse.json({ source, processed: rows.length, ok, failed, nextOffset: offset + rows.length, done });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
