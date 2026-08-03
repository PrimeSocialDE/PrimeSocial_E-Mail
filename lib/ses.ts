/**
 * ses.ts — Mailversand über Amazon SES (v2).
 *
 * Bewusst getrennt von lib/brevo.ts: Brevo bleibt für die Instagram-Sequenz,
 * SES übernimmt die Stellensignal-Kaltakquise über eine eigene Domain. Grund
 * für die Trennung: Brevo läuft auf geteilten IPs und untersagt Kaltakquise;
 * ein Reputationsschaden dort würde auch den bestehenden Flow lahmlegen.
 *
 * Versendet ABSICHTLICH als reiner Text über Raw-MIME:
 *  - Plain Text hat bei Kaltakquise die besseren Zustellraten als HTML und
 *    sieht aus wie eine normal getippte Mail (genau das ist der Ton).
 *  - Raw-MIME ist nötig, um List-Unsubscribe zu setzen. Der Header senkt die
 *    Beschwerderate messbar, und die Beschwerderate ist das, was SES-Accounts
 *    sperrt (Grenze 0,1 %).
 */
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

let _client: SESv2Client | null = null;
function client(): SESv2Client {
  if (!_client) {
    const region = process.env.AWS_REGION ?? "eu-central-1";
    // Credentials kommen aus der Standard-Chain (ENV, IAM-Rolle). Auf Vercel
    // sind das AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
    _client = new SESv2Client({ region });
  }
  return _client;
}

export function isSesConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.SES_FROM_EMAIL
  );
}

/**
 * Header-Wert nach RFC 2047 kodieren, falls er Nicht-ASCII enthält.
 * Ohne das landen Umlaute im Betreff als Fragezeichen beim Empfänger.
 * Wird in Stücke geteilt, damit kein encoded-word über 75 Zeichen geht, und
 * schneidet dabei keine UTF-8-Sequenz mitten durch.
 */
function encodeHeaderValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;

  const buf = Buffer.from(clean, "utf8");
  const MAX_BYTES = 45; // base64 daraus ≈ 60 Zeichen, plus Rahmen bleibt < 75
  const words: string[] = [];
  let i = 0;
  while (i < buf.length) {
    let end = Math.min(i + MAX_BYTES, buf.length);
    // Nicht mitten in einem Mehrbyte-Zeichen trennen: Fortsetzungsbytes
    // haben das Bitmuster 10xxxxxx.
    while (end < buf.length && (buf[end] & 0xc0) === 0x80) end--;
    if (end <= i) end = Math.min(i + MAX_BYTES, buf.length); // Sicherheitsnetz
    words.push(`=?UTF-8?B?${buf.subarray(i, end).toString("base64")}?=`);
    i = end;
  }
  return words.join("\r\n ");
}

/** Base64 mit Zeilenumbruch alle 76 Zeichen (RFC 2045). */
function base64Body(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

export interface SesMailParams {
  to: string;
  subject: string;
  /** Reiner Text. Zeilenumbrüche wie getippt. */
  bodyText: string;
  /** Absender-Anzeigename, z.B. "Niklas Moritz". */
  fromName?: string;
  /** Antwortadresse, falls abweichend vom Absender (z.B. echtes Postfach). */
  replyTo?: string;
  /**
   * Adresse für List-Unsubscribe. Eine Mail an diese Adresse gilt als Opt-out.
   * Fällt zurück auf replyTo bzw. den Absender.
   */
  unsubscribeEmail?: string;
}

/**
 * Verschickt eine Mail und liefert die SES-MessageId zurück. Die brauchen wir,
 * um später eingehende Bounce-/Complaint-Events dem Entwurf zuzuordnen.
 */
export async function sendSesMail(params: SesMailParams): Promise<{ messageId: string }> {
  const from = process.env.SES_FROM_EMAIL;
  if (!from) throw new Error("SES_FROM_EMAIL ist nicht gesetzt");

  const fromName = params.fromName ?? process.env.SES_FROM_NAME ?? "";
  const replyTo = params.replyTo ?? process.env.SES_REPLY_TO ?? from;
  const unsubscribe = params.unsubscribeEmail ?? replyTo;

  const fromHeader = fromName
    ? `${encodeHeaderValue(fromName)} <${from}>`
    : from;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeaderValue(params.subject)}`,
    `Reply-To: ${replyTo}`,
    // Ein-Klick-Abmeldung. Gmail und Outlook zeigen dafür einen eigenen Button
    // an — Empfänger nutzen den statt "Spam", und genau darauf kommt es an.
    `List-Unsubscribe: <mailto:${unsubscribe}?subject=unsubscribe>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];

  const raw = `${headers.join("\r\n")}\r\n\r\n${base64Body(params.bodyText)}\r\n`;

  const res = await client().send(
    new SendEmailCommand({
      FromEmailAddress: fromHeader,
      Destination: { ToAddresses: [params.to] },
      Content: { Raw: { Data: Buffer.from(raw, "utf8") } },
      // Das Configuration Set verknüpft den Versand mit dem SNS-Topic, über
      // das Bounces und Beschwerden zurückkommen. Ohne das erfahren wir nie,
      // dass eine Adresse tot ist.
      ...(process.env.SES_CONFIGURATION_SET
        ? { ConfigurationSetName: process.env.SES_CONFIGURATION_SET }
        : {}),
    }),
  );

  if (!res.MessageId) throw new Error("SES lieferte keine MessageId zurück");
  return { messageId: res.MessageId };
}
