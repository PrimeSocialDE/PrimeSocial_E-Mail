import { NextRequest, NextResponse } from "next/server";
import { getNewsletter, updateNewsletter, getSubscribers } from "@/lib/supabase";
import { sendNewsletterToSubscribers } from "@/lib/brevo";

export const runtime = "nodejs";
// Newsletter-Bulk-Versand kann je nach Liste-Größe länger laufen — 120s defensiv.
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nl = await getNewsletter(id);
    if (!nl) return NextResponse.json({ error: "Newsletter nicht gefunden" }, { status: 404 });
    if (nl.status === "sent") return NextResponse.json({ error: "Bereits gesendet" }, { status: 400 });

    const subscribers = await getSubscribers();
    if (subscribers.length === 0) {
      return NextResponse.json({ error: "Keine Abonnenten vorhanden" }, { status: 400 });
    }

    const { sent, errors } = await sendNewsletterToSubscribers(
      subscribers.map((s) => ({ email: s.email, name: s.name })),
      nl.subject,
      nl.body_html,
      nl.body_text
    );

    const updated = await updateNewsletter(id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: sent,
    });

    return NextResponse.json({ ok: true, sent, errors, newsletter: updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
