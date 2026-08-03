import { NextRequest, NextResponse } from "next/server";
import { getLead, saveEmailSent, updateLead, getEmailsForLead, addSubscriber } from "@/lib/supabase";
import { sendTransactionalEmail, textToHtml } from "@/lib/brevo";
import { getNextTouchpointDate, calculateNextStep } from "@/lib/workflow";
import { WORKFLOW_STEPS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isBrevoConfigured() {
  const k = process.env.BREVO_API_KEY;
  return !!(k && !k.includes("placeholder"));
}

// Status bei denen KEIN Versand erlaubt ist
const STOP_STATUSES = ["replied", "converted", "unsubscribed", "bounced"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { subject, body, pdfUrl, step } = await request.json();

    if (!subject || !body || !step) {
      return NextResponse.json({ error: "subject, body und step sind Pflicht" }, { status: 400 });
    }

    const lead = await getLead(id);

    // ── Regel: Geantwortet/Konvertiert/Bounced → keine Mails ──
    if (STOP_STATUSES.includes(lead.status)) {
      return NextResponse.json({ error: `Lead ist "${lead.status}" — kein Versand möglich` }, { status: 400 });
    }

    // ── Regel: private_email hat Priorität > email ──
    const recipientEmail = lead.private_email || lead.email;
    if (!recipientEmail) {
      return NextResponse.json({ error: "Keine E-Mail-Adresse hinterlegt" }, { status: 400 });
    }

    // ── Regel: Duplikat-Schutz — gleichen Step nicht doppelt senden ──
    const existingEmails = await getEmailsForLead(id);
    if (existingEmails.some((e) => e.step_number === step)) {
      return NextResponse.json({ error: `Step ${step} wurde bereits gesendet` }, { status: 400 });
    }

    // E-Mail versenden (oder nur lokal speichern)
    let brevoMessageId: string | null = null;
    if (isBrevoConfigured()) {
      const result = await sendTransactionalEmail({
        to: { email: recipientEmail, name: lead.contact_first_name ?? lead.contact_name ?? lead.company_name },
        subject,
        htmlContent: textToHtml(body),
        textContent: body,
        attachmentUrl: pdfUrl ?? undefined,
        attachmentName: pdfUrl ? `PrimeSocial-Analyse-${lead.company_name}.pdf` : undefined,
      });
      brevoMessageId = result.messageId ?? null;
    }

    // E-Mail in DB speichern
    const stepConfig = WORKFLOW_STEPS.find((s) => s.step === step);

    await saveEmailSent({
      lead_id:          id,
      step_number:      step,
      step_name:        stepConfig?.stepName ?? null,
      subject,
      body_html:        textToHtml(body),
      body_text:        body,
      pdf_url:          pdfUrl ?? null,
      brevo_message_id: brevoMessageId,
      sent_to_email:    recipientEmail,
      sent_at:          new Date().toISOString(),
      opened_at:        null,
      clicked_at:       null,
      pitch_clicked_at: null,
      calendly_clicked_at: null,
      replied_at:       null,
      bounced:          false,
    });

    // Workflow vorwärtsbewegen
    const nextStep = calculateNextStep(step);
    const now = new Date().toISOString();
    const workflowStartedAt = lead.workflow_started_at ?? now;
    const nextTouchpointAt = nextStep
      ? getNextTouchpointDate(workflowStartedAt, nextStep)?.toISOString() ?? null
      : null;

    // ── Regel: Nach Step 8 → Newsletter-Liste ──
    if (step === 8) {
      try {
        await addSubscriber({
          email: recipientEmail,
          name: lead.contact_first_name ?? lead.company_name,
          lead_id: lead.id,
          unsubscribed_at: null,
        });
      } catch { /* Duplikat ignorieren */ }

      await updateLead(id, {
        workflow_step: 8,
        status: "paused",
        next_touchpoint_at: null,
      });
    } else {
      await updateLead(id, {
        status:             "active",
        workflow_step:      nextStep ?? step,
        workflow_started_at: workflowStartedAt,
        next_touchpoint_at: nextTouchpointAt,
      });
    }

    return NextResponse.json({
      success: true,
      emailsSent: existingEmails.length + 1,
      recipientEmail,
      nextStep: step === 8 ? null : nextStep,
      nextTouchpointAt: step === 8 ? null : nextTouchpointAt,
      localMode: !isBrevoConfigured(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
