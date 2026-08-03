import { NextRequest, NextResponse } from "next/server";
import { getLeads, createLead } from "@/lib/supabase";
import { classifySegment, getSegmentRouting, MAIL_ELIGIBLE_SEGMENTS } from "@/lib/segments";
import { extractInstagramHandle } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const leads = await getLeads({
      segment: sp.get("segment") ?? undefined,
      status:  sp.get("status")  ?? undefined,
      step:    sp.get("step") ? Number(sp.get("step")) : undefined,
      dueSoon: sp.get("dueSoon") === "true",
      search:  sp.get("search") ?? undefined,
    });
    return NextResponse.json(leads);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { company_name, email } = body;
    if (!company_name || !email) {
      return NextResponse.json({ error: "company_name und email sind Pflicht" }, { status: 400 });
    }

    const segment = body.segment ?? (body.instagram_data ? classifySegment(body.instagram_data) : null);
    const now = new Date().toISOString();
    const routing = getSegmentRouting(segment);
    const isActive = routing.status === "active";

    const lead = await createLead({
      company_name,
      contact_name:        body.contact_name        ?? null,
      contact_first_name:  body.contact_first_name  ?? null,
      contact_last_name:   body.contact_last_name   ?? null,
      email,
      private_email:       body.private_email       ?? null,
      city:                body.city                ?? null,
      website_url:         body.website_url         ?? null,
      website_summary:     body.website_summary     ?? null,
      instagram_handle:    body.instagram_handle ? extractInstagramHandle(body.instagram_handle) : null,
      instagram_data:      body.instagram_data      ?? null,
      instagram_problem:   body.instagram_problem   ?? null,
      segment,
      segment_reasoning:   null,
      // Workflow nur starten wenn Lead Mail-eligible ist; sonst auf Stand 0
      workflow_step:       isActive ? 1 : 0,
      workflow_started_at: isActive ? now : null,
      next_touchpoint_at:  isActive ? now : null,
      status:              isActive ? "active" : "paused",
      pause_reason:        routing.pause_reason,
      scrape_attempts:     0,
      summary_attempts:    0,
      last_scrape_attempt_at:  null,
      last_summary_attempt_at: null,
      last_scraped_at:     body.instagram_data ? now : null,
      last_meta_ads_check_at: null,
      meta_ads_signal:     null,
      newsletter_subscribed_at: null,
      pitch_page_id:       null,
      pitch_page_url:      null,
      pitch_lead_type:     null,
      pitch_visited_at:    null,
      pitch_cta_clicked_at: null,
      calendly_booked_at:  null,
    });

    // Sequenzen im Hintergrund vorberechnen (fire-and-forget) — nur für Mail-eligible Segmente.
    // SOLIDE wird hier ausgeschlossen, weil erst der Ad-Library-Check entscheidet,
    // ob eine Sequenz wirklich versendet werden soll (Pitch wird trotzdem generierbar sein).
    if (segment && MAIL_ELIGIBLE_SEGMENTS.includes(segment) && segment !== "SOLIDE") {
      import("@/lib/sequences").then(({ generateAndSaveAllDrafts }) =>
        generateAndSaveAllDrafts(lead).catch((e) =>
          console.error("[leads/POST] Sequenz-Generierung fehlgeschlagen:", e)
        )
      );
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
