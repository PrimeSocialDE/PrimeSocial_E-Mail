import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPitchPageBySlug, savePitchPageEvent, incrementPitchPageStats, getClient, createDashboardTodo } from "@/lib/supabase";
import type { PitchEventType } from "@/types";

// Schutz wie beim Brevo-Webhook: harter Wall-Clock-Cap, kein Synchron-Warten
// auf DB-Inserts. Pitch-Page-Events kommen pro Visit mehrfach (page_view,
// scroll_depth, time_on_page, cta_click) — wenn das hängt, frisst's Geld.
export const runtime = "nodejs";
export const maxDuration = 5;
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS: PitchEventType[] = [
  "page_view",
  "scroll_depth",
  "section_view",
  "cta_click",
  "link_click",
  "time_on_page",
];

interface TrackBody {
  session_id?: string;
  event_type?: string;
  event_data?: Record<string, unknown> | null;
}

async function persistEvent(
  slug: string,
  body: TrackBody,
  userAgent: string | null,
  referrer: string | null,
): Promise<void> {
  const pitch = await getPitchPageBySlug(slug);
  if (!pitch) return;

  const session_id = body.session_id!;
  const event_type = body.event_type as PitchEventType;

  await savePitchPageEvent({
    pitch_page_id: pitch.id,
    session_id,
    event_type,
    event_data: body.event_data ?? null,
    user_agent: userAgent,
    referrer,
  });

  if (event_type === "page_view") {
    await incrementPitchPageStats(pitch.id, { views: 1, touchViewedAt: true });
    // Hot-Signal auf dem Lead: pitch_visited_at first-touch.
    // WHERE pitch_visited_at IS NULL macht es idempotent — wiederholte Views
    // setzen den Timestamp nicht zurueck.
    if (pitch.lead_id) {
      await getClient()
        .from("primesocial_leads")
        .update({ pitch_visited_at: new Date().toISOString() })
        .eq("id", pitch.lead_id)
        .is("pitch_visited_at", null);
    }
  } else if (event_type === "cta_click") {
    await incrementPitchPageStats(pitch.id, { ctaClicks: 1 });
    // Hot-Signal: pitch_cta_clicked_at first-touch (z.B. Calendly-Button).
    if (pitch.lead_id) {
      await getClient()
        .from("primesocial_leads")
        .update({ pitch_cta_clicked_at: new Date().toISOString() })
        .eq("id", pitch.lead_id)
        .is("pitch_cta_clicked_at", null);

      // CTA auf der Pitch-Page = Calendly-Button → ToDo anlegen.
      // source="pitch_page" trennt es von Mail-Klicks, ist aber im UI als
      // "Calendly geklickt" sichtbar.
      await createDashboardTodo({
        lead_id: pitch.lead_id,
        type:    "calendly_clicked",
        email_id: null,
        source:  "pitch_page",
      });
    }
  } else if (event_type === "scroll_depth") {
    const depth = Number(body.event_data?.depth ?? 0);
    if (Number.isFinite(depth) && depth > 0 && depth <= 100) {
      await incrementPitchPageStats(pitch.id, { scrollDepth: depth });
    }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = (await request.json().catch(() => ({}))) as TrackBody;

    const session_id = body.session_id;
    const event_type = body.event_type as PitchEventType | undefined;
    if (!session_id || !event_type || !ALLOWED_EVENTS.includes(event_type)) {
      return NextResponse.json({ error: "Ungültiges Event" }, { status: 400 });
    }

    // DB-Arbeit nach der Response. Antwortet jetzt in <30ms statt synchron auf
    // 2-3 sequentielle Supabase-Calls zu warten.
    const userAgent = request.headers.get("user-agent");
    const referrer = request.headers.get("referer");
    after(async () => {
      try {
        await persistEvent(slug, body, userAgent, referrer);
      } catch (err) {
        console.error("[pitch/track] persist failed:", err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[pitch/track]", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

// CORS-Preflight: nur unsere eigenen Origins zulassen, kein Wildcard mehr.
const ALLOWED_ORIGINS = new Set([
  "https://mail.primesocial.de",
  "https://www.primesocial.de",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://mail.primesocial.de";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}
