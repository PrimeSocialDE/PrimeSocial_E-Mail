import { NextRequest, NextResponse } from "next/server";
import { getClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/exclude
 * Body: { companies: ["Firma A", "Firma B", ...] }
 *
 * Sucht alle Leads deren company_name in der Liste ist und setzt sie auf
 * status: "paused" mit instagram_problem: "Bestandskunde — kein Outreach".
 */
export async function POST(request: NextRequest) {
  try {
    const { companies } = await request.json() as { companies: string[] };

    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: "companies Array erforderlich" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase nicht konfiguriert" }, { status: 500 });
    }

    const db = getClient();
    let excluded = 0;
    const matched: string[] = [];

    for (const company of companies) {
      const { data } = await db
        .from("primesocial_leads")
        .select("id, company_name, status")
        .ilike("company_name", `%${company.trim()}%`);

      if (data && data.length > 0) {
        for (const lead of data) {
          if (lead.status !== "paused" && lead.status !== "converted") {
            await db
              .from("primesocial_leads")
              .update({
                status: "paused",
                instagram_problem: "Bestandskunde — kein Outreach",
              })
              .eq("id", lead.id);

            // Cancel pending drafts
            await db
              .from("email_drafts")
              .update({ status: "cancelled" })
              .eq("lead_id", lead.id)
              .eq("status", "pending");

            excluded++;
          }
          matched.push(lead.company_name);
        }
      }
    }

    return NextResponse.json({
      success: true,
      excluded,
      matched,
      notFound: companies.filter(
        (c) => !matched.some((m) => m.toLowerCase().includes(c.toLowerCase()))
      ),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
