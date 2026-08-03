/**
 * Wartet 3 Minuten (Vercel-Deploy), dann sendet genau eine Mail 3 an niklas@primesocial.de
 * mit dem Pitch-Button.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";

import { getClient, saveEmailSent } from "../lib/supabase";
import type { Lead } from "../types";
import { sendTemplateEmail, textToHtml } from "../lib/brevo";

const RECIPIENT = "niklas@primesocial.de";
const RECIPIENT_NAME = "Niklas";
const WAIT_MS = 3 * 60 * 1000;

const STATE_FILE = path.join(process.cwd(), "scripts", ".pitch-testrun-state.json");

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

async function run() {
  log(`=== Post-Deploy Mail-3 Test ===`);

  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as {
    leadId?: string;
    pitchUrl?: string;
  };
  if (!state.leadId || !state.pitchUrl) throw new Error("State-Datei unvollständig");

  log(`Warte ${WAIT_MS / 1000}s auf Vercel-Deploy…`);
  await new Promise((r) => setTimeout(r, WAIT_MS));
  log(`Wartezeit abgelaufen, sende Mail 3 jetzt.`);

  const { data } = await getClient().from("primesocial_leads").select("*").eq("id", state.leadId).single();
  const lead = data as Lead;
  const firstName = lead.contact_first_name ?? lead.company_name;

  const body = `Moin ${firstName},

ich hab mich diese Woche nochmal mit eurem Instagram und eurer Website beschäftigt. Was mir dabei gekommen ist, hab ich nicht in eine lange Mail gepackt, sondern auf eine eigene Seite.

Da steht in einem Aufwasch drin wie eine Content-Strategie für Schreinerei Bergmann aussehen würde, welche Formate für euch funktionieren und wie der Ablauf von Tag eins bis zum ersten Post wäre.

{{PITCH_BUTTON}}

Schau es dir an wenn du fünf Minuten hast. Wenn etwas nicht passt, sag Bescheid, dann passen wir das an.

Viele Grüße aus Oldenburg
Niklas`;

  const subject = "[Testrun nach Deploy] Kurzes Konzept für euch";

  const record = await saveEmailSent({
    lead_id: lead.id,
    step_number: 3,
    step_name: "mehrwert-post-deploy",
    subject,
    body_html: textToHtml(body),
    body_text: body,
    pdf_url: null,
    brevo_message_id: null,
    sent_to_email: RECIPIENT,
    sent_at: new Date().toISOString(),
    opened_at: null,
    clicked_at: null,
    bounced: false,
  });

  const res = await sendTemplateEmail({
    to: { email: RECIPIENT, name: RECIPIENT_NAME },
    subject,
    bodyText: body,
    trackingId: record.id,
    ctaButton: { label: "Konzept ansehen", url: state.pitchUrl },
  });

  log(`✉️  Mail 3 gesendet. Brevo-ID: ${res.messageId ?? "?"}`);
  log(`   Pitch-URL: ${state.pitchUrl}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
