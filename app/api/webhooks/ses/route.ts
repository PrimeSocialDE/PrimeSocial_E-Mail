/**
 * SNS-Webhook für SES-Events (Bounces, Beschwerden).
 *
 * Warum das nicht optional ist: SES sperrt den Account bei einer Bounce-Rate
 * über 5 % oder einer Complaint-Rate über 0,1 %. Ohne diesen Endpunkt erfahren
 * wir nie, dass eine Adresse tot ist, schreiben sie erneut an und fahren die
 * Domain gegen die Wand.
 *
 * Der Endpunkt ist öffentlich erreichbar (SNS kann sich nicht einloggen),
 * deshalb wird JEDE Nachricht kryptografisch gegen das AWS-Zertifikat geprüft.
 * Ohne diese Prüfung könnte jeder beliebige Adressen auf unsere
 * Suppression-Liste setzen oder uns mit Müll-Events fluten.
 */
import { NextRequest, NextResponse } from "next/server";
import { createVerify } from "crypto";
import { addSuppression, getEntwurfByMessageId, updateEntwurfStatus } from "@/lib/stellensignale/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

interface SnsEnvelope {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL?: string;
  SigningCertUrl?: string;
  SubscribeURL?: string;
  Token?: string;
}

// Zertifikate ändern sich selten — einmal geholt, im Speicher behalten.
const certCache = new Map<string, string>();

/** Nur echte AWS-SNS-Hosts akzeptieren, sonst holt ein Angreifer sein eigenes Zertifikat. */
function istGueltigeCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function holeZertifikat(url: string): Promise<string | null> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) return null;
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

/**
 * String-to-sign nach AWS-Vorgabe: bestimmte Felder in alphabetischer
 * Reihenfolge, je "Name\nWert\n". Welche Felder, hängt vom Nachrichtentyp ab.
 */
function stringToSign(msg: SnsEnvelope): string | null {
  const felder =
    msg.Type === "Notification"
      ? (msg.Subject !== undefined
          ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
          : ["Message", "MessageId", "Timestamp", "TopicArn", "Type"])
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

  let out = "";
  for (const f of felder) {
    const wert = (msg as unknown as Record<string, unknown>)[f];
    if (wert === undefined || wert === null) return null;
    out += `${f}\n${String(wert)}\n`;
  }
  return out;
}

async function signaturGueltig(msg: SnsEnvelope): Promise<boolean> {
  const certUrl = msg.SigningCertURL ?? msg.SigningCertUrl;
  if (!certUrl || !istGueltigeCertUrl(certUrl)) return false;

  const daten = stringToSign(msg);
  if (!daten) return false;

  const pem = await holeZertifikat(certUrl);
  if (!pem) return false;

  // SignatureVersion 1 = SHA1, 2 = SHA256. Andere Versionen kennen wir nicht
  // und lehnen wir ab, statt zu raten.
  const algo = msg.SignatureVersion === "1" ? "RSA-SHA1" : msg.SignatureVersion === "2" ? "RSA-SHA256" : null;
  if (!algo) return false;

  try {
    const verifier = createVerify(algo);
    verifier.update(daten, "utf8");
    return verifier.verify(pem, msg.Signature, "base64");
  } catch {
    return false;
  }
}

