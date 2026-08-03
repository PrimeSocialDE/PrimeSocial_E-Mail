import { NextRequest, NextResponse } from "next/server";
import { getDueScheduledEmails, updateManualEmail } from "@/lib/manual/db";
import { sendManualEmail } from "@/lib/manual/brevo";
import { MANUAL_SENDERS, type ManualSender } from "@/types/manual";

// Verschickt fällige GEPLANTE manuelle Mails. Läuft per Vercel-Cron (alle 5 Min).
// Nur manual_emails — keine Berührung mit der Automation.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function run() {
  const due = await getDueScheduledEmails(25);
  let sent = 0;
  let failed = 0;

  for (const e of due) {
    try {
      const sender: ManualSender = MANUAL_SENDERS.includes(e.sender as ManualSender)
        ? (e.sender as ManualSender)
        : MANUAL_SENDERS[0]; // Fallback, sollte nie eintreten (beim Anlegen validiert)

      const result = await sendManualEmail({
        sender,
        to: e.recipient_email,
        subject: e.subject,
        bodyText: e.body,
        trackingId: e.tracking_id,
      });
      await updateManualEmail(e.id, {
        sent_at: new Date().toISOString(),
        brevo_message_id: result.messageId ?? null,
        send_error: null,
      });
      sent++;
    } catch (err) {
      // Fehler vermerken → wird nicht endlos neu versucht (getDueScheduledEmails filtert send_error).
      await updateManualEmail(e.id, { send_error: String(err instanceof Error ? err.message : err) });
      failed++;
    }
  }

  return { processed: due.length, sent, failed };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await run();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
