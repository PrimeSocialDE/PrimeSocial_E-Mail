import { NextRequest, NextResponse } from "next/server";
import { sendManualEmail } from "@/lib/manual/brevo";
import {
  createManualEmail, updateManualEmail,
  checkLeadByEmail, getContactByEmail, createContact,
} from "@/lib/manual/db";
import { MANUAL_SENDERS, type ManualSender } from "@/types/manual";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sender, recipient_email, subject, template_id, saveContact, scheduled_for } = body;
    const mailBody: string = body.body;

    // Validierung
    if (!MANUAL_SENDERS.includes(sender)) {
      return NextResponse.json({ error: "Ungültiger Absender. Nur max@ oder niklas@primesocial.de erlaubt." }, { status: 400 });
    }
    if (!recipient_email || !subject || !mailBody) {
      return NextResponse.json({ error: "Empfänger, Betreff und Body sind Pflicht." }, { status: 400 });
    }

    // Geplanter Versand? Zeitpunkt validieren.
    let scheduledIso: string | null = null;
    if (scheduled_for) {
      const when = new Date(scheduled_for);
      if (isNaN(when.getTime())) {
        return NextResponse.json({ error: "Ungültiger Versandzeitpunkt." }, { status: 400 });
      }
      if (when.getTime() < Date.now() - 60_000) {
        return NextResponse.json({ error: "Der geplante Zeitpunkt liegt in der Vergangenheit." }, { status: 400 });
      }
      scheduledIso = when.toISOString();
    }

    // Lead-Abgleich serverseitig (rein lesend) für ein verlässliches Warn-Flag.
    const match = await checkLeadByEmail(recipient_email);

    // Kontakt optional anlegen / wiederverwenden.
    let contact_id: string | null = null;
    if (saveContact) {
      const existing = await getContactByEmail(recipient_email);
      if (existing) {
        contact_id = existing.id;
      } else {
        const created = await createContact({
          email: recipient_email,
          first_name: saveContact.first_name ?? null,
          last_name: saveContact.last_name ?? null,
          company: saveContact.company ?? null,
          branche: saveContact.branche ?? null,
        });
        contact_id = created.id;
      }
    }

    // 1) Row anlegen (DB vergibt tracking_id), noch ohne sent_at.
    const row = await createManualEmail({
      contact_id,
      template_id: template_id ?? null,
      sender: sender as ManualSender,
      recipient_email,
      subject,
      body: mailBody,
      brevo_message_id: null,
      sent_at: null,
      scheduled_for: scheduledIso,
      response_status: "no_response",
      matched_lead_warning: match.matched,
    });

    // Geplanter Versand: nicht jetzt senden — der Cron übernimmt den Versand.
    if (scheduledIso) {
      return NextResponse.json({ email: row, scheduled: true, scheduled_for: scheduledIso, leadWarning: match }, { status: 201 });
    }

    // 2) Via Brevo versenden (eigener Pixel auf Basis tracking_id).
    let messageId: string | undefined;
    try {
      const result = await sendManualEmail({
        sender: sender as ManualSender,
        to: recipient_email,
        subject,
        bodyText: mailBody,
        trackingId: row.tracking_id,
      });
      messageId = result.messageId;
    } catch (sendErr) {
      // Versand fehlgeschlagen → Row bleibt als nicht-gesendet (sent_at null) bestehen.
      return NextResponse.json({ error: `Versand fehlgeschlagen: ${String(sendErr)}`, id: row.id }, { status: 502 });
    }

    // 3) sent_at + messageId nachtragen.
    const sent = await updateManualEmail(row.id, {
      sent_at: new Date().toISOString(),
      brevo_message_id: messageId ?? null,
    });

    return NextResponse.json({ email: sent, leadWarning: match }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
