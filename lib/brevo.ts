import { BRAND_COLOR, BRAND_GRADIENT, BRAND_GRADIENT_START, BRAND_GRADIENT_TEXT } from "./pitch-constants";

const BREVO_API = "https://api.brevo.com/v3";

// Tag, der jede von uns versendete Mail markiert. Brevo schickt den Tag in
// jedem Webhook-Event zurück — der Webhook-Handler ignoriert Events ohne
// diesen Tag, damit fremde Brevo-Mails (andere Tools im selben Account) nicht
// durch unsere DB-Logik laufen.
export const PRIMESOCIAL_BREVO_TAG = "primesocial-outreach";

// Meme-Bild für Mail 2 (Recall + Wiedererkennung). Hochgeladen in Brevo Content
// Library — Brevo-eigener Host hat höchstes Trust-Level bei Gmail/Outlook,
// Auto-Load-Rate für Bilder ist deutlich höher als bei eigenen Domains.
export const PRIMESOCIAL_MEME_URL = "https://img.mailinblue.com/9525165/images/content_library/original/6a019f7b47b9790e32f57ea3.png";

function getKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_API_KEY nicht gesetzt");
  return key;
}

// ─────────────────────────────────────────────────────────────────
// Transaktionsmail via Brevo-Template
// Platzhalter in der Vorlage: {{params.subject}} und {{params.body}}
// Footer mit Impressum + Abmelde-Link wird vom Brevo-Template übernommen.
// ─────────────────────────────────────────────────────────────────
interface TemplateParams {
  to: { email: string; name: string };
  subject: string;
  bodyText: string;
  pdfUrl?: string;
  pdfName?: string;
  pdfBuffer?: Buffer;            // Alternative zu pdfUrl: lokal generiertes PDF als Buffer (z.B. via @react-pdf/renderer)
  trackingId?: string;  // emails_sent.id für Open-Tracking-Pixel
  // CTA-Buttons. Beide Token können im bodyText vorkommen, werden im HTML
  // durch Buttons ersetzt, im Plain-Text durch "Label: <url>".
  //   {{PITCH_BUTTON}}    → Mail 3 (Pitch-Seite des Leads)
  //   {{CALENDLY_BUTTON}} → Mail 4 (Calendly-Buchungslink)
  pitchButton?: { label: string; url: string };
  calendlyButton?: { label: string; url: string };
  // Backward-compat (Preview-Routen): legacy ctaButton wird auf pitchButton gemappt.
  ctaButton?: { label: string; url: string };
  // Optionales eingebettetes Bild (für Meme in Mail 2). Wird unter dem Body als img-Tag eingefügt.
  inlineImageUrl?: string;
  inlineImageAlt?: string;
}

function formatBodyHtml(text: string): string {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;">${p.trim().replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#1a1a1a;">${paragraphs}</div>`;
}

export async function sendTemplateEmail(params: TemplateParams): Promise<{ messageId?: string }> {
  // Eigenes HTML mit Footer + Tracking-Pixel
  const baseUrl = "https://mail.primesocial.de";
  const trackingPixel = params.trackingId
    ? `<img src="${baseUrl}/api/track/open?id=${params.trackingId}" width="1" height="1" style="display:none;" alt="">`
    : "";
  // Backward-compat: ctaButton → pitchButton.
  const pitchButton = params.pitchButton ?? params.ctaButton;
  const calendlyButton = params.calendlyButton;
  // Falls ein Inline-Bild (Meme) gesetzt ist: hänge es vor dem Footer an den Body an.
  const bodyTextWithMeme = params.inlineImageUrl
    ? `${params.bodyText}\n\n{{INLINE_IMAGE}}`
    : params.bodyText;
  const bodyHtml = buildOutreachHtml(
    bodyTextWithMeme,
    trackingPixel,
    { pitchButton, calendlyButton },
    params.inlineImageUrl,
    params.inlineImageAlt,
  );
  const textContent = renderButtonsForText(params.bodyText, { pitchButton, calendlyButton });

  return sendTransactionalEmail({
    to: params.to,
    subject: params.subject,
    htmlContent: bodyHtml,
    textContent,
    attachmentUrl: params.pdfUrl,
    attachmentName: params.pdfName,
    attachmentBuffer: params.pdfBuffer,
  });
}

const PITCH_PLACEHOLDER = "{{PITCH_BUTTON}}";
const CALENDLY_PLACEHOLDER = "{{CALENDLY_BUTTON}}";

interface Buttons {
  pitchButton?: { label: string; url: string };
  calendlyButton?: { label: string; url: string };
}

function renderButtonHtml(button: { label: string; url: string }): string {
  const label = button.label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Bulletproof-Button: Tabelle statt div, inline Styles, damit es in Outlook/Gmail zuverlässig aussieht.
  // background-color als Fallback (Outlook rendert keine Gradients), background-image für moderne Clients.
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr><td align="left">
      <a href="${button.url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;background-color:${BRAND_GRADIENT_START};background-image:${BRAND_GRADIENT};color:${BRAND_GRADIENT_TEXT};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function renderButtonsForText(bodyText: string, buttons: Buttons): string {
  let out = bodyText;
  if (out.includes(PITCH_PLACEHOLDER)) {
    out = out.replace(
      PITCH_PLACEHOLDER,
      buttons.pitchButton ? `${buttons.pitchButton.label}: ${buttons.pitchButton.url}` : "",
    );
  }
  if (out.includes(CALENDLY_PLACEHOLDER)) {
    out = out.replace(
      CALENDLY_PLACEHOLDER,
      buttons.calendlyButton ? `${buttons.calendlyButton.label}: ${buttons.calendlyButton.url}` : "",
    );
  }
  return out;
}

const INLINE_IMAGE_PLACEHOLDER = "{{INLINE_IMAGE}}";

function renderInlineImageHtml(url: string, alt?: string): string {
  const altText = (alt ?? "").replace(/"/g, "&quot;");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px 0;">
    <tr><td align="left">
      <img src="${url}" alt="${altText}" style="display:block;max-width:480px;width:100%;height:auto;border-radius:8px;" />
    </td></tr>
  </table>`;
}