interface SesEvent {
  eventType?: string;
  notificationType?: string;
  mail?: { messageId?: string; destination?: string[] };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    complainedRecipients?: { emailAddress?: string }[];
    complaintFeedbackType?: string;
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unbekannt";
  if (!checkRateLimit(`ses-webhook:${ip}`, 200, 60_000)) {
    // 200 statt 429, damit SNS nicht in eine Retry-Schleife läuft.
    return NextResponse.json({ ok: true, throttled: true });
  }

  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(await req.text()) as SnsEnvelope;
  } catch {
    return NextResponse.json({ ok: true, ignored: "kein JSON" });
  }

  if (!(await signaturGueltig(envelope))) {
    console.warn("[ses-webhook] Signatur ungültig — verworfen");
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 403 });
  }

  // Optionale Bindung an genau unser Topic. Verhindert, dass ein fremdes
  // (aber gültig signiertes) AWS-Topic unsere Suppression-Liste befüllt.
  const erwartet = process.env.SES_SNS_TOPIC_ARN;
  if (erwartet && envelope.TopicArn !== erwartet) {
    console.warn(`[ses-webhook] Fremdes Topic ${envelope.TopicArn} — verworfen`);
    return NextResponse.json({ error: "Unerwartetes Topic" }, { status: 403 });
  }

  // Abo-Bestätigung: AWS erwartet, dass wir die SubscribeURL einmal aufrufen.
  if (envelope.Type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
    // Die SubscribeURL liegt auf demselben SNS-Host wie das Zertifikat. Sie
    // wird von uns aufgerufen, also gilt hier dieselbe Host-Prüfung — sonst
    // ließe sich der Endpunkt als Request-Schleuder missbrauchen.
    if (!istGueltigeCertUrl(envelope.SubscribeURL)) {
      return NextResponse.json({ error: "SubscribeURL nicht von SNS" }, { status: 403 });
    }
    await fetch(envelope.SubscribeURL);
    console.log("[ses-webhook] SNS-Abo bestätigt");
    return NextResponse.json({ ok: true, confirmed: true });
  }

  if (envelope.Type !== "Notification") {
    return NextResponse.json({ ok: true, ignored: envelope.Type });
  }

  let event: SesEvent;
  try {
    event = JSON.parse(envelope.Message) as SesEvent;
  } catch {
    return NextResponse.json({ ok: true, ignored: "Message kein JSON" });
  }

  const typ = event.eventType ?? event.notificationType;
  const messageId = event.mail?.messageId;
  const verarbeitet: string[] = [];

  try {
    if (typ === "Bounce") {
      // Nur PERMANENTE Bounces sperren. Ein transienter Bounce (Postfach voll,
      // Server kurz weg) darf keine Adresse dauerhaft verbrennen.
      const permanent = event.bounce?.bounceType === "Permanent";
      for (const r of event.bounce?.bouncedRecipients ?? []) {
        if (!r.emailAddress) continue;
        if (permanent) {
          await addSuppression({
            email: r.emailAddress,
            grund: "hard_bounce",
            quelle: "ses",
            detail: `${event.bounce?.bounceSubType ?? ""} ${r.diagnosticCode ?? ""}`.trim().slice(0, 300),
          });
          verarbeitet.push(`hard_bounce:${r.emailAddress}`);
        } else {
          verarbeitet.push(`soft_bounce_ignoriert:${r.emailAddress}`);
        }
      }
    } else if (typ === "Complaint") {
      // Beschwerden IMMER sperren, unabhängig vom Feedback-Typ. Die
      // Complaint-Rate ist die Kennzahl, an der SES Accounts dichtmacht.
      for (const r of event.complaint?.complainedRecipients ?? []) {
        if (!r.emailAddress) continue;
        await addSuppression({
          email: r.emailAddress,
          grund: "complaint",
          quelle: "ses",
          detail: event.complaint?.complaintFeedbackType ?? undefined,
        });
        verarbeitet.push(`complaint:${r.emailAddress}`);
      }
    } else {
      return NextResponse.json({ ok: true, ignored: typ ?? "unbekannt" });
    }

    // Entwurf am Fehlerfeld markieren, damit im Dashboard sichtbar ist warum
    // nichts ankam. Fehlschlag hier darf die Suppression nicht rückgängig machen.
    if (messageId) {
      try {
        const entwurf = await getEntwurfByMessageId(messageId);
        if (entwurf) await updateEntwurfStatus(entwurf.id, "verworfen");
      } catch (e) {
        console.warn("[ses-webhook] Entwurf-Update fehlgeschlagen:", e);
      }
    }
  } catch (e) {
    console.error("[ses-webhook] Verarbeitung fehlgeschlagen:", e);
    // 200 zurückgeben: SNS würde sonst dieselbe Nachricht endlos retryen.
    return NextResponse.json({ ok: false, error: String(e) });
  }

  return NextResponse.json({ ok: true, typ, verarbeitet });
}
