/**
 * Calendly-Webhook — empfängt 'invitee.created'-Events und markiert den
 * passenden Lead als "converted" (gebuchter Call).
 *
 * Setup in Calendly:
 *   1. Webhooks → Create Webhook
 *   2. URL: https://mail.primesocial.de/api/webhooks/calendly
 *   3. Events: invitee.created (ggf. auch invitee.canceled für späteren Ausbau)
 *   4. Signing Key: in Vercel als CALENDLY_WEBHOOK_SECRET hinterlegen
 *
 * Signature-Verification über HMAC-SHA-256 — verhindert gefakte Buchungen.
 *
 * Lead-Match: Calendly-Invitee.email → primesocial_leads.email oder .private_email.
 * Findet kein Lead → 200 OK (kein Crash), Event wird ignoriert (z.B. private Buchungen).
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getLeads, updateLead } from "@/lib/supabase";

export const maxDuration = 5;
export const dynamic = "force-dynamic";

const SIGNING_SECRET = process.env.CALENDLY_WEBHOOK_SECRET ?? "";

interface CalendlyEvent {
  event: string; // "invitee.created" | "invitee.canceled" | …
  payload?: {
    email?: string;
    name?: string;
    event?: {
      uri?: string;
      start_time?: string;
    };
  };
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!SIGNING_SECRET) return true; // Kein Secret konfiguriert → kein Check (dev/staging)
  if (!signatureHeader) return false;

  // Calendly-Header-Format: "t=<timestamp>,v1=<hmac>"
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const data = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", SIGNING_SECRET).update(data).digest("hex");
  // timing-safe Vergleich
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("calendly-webhook-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let event: CalendlyEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Nur invitee.created interessiert uns für Hot-Signal.
  // invitee.canceled könnten wir später nutzen, um den Lead wieder aktiv zu setzen.
  if (event.event !== "invitee.created") {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const inviteeEmail = event.payload?.email?.toLowerCase().trim();
  if (!inviteeEmail) {
    return NextResponse.json({ ok: true, ignored: "no email" });
  }

  // Lead-Match: alle Leads laden, per E-Mail matchen.
  // Bei großer DB könnte das durch eine getLeadByEmail-Helper ersetzt werden.
  const allLeads = await getLeads();
  const lead = allLeads.find(
    (l) =>
      l.email?.toLowerCase() === inviteeEmail ||
      l.private_email?.toLowerCase() === inviteeEmail,
  );

  if (!lead) {
    return NextResponse.json({ ok: true, matched: false, email: inviteeEmail });
  }

  await updateLead(lead.id, {
    status: "converted",
    calendly_booked_at: new Date().toISOString(),
    pause_reason: null,
  });

  return NextResponse.json({
    ok: true,
    matched: true,
    lead_id: lead.id,
    company_name: lead.company_name,
  });
}
