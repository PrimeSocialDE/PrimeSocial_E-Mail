import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { updateEmailSent, updateLead, unsubscribeByEmail, isSupabaseConfigured, createDashboardTodo } from "@/lib/supabase";
import { localStore } from "@/lib/local-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { PRIMESOCIAL_BREVO_TAG } from "@/lib/brevo";

// Vercel-Schutz: harter Cap auf 5s, damit eine hängende DB nicht 60s kostet.
// Mit Index auf brevo_message_id liegt eine Verarbeitung normalerweise <100ms.
export const runtime = "nodejs";
export const maxDuration = 5;
// Body ist klein (Webhook-Events), aber wir setzen explizit eine Obergrenze
// damit niemand uns mit 100MB-Payloads zerschießen kann.
export const dynamic = "force-dynamic";

interface BrevoEvent {
  event: "opened" | "click" | "hard_bounce" | "soft_bounce" | "unsubscribe" | "spam";
  "message-id"?: string;
  email?: string;
  date?: string;
  // Bei "click"-Events: die URL die geklickt wurde. Brevo nennt's mal "link",
  // mal "url" — beide Felder abfragen.
  link?: string;
  url?: string;
  // Tag(s) der gesendeten Mail. Brevo schickt mal Array, mal Komma-String, mal
  // singular "tag" (älteres Format) — wir prüfen alle Varianten.
  tags?: string[] | string;
  tag?: string[] | string;
}

// Klassifiziert die geklickte URL: ist es der Pitch-Seiten-Button (mail.primesocial.de/p/...)
// oder der Calendly-Button (calendly.com/...)? Andere URLs (z.B. Brevo-Tracking-
// Wrapper-Links) kommen als "other" durch.
function classifyClickUrl(rawUrl: string | undefined): "pitch" | "calendly" | "other" {
  if (!rawUrl) return "other";
  const url = rawUrl.toLowerCase();
  if (url.includes("calendly.com")) return "calendly";
  if (url.includes("primesocial.de/p/") || url.includes("/p/")) return "pitch";
  return "other";
}

// Liefert true, wenn der Event von einer Mail kommt, die unser System versendet
// hat. Brevo-Account-weite Webhooks würden sonst auch Events von fremden Mails
// (andere Tools mit gleichem Brevo-Account) durchschicken.
function isPrimeSocialEvent(evt: BrevoEvent): boolean {
  const candidates: (string[] | string | undefined)[] = [evt.tags, evt.tag];
  for (const c of candidates) {
    if (!c) continue;
    if (Array.isArray(c) && c.includes(PRIMESOCIAL_BREVO_TAG)) return true;
    if (typeof c === "string" && c.split(",").map((s) => s.trim()).includes(PRIMESOCIAL_BREVO_TAG)) return true;
  }
  return false;
}

async function findEmailByMessageId(messageId: string): Promise<{ id: string; lead_id: string } | null> {
  if (isSupabaseConfigured()) {
    const { getClient } = await import("@/lib/supabase");
    const { data } = await getClient()
      .from("emails_sent")
      .select("id,lead_id")
      .eq("brevo_message_id", messageId)
      .limit(1);
    return data?.[0] ?? null;
  }
  return localStore.findEmailByMessageId(messageId);
}

