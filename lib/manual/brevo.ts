// ─────────────────────────────────────────────────────────────────
// Eigener Brevo-Versand für das MANUELLE Modul.
// VOLLSTÄNDIG getrennt von lib/brevo.ts (Automation):
//  - eigener Sender (max@ / niklas@primesocial.de) — NIEMALS prime-social.de
//  - eigener Tag `primesocial-manual` → der Automation-Webhook ignoriert diese Mails
//  - eigener Tracking-Pixel (/api/manual/track/<tracking_id>), NICHT der Brevo-Webhook
// ─────────────────────────────────────────────────────────────────
import type { ManualSender } from "@/types/manual";

const BREVO_API = "https://api.brevo.com/v3";
export const MANUAL_BREVO_TAG = "primesocial-manual";

// Eigene Base-URL für den Tracking-Pixel (gleiche Domain wie Automation,
// aber eigener Endpoint). Override via Env möglich.
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mail.primesocial.de";

function getKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_API_KEY nicht gesetzt");
  return key;
}

function senderName(email: ManualSender | string): string {
  const local = email.split("@")[0] ?? "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Plain-Text → schlichtes, mailclient-sicheres HTML (Absätze + Zeilenumbrüche).
function bodyToHtml(text: string): string {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#1a1a1a;">${paragraphs}</div>`;
}

export async function sendManualEmail(params: {
  sender: ManualSender;
  to: string;
  subject: string;
  bodyText: string;
  trackingId: string;
}): Promise<{ messageId?: string }> {
  const pixel = `<img src="${BASE_URL}/api/manual/track/${params.trackingId}" width="1" height="1" style="display:none;" alt="">`;
  const htmlContent = bodyToHtml(params.bodyText) + pixel;

  const payload = {
    sender:  { name: senderName(params.sender), email: params.sender },
    replyTo: { name: senderName(params.sender), email: params.sender },
    to: [{ email: params.to }],
    subject: params.subject,
    htmlContent,
    textContent: params.bodyText,
    // Eigener Tag → strikt vom Automation-Tag getrennt. Brevo-Eigen-Tracking
    // bewusst NICHT aktiviert; Opens laufen ausschließlich über unseren Pixel.
    tags: [MANUAL_BREVO_TAG],
  };

  const res = await fetch(`${BREVO_API}/smtp/email`, {
    method: "POST",
    headers: { "api-key": getKey(), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Brevo API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ messageId?: string }>;
}
