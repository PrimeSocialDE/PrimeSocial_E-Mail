/**
 * IMAP-Reply-Detection-Cron — schließt die Lücke, dass Brevo keine `replied`-
 * Events per Webhook schickt. Läuft 1x täglich, scannt das niklas@primesocial.de-
 * Postfach auf neue Mails von Lead-Adressen und markiert:
 *   - lead.status = "replied" (stoppt sendDueDrafts automatisch)
 *   - emails_sent.replied_at = jetzt (auf die jüngste zuvor gesendete Mail)
 *
 * Auth via ENV: IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS.
 * Schreibt nur, wenn alle 4 Vars gesetzt sind — sonst noop (kein Crash).
 *
 * Verarbeitet nur UNSEEN-Mails und markiert sie als gelesen (SEEN), damit
 * derselbe Reply nicht zweimal verarbeitet wird. Begrenzt auf die letzten
 * 200 ungelesenen Mails pro Lauf, damit der Cron unter Vercel-maxDuration bleibt.
 */
import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLead, getEmailsForLead, updateEmailSent } from "@/lib/supabase";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function extractEmail(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  // "Vorname Nachname <user@domain.de>" oder bare "user@domain.de"
  const match = headerValue.match(/<([^>]+)>/) ?? headerValue.match(/([\w.+-]+@[\w.-]+\.\w+)/);
  return match ? match[1].toLowerCase().trim() : null;
}

export async function GET(req: Request) {
  // Cron-Auth wie beim daily-Cron — verhindert öffentliche Auslösung.
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const host = process.env.IMAP_HOST;
  const port = parseInt(process.env.IMAP_PORT ?? "993", 10);
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "IMAP-Credentials nicht gesetzt (IMAP_HOST/IMAP_USER/IMAP_PASS)",
    });
  }

  const log: string[] = [];
  const matched: { leadId: string; from: string }[] = [];

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Nur ungelesene Mails der letzten 14 Tage prüfen — begrenzt Datenmenge
      // und vermeidet alte Stammkunden-Threads. Beim ersten Lauf nach Deploy
      // kann das eine Welle markieren — das ist ok.
      const since = new Date(Date.now() - 14 * 86_400_000);
      const messageList = client.fetch(
        { seen: false, since },
        { envelope: true, uid: true },
      );

      // Wir loaden erstmal alle Kandidaten und matchen dann in einer Batch-Query.
      const candidates: { uid: number; fromEmail: string }[] = [];
      for await (const msg of messageList) {
        const fromHeader = msg.envelope?.from?.[0];
        const fromEmail = fromHeader
          ? extractEmail(`${fromHeader.address ?? ""}`)
          : null;
        if (!fromEmail) continue;
        // Skippe eigene Mails (falls SENT-Folder unsauber konfiguriert ist)
        if (fromEmail === user.toLowerCase()) continue;
        candidates.push({ uid: msg.uid, fromEmail });
        if (candidates.length >= 200) break;
      }

      log.push(`${candidates.length} ungelesene Mails geprüft`);

      // Lead-Match: Hole alle aktiven Leads und baue einen Email-Index
      const allLeads = await getLeads();
      const leadByEmail = new Map<string, typeof allLeads[number]>();
      for (const l of allLeads) {
        if (l.email) leadByEmail.set(l.email.toLowerCase(), l);
        if (l.private_email) leadByEmail.set(l.private_email.toLowerCase(), l);
      }

      const now = new Date().toISOString();
      const seenUids: number[] = [];

      for (const c of candidates) {
        const lead = leadByEmail.get(c.fromEmail);
        if (!lead) continue;
        // Nur stoppen, wenn der Lead überhaupt aktiv im Mail-Flow war.
        // Ein zweites Mal "replied" setzen ist idempotent — kein Schaden.
        if (lead.status === "replied") {
          seenUids.push(c.uid);
          continue;
        }
        matched.push({ leadId: lead.id, from: c.fromEmail });

        // Lead-Status setzen
        await updateLead(lead.id, { status: "replied", pause_reason: null });

        // Jüngste gesendete Mail finden und replied_at setzen
        const emails = await getEmailsForLead(lead.id);
        const sentEmails = emails
          .filter((e) => !!e.sent_at)
          .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
        if (sentEmails.length > 0) {
          await updateEmailSent(sentEmails[0].id, { replied_at: now });
        }

        log.push(`${lead.company_name} (${c.fromEmail}): Reply erkannt → status="replied"`);
        seenUids.push(c.uid);
      }

      // Verarbeitete Mails als gelesen markieren — damit sie beim nächsten
      // Lauf nicht erneut auftauchen.
      if (seenUids.length > 0) {
        await client.messageFlagsAdd(seenUids, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), log }, { status: 500 });
  } finally {
    await client.logout().catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    matched_count: matched.length,
    matched,
    log,
  });
}
