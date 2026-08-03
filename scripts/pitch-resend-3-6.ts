/**
 * Resend: Mails 3-6 nochmal mit Button-Version.
 * Nutzt den State aus dem vorherigen Testrun (Lead + Pitch-URL).
 * 2 Min Abstand zwischen Mails.
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
const INTERVAL_MS = 2 * 60 * 1000; // 2 Minuten (Resend-Lauf)

const LEAD_STATE_FILE = path.join(process.cwd(), "scripts", ".pitch-testrun-state.json");

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface TestrunState { leadId?: string; pitchPageId?: string; slug?: string; pitchUrl?: string; }

const BTN = "{{PITCH_BUTTON}}";

function step3(firstName: string): string {
  return `Moin ${firstName},

ich hab mich diese Woche nochmal mit eurem Instagram und eurer Website beschäftigt. Was mir dabei gekommen ist, hab ich nicht in eine lange Mail gepackt, sondern auf eine eigene Seite.

Da steht in einem Aufwasch drin wie eine Content-Strategie für Schreinerei Bergmann aussehen würde, welche Formate für euch funktionieren und wie der Ablauf von Tag eins bis zum ersten Post wäre.

${BTN}

Schau es dir an wenn du fünf Minuten hast. Wenn etwas nicht passt, sag Bescheid, dann passen wir das an.

Viele Grüße aus Oldenburg
Niklas`;
}

function step4(firstName: string): string {
  return `Hallo ${firstName},

falls du letzte Woche noch nicht reingeschaut hast, hier nochmal das Konzept das ich für euch aufgeschrieben hab.

${BTN}

Es muss kein Termin draus werden, ein kurzer Satz zurück reicht mir auch. Ob das grundsätzlich in eure Richtung geht oder ob ich am Thema vorbei bin. Beides ist völlig okay.

Viele Grüße aus Oldenburg
Niklas`;
}

function step5(firstName: string): string {
  return `Moin ${firstName},

ich würde das Konzept gerne mal mit dir durchgehen. 15 Minuten reichen dafür völlig. Wir können dann zusammen schauen ob die Richtung stimmt und was davon für euch Sinn ergibt.

Hättest du diese oder nächste Woche Zeit? Ich richte mich nach euch.

${BTN}

Viele Grüße aus Oldenburg
Niklas`;
}

function step6(firstName: string): string {
  return `${firstName},

der Hauptgrund warum ich mich überhaupt gemeldet habe: Eure Arbeit ist richtig gut. Das sieht man an den Projekten die ihr postet. Nur kommt bei den meisten Leuten davon zu wenig an.

Das ist kein Aufwand-Thema und keine Frage wie viel man investiert. Es geht eher darum wie ein Post die ersten Sekunden wirkt.

${BTN}

Viele Grüße aus Oldenburg
Niklas`;
}

async function run() {
  const state = JSON.parse(fs.readFileSync(LEAD_STATE_FILE, "utf-8")) as TestrunState;
  if (!state.leadId || !state.pitchUrl) throw new Error("Kein State aus vorherigem Testrun gefunden");

  const { data } = await getClient().from("primesocial_leads").select("*").eq("id", state.leadId).single();
  const lead = data as Lead;
  const firstName = lead.contact_first_name ?? lead.company_name;

  log(`=== Resend Mails 3-6 (Button-Version) ===`);
  log(`Empfänger: ${RECIPIENT}`);
  log(`Pitch: ${state.pitchUrl}`);

  const mails: { step: number; subject: string; body: string; buttonLabel: string }[] = [
    { step: 3, subject: "Kurzes Konzept für euch", body: step3(firstName), buttonLabel: "Konzept ansehen" },
    { step: 4, subject: "Kurze Rückmeldung",        body: step4(firstName), buttonLabel: "Konzept öffnen" },
    { step: 5, subject: "15 Minuten",                body: step5(firstName), buttonLabel: "Konzept nochmal ansehen" },
    { step: 6, subject: "Wer euch auf Instagram findet", body: step6(firstName), buttonLabel: "Was das konkret heißt" },
  ];

  for (let i = 0; i < mails.length; i++) {
    const m = mails[i];
    const prefixed = `[Testrun v2 ${m.step}/7] ${m.subject}`;
    log(`\n▶ Step ${m.step}: ${m.subject}`);

    const record = await saveEmailSent({
      lead_id: lead.id,
      step_number: m.step,
      step_name: `resend-${m.step}`,
      subject: prefixed,
      body_html: textToHtml(m.body),
      body_text: m.body,
      pdf_url: null,
      brevo_message_id: null,
      sent_to_email: RECIPIENT,
      sent_at: new Date().toISOString(),
      opened_at: null, clicked_at: null, bounced: false,
    });

    const res = await sendTemplateEmail({
      to: { email: RECIPIENT, name: RECIPIENT_NAME },
      subject: prefixed,
      bodyText: m.body,
      trackingId: record.id,
      ctaButton: { label: m.buttonLabel, url: state.pitchUrl! },
    });
    log(`   ✉️  Gesendet (Brevo-ID: ${res.messageId ?? "?"})`);

    if (i < mails.length - 1) {
      log(`   ⏰ Warte 2 Minuten…`);
      await sleep(INTERVAL_MS);
    }
  }
  log(`\n=== Fertig ===`);
}

run().catch((e) => { console.error(e); process.exit(1); });