function buildOutreachHtml(
  text: string,
  trackingPixel = "",
  buttons: Buttons = {},
  inlineImageUrl?: string,
  inlineImageAlt?: string,
): string {
  // Text → HTML: Absätze durch \n\n, Zeilenumbrüche durch \n
  // Platzhalter {{PITCH_BUTTON}} / {{CALENDLY_BUTTON}} werden durch Button-Markup ersetzt.
  // Platzhalter {{INLINE_IMAGE}} wird durch ein img-Tag ersetzt (für Meme in Mail 2).
  const pitchHtml = buttons.pitchButton ? renderButtonHtml(buttons.pitchButton) : "";
  const calendlyHtml = buttons.calendlyButton ? renderButtonHtml(buttons.calendlyButton) : "";
  const imageHtml = inlineImageUrl ? renderInlineImageHtml(inlineImageUrl, inlineImageAlt) : "";

  const replaceMarkers = (block: string): string => {
    if (block === PITCH_PLACEHOLDER) return pitchHtml;
    if (block === CALENDLY_PLACEHOLDER) return calendlyHtml;
    if (block === INLINE_IMAGE_PLACEHOLDER) return imageHtml;
    return "";
  };

  const paragraphs = text.split(/\n\n+/).map((block) => {
    const trimmed = block.trim();
    const markerOnly = replaceMarkers(trimmed);
    if (markerOnly !== "") return markerOnly;
    return `<p style="margin:0 0 16px 0;line-height:1.6;font-size:15px;color:#1a1a1a;">${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
<tr><td align="center" style="padding:32px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="font-family:Arial,Helvetica,sans-serif;">
${paragraphs}
</td></tr>
<tr><td style="padding-top:32px;border-top:1px solid #e8e8e8;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="120" valign="top" style="padding:12px 12px 12px 0;">
<img src="https://img.mailinblue.com/9525165/images/content_library/original/69b3263d6e1df3692431e806.jpg" width="110" style="display:block;border-radius:4px;" alt="PrimeSocial">
</td>
<td valign="top" style="padding:12px 0;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;font-size:15px;font-weight:bold;color:#1a1a1a;">Niklas Moritz</p>
<p style="margin:2px 0 0;font-size:14px;color:#1a1a1a;">Geschäftsführer</p>
<p style="margin:6px 0 0;font-size:12px;color:#858588;">E-Mail: niklas@primesocial.de</p>
<p style="margin:2px 0 0;font-size:12px;color:#858588;">Tel.: +49 162 4035041</p>
<p style="margin:2px 0 0;font-size:12px;"><a href="https://www.primesocial.de" style="color:#858588;text-decoration:underline;">www.primesocial.de</a></p>
</td>
<td width="90" valign="top" style="padding:12px 0;font-family:Arial,Helvetica,sans-serif;text-align:center;">
<p style="margin:0;"><a href="https://www.primesocial.de/impressum" style="font-size:11px;color:#858588;text-decoration:underline;">Impressum</a></p>
<p style="margin:4px 0 0;"><a href="https://www.primesocial.de/datenschutz" style="font-size:11px;color:#858588;text-decoration:underline;">Datenschutz</a></p>
<p style="margin:4px 0 0;"><a href="{{ unsubscribe }}" style="font-size:11px;color:#858588;text-decoration:underline;">Abmelden</a></p>
</td>
</tr></table>
</td></tr>
</table>
</td></tr>
</table>
${trackingPixel}
</td></tr>
</table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────
// Raw transaktionale Mail (Fallback / für Newsletter)
// ─────────────────────────────────────────────────────────────────
interface SendParams {
  to: { email: string; name: string };
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentBuffer?: Buffer;       // Alternative zu attachmentUrl: lokal gerendertes PDF (z.B. via @react-pdf/renderer)
  attachments?: Array<{ name: string; content: Buffer }>; // Mehrere Anhänge auf einmal (Buffer-basiert)
}

export async function sendTransactionalEmail(params: SendParams): Promise<{ messageId?: string }> {
  const payload: Record<string, unknown> = {
    sender: { name: "Niklas", email: "niklas@prime-social.de" },
    replyTo: { email: "niklas@primesocial.de", name: "Niklas" },
    to: [params.to],
    subject: params.subject,
    htmlContent: params.htmlContent,
    textContent: params.textContent ?? stripHtml(params.htmlContent),
    // Tag wird im Webhook-Event zurückgespiegelt → Handler kann fremde Brevo-Mails
    // (andere Tools im gleichen Account) sofort filtern.
    tags: [PRIMESOCIAL_BREVO_TAG],
    headers: {
      "X-Mailin-Track": "1",           // Open-Tracking aktivieren
      "X-Mailin-Track-Links": "1",     // Click-Tracking aktivieren
    },
  };
  if (params.attachments && params.attachments.length > 0) {
    payload.attachment = params.attachments.map((a) => ({
      name: a.name,
      content: a.content.toString("base64"),
    }));
  } else if (params.attachmentBuffer) {
    payload.attachment = [{
      name: params.attachmentName ?? "PrimeSocial-Analyse.pdf",
      content: params.attachmentBuffer.toString("base64"),
    }];
  } else if (params.attachmentUrl) {
    payload.attachment = [{
      name: params.attachmentName ?? "PrimeSocial-Analyse.pdf",
      url: params.attachmentUrl,
    }];
  }
  const res = await fetch(`${BREVO_API}/smtp/email`, {
    method: "POST",
    headers: { "api-key": getKey(), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Brevo API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ messageId?: string }>;
}

// ─────────────────────────────────────────────────────────────────
// Newsletter-Versand an eine Abonnenten-Liste
// ─────────────────────────────────────────────────────────────────
export async function sendNewsletterToSubscribers(
  subscribers: { email: string; name: string | null }[],
  subject: string,
  bodyHtml: string,
  bodyText: string
): Promise<{ sent: number; errors: string[] }> {
  const results = await Promise.allSettled(
    subscribers.map((s) =>
      sendTransactionalEmail({
        to: { email: s.email, name: s.name ?? s.email },
        subject,
        htmlContent: bodyHtml,
        textContent: bodyText,
      })
    )
  );
  const errors = results
    .map((r, i) => r.status === "rejected" ? `${subscribers[i].email}: ${r.reason}` : null)
    .filter((e): e is string => e !== null);
  return { sent: results.filter((r) => r.status === "fulfilled").length, errors };
}

// ─────────────────────────────────────────────────────────────────
// Brevo Kontakte / Listen (für Newsletter-Abo-Management)
// ─────────────────────────────────────────────────────────────────
export async function addContactToBrevoList(
  email: string,
  name: string | null,
  listId: number
): Promise<void> {
  const [firstName, ...rest] = (name ?? "").split(" ");
  await fetch(`${BREVO_API}/contacts`, {
    method: "POST",
    headers: { "api-key": getKey(), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      email,
      attributes: { FIRSTNAME: firstName || undefined, LASTNAME: rest.join(" ") || undefined },
      listIds: [listId],
      updateEnabled: true,
    }),
  });
}

export async function removeContactFromBrevoList(email: string, listId: number): Promise<void> {
  await fetch(`${BREVO_API}/contacts/lists/${listId}/contacts/remove`, {
    method: "POST",
    headers: { "api-key": getKey(), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ emails: [email] }),
  });
}

// ─────────────────────────────────────────────────────────────────
// Report & Alert Emails
// ─────────────────────────────────────────────────────────────────
interface DailyReport {
  date: string;
  leadsScraped: number;
  leadsSegmented: Record<string, number>;
  emailsVerified: number;
  emailsBounced: number;
  emailsSent: number;
  emailsOpened: number;
  errors: string[];
  totalLeads: number;
  activeLeads: number;
  outreachEnabled: boolean;
  // Erweiterte KPIs
  leadsByStatus?: Record<string, number>;
  leadsWithoutSegment?: number;
  leadsWithoutEmail?: number;
  completedLeads?: number;
  bestSendTime?: string;
}

const REPORT_RECIPIENT = { email: "kontakt@primesocial.de", name: "PrimeSocial" };

export async function sendReportEmail(report: DailyReport): Promise<void> {
  const SEGMENT_LABELS: Record<string, string> = {
    KEINEVIDEO: "Keine Videos",
    INAKTIV: "Inaktiv",
    INKONSISTENT: "Inkonsistent",
    WENIGREICHWEITE: "Wenig Reichweite",
    VIRALAUSREISSER: "Viral-Ausreißer",
    SOLIDE: "Solide",
    KEINFIT: "Kein Fit",
    KEININSTAGRAM: "Kein Instagram",
  };

  const STATUS_LABELS: Record<string, string> = {
    new: "Neu",
    active: "Aktiv",
    paused: "Pausiert",
    replied: "Geantwortet",
    converted: "Konvertiert",
    bounced: "Bounced",
    unsubscribed: "Abgemeldet",
  };

  // Segment-Übersicht
  const allSegments = ["KEINEVIDEO", "INAKTIV", "INKONSISTENT", "WENIGREICHWEITE", "VIRALAUSREISSER", "SOLIDE", "KEINFIT", "KEININSTAGRAM"];
  const segmentLines = allSegments
    .map((s) => `    ${SEGMENT_LABELS[s] ?? s}: ${report.leadsSegmented[s] ?? 0}`)
    .join("\n");

  // Status-Übersicht
  const allStatuses = ["new", "active", "paused", "replied", "converted", "bounced", "unsubscribed"];
  const statusLines = report.leadsByStatus
    ? allStatuses
        .map((s) => `    ${STATUS_LABELS[s] ?? s}: ${report.leadsByStatus![s] ?? 0}`)
        .join("\n")
    : "    Keine Daten";

  // Fehler — max 5 anzeigen, Rest als Zahl
  let errorsText: string;
  if (report.errors.length === 0) {
    errorsText = "    Keine";
  } else if (report.errors.length <= 5) {
    errorsText = report.errors.map((e) => `    • ${e}`).join("\n");
  } else {
    const shown = report.errors.slice(0, 5).map((e) => `    • ${e}`).join("\n");
    errorsText = `${shown}\n    ... und ${report.errors.length - 5} weitere`;
  }

  const body = `PrimeSocial — Täglicher Report
${report.date}
${"─".repeat(40)}

HEUTE VERARBEITET
    Leads gescrapt:      ${report.leadsScraped}
    E-Mails verifiziert: ${report.emailsVerified}
    E-Mails bounced:     ${report.emailsBounced}

OUTREACH (${report.outreachEnabled ? "AKTIV" : "DEAKTIVIERT"})
    E-Mails gesendet:    ${report.emailsSent}
    E-Mails geöffnet:    ${report.emailsOpened}

${"─".repeat(40)}

LEADS GESAMT: ${report.totalLeads}

  Nach Status:
${statusLines}

  Nach Segment (heute gescrapt):
${segmentLines}

  Ohne Segment:  ${report.leadsWithoutSegment ?? 0}
  Ohne E-Mail:   ${report.leadsWithoutEmail ?? 0}
  Abgeschlossen: ${report.completedLeads ?? 0}

${report.bestSendTime ? `\nOPTIMALE VERSANDZEIT\n    ${report.bestSendTime}\n` : ""}
${"─".repeat(40)}

FEHLER (${report.errors.length})
${errorsText}

${"─".repeat(40)}
Gesendet von PrimeSocial E-Mail Tool`;

  await sendTransactionalEmail({
    to: REPORT_RECIPIENT,
    subject: `PrimeSocial Report — ${report.date}`,
    htmlContent: `<pre style="font-family:monospace;font-size:14px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap;">${body}</pre>`,
    textContent: body,
  });
}

export async function sendAlertEmail(subject: string, message: string): Promise<void> {
  await sendTransactionalEmail({
    to: REPORT_RECIPIENT,
    subject,
    htmlContent: textToHtml(message),
    textContent: message,
  });
}

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    `<a href="$1" style="color:${BRAND_COLOR};">$1</a>`
  );
  const paragraphs = linked
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 18px;line-height:1.7;font-size:15px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:32px 24px;">
${paragraphs}
</body></html>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