async function processEvent(evt: BrevoEvent): Promise<void> {
  const now = new Date().toISOString();

  // Fremde Mails (andere Brevo-Tools im selben Account) sofort raus — kein
  // DB-Lookup nötig. Spart ~150ms pro fremdem Event.
  if (!isPrimeSocialEvent(evt)) return;

  if (evt.event === "unsubscribe" && evt.email) {
    await unsubscribeByEmail(evt.email);
    return;
  }

  // Spam-Complaint: Empfänger hat unsere Mail aktiv als Spam markiert.
  // Härteste mögliche Reaktion — sofortiger Workflow-Stopp UND Reputations-
  // Schutz für unseren Sender. Wir behandeln das wie unsubscribed, setzen
  // aber pause_reason auf 'spam_complaint' damit es im Dashboard sichtbar
  // ist und wir betroffene Leads nicht versehentlich reaktivieren.
  if (evt.event === "spam" && evt.email) {
    await unsubscribeByEmail(evt.email);
    // Zusätzliche Notiz: pause_reason setzen falls Lead existiert
    if (isSupabaseConfigured()) {
      const { getClient } = await import("@/lib/supabase");
      await getClient()
        .from("primesocial_leads")
        .update({ pause_reason: "spam_complaint" })
        .or(`email.eq.${evt.email},private_email.eq.${evt.email}`);
    }
    return;
  }

  const rawMessageId = evt["message-id"];
  if (!rawMessageId) return;

  // Brevo sendet mal mit, mal ohne spitze Klammern — beide Formate suchen.
  // OR-Query in einem einzigen Roundtrip statt zwei sequentiellen Lookups.
  const withBrackets = rawMessageId.startsWith("<") ? rawMessageId : `<${rawMessageId}>`;
  const withoutBrackets = rawMessageId.replace(/^<|>$/g, "");

  let emailRecord: { id: string; lead_id: string } | null = null;
  if (isSupabaseConfigured()) {
    const { getClient } = await import("@/lib/supabase");
    const { data } = await getClient()
      .from("emails_sent")
      .select("id,lead_id")
      .in("brevo_message_id", [withBrackets, withoutBrackets])
      .limit(1);
    emailRecord = data?.[0] ?? null;
  } else {
    emailRecord = await findEmailByMessageId(withBrackets) ?? await findEmailByMessageId(withoutBrackets);
  }
  if (!emailRecord) return;

  if (evt.event === "opened") {
    await updateEmailSent(emailRecord.id, { opened_at: now });
  } else if (evt.event === "click") {
    // clicked_at als Aggregate-Signal bleibt. Zusätzlich klassifizieren wir
    // den Link und setzen pitch_clicked_at / calendly_clicked_at je nachdem,
    // damit die Lead-Detail-Seite genau sieht WAS geklickt wurde.
    const kind = classifyClickUrl(evt.link ?? evt.url);
    const update: Record<string, string> = { clicked_at: now };
    if (kind === "pitch")    update.pitch_clicked_at    = now;
    if (kind === "calendly") update.calendly_clicked_at = now;
    await updateEmailSent(emailRecord.id, update);

    // Klick = Hot-Signal → ToDo im Dashboard anlegen (idempotent über UNIQUE-Index).
    // "other" Links (Footer-Impressum etc.) erzeugen keinen ToDo.
    if (kind === "pitch" || kind === "calendly") {
      await createDashboardTodo({
        lead_id:      emailRecord.lead_id,
        type:         kind === "pitch" ? "pitch_clicked" : "calendly_clicked",
        email_id:     emailRecord.id,
        source:       "email",
        triggered_at: now,
      });
    }
  } else if (evt.event === "hard_bounce") {
    await updateEmailSent(emailRecord.id, { bounced: true });
    await updateLead(emailRecord.lead_id, { status: "bounced" });
  }
}

async function processEvents(events: BrevoEvent[]): Promise<void> {
  for (const evt of events) {
    try {
      await processEvent(evt);
    } catch (err) {
      // Niemals einen Event-Fehler die ganze Batch crashen lassen.
      console.error("[brevo-webhook] event failed:", err, evt);
    }
  }
}

export async function POST(request: NextRequest) {
  // Rate limit: 100 requests pro Minute pro IP.
  const clientIp = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`brevo-webhook:${clientIp}`, 100, 60_000)) {
    // 200 zurückgeben statt 429: sonst retried Brevo und feuert weiter.
    return NextResponse.json({ ok: true, throttled: true });
  }

  // Body parsen — bei kaputtem JSON sofort 200 zurück, nicht retryen lassen.
  let parsed: BrevoEvent | BrevoEvent[];
  try {
    parsed = (await request.json()) as BrevoEvent | BrevoEvent[];
  } catch {
    return NextResponse.json({ ok: true });
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];

  // Verarbeitung NACH der Response laufen lassen (Next.js after() / Vercel waitUntil).
  // Damit antwortet die Function in <50ms — keine Wall-Clock-Sekunden mehr,
  // selbst wenn die DB-Operationen hängen sollten.
  after(async () => {
    await processEvents(list);
  });

  return NextResponse.json({ ok: true });
}
