import { NextRequest, NextResponse } from "next/server";
import { addSubscriber, unsubscribeByEmail } from "@/lib/supabase";
import { addContactToBrevoList } from "@/lib/brevo";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Rate-Limit: 5 Submissions pro IP pro 10 Min. Schützt gegen Subscriber-Bombing
  // (DB-Spam + Brevo-Reputation-Schaden, wenn die Liste mit Müll-Adressen gefüllt wird).
  const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`newsletter-subscribe:${clientIp}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429 });
  }

  try {
    const { email, name, lead_id, action } = (await req.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      lead_id?: string;
      action?: "subscribe" | "unsubscribe";
    };

    if (!email) return NextResponse.json({ error: "email fehlt" }, { status: 400 });
    // Sanity-Bounds + Format-Check.
    if (email.length > 320 || (name && name.length > 200)) {
      return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse." }, { status: 400 });
    }

    if (action === "unsubscribe") {
      await unsubscribeByEmail(email);
      const listId = process.env.BREVO_NEWSLETTER_LIST_ID ? Number(process.env.BREVO_NEWSLETTER_LIST_ID) : null;
      if (listId) {
        const { removeContactFromBrevoList } = await import("@/lib/brevo");
        await removeContactFromBrevoList(email, listId).catch(() => {});
      }
      return NextResponse.json({ ok: true, action: "unsubscribed" });
    }

    const sub = await addSubscriber({
      email,
      name: name ?? null,
      lead_id: lead_id ?? null,
      unsubscribed_at: null,
    });

    const listId = process.env.BREVO_NEWSLETTER_LIST_ID ? Number(process.env.BREVO_NEWSLETTER_LIST_ID) : null;
    if (listId) {
      await addContactToBrevoList(email, name ?? null, listId).catch(() => {});
    }

    return NextResponse.json({ ok: true, subscriber: sub });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
