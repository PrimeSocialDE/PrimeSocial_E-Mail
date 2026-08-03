/**
 * Rendert für alle 3 Lead-Typen (recruiting · leadgen · branding) je eine PDF
 * und versendet sie als 3 Anhänge in einer einzigen Vorschau-Mail.
 *
 * Pro Variante:
 *  - Slide 1: Lead-Type-spezifische Themen-Headline (hier hardgecodet, weil
 *    der Schwerpunkt der Vorschau auf Slide-Layout liegt, nicht auf
 *    Claude-Personalisierung).
 *  - Slide 2: 2 Pain-Cards + Isotype-Dot-Grid (Lead-Type-aware in pdf-slides).
 *  - Slide 3: Passende Case Study aus CASE_STUDIES.
 *
 * Aufruf: npx tsx scripts/send-3-pdf-variants.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { renderSlidesPdf } from "../lib/pdf-slides";
import { CASE_STUDIES } from "../lib/pitch-constants";
import { sendTransactionalEmail } from "../lib/brevo";
import type { PitchLeadType } from "../types";

const RECIPIENT = "kontakt@primesocial.de";

interface Variant {
  leadType: PitchLeadType;
  label: string;
  companyName: string;
  slide1: { headline: string; subline: string; body_text: string };
  caseStudyKey: string;
}

const VARIANTS: Variant[] = [
  {
    leadType: "recruiting",
    label: "Recruiting",
    companyName: "Schreinerei Bergmann",
    slide1: {
      headline: "Eure besten Bewerber suchen nicht — sie scrollen.",
      subline: "Handwerk · Niedersachsen · Schreinerei",
      body_text:
        "Die guten Handwerker sind im Job, oft nicht zufrieden, aber zu eingebunden, um aktiv zu suchen. Sie schauen nicht auf Stepstone, sondern abends durchs Smartphone. Wer dort sichtbar ist, kommt auf den Radar, wenn sich etwas öffnet. Wer nicht, ist nicht im Spiel.",
    },
    caseStudyKey: "kreisbahn-aurich-organic",
  },
  {
    leadType: "leadgen",
    label: "Leadgen",
    companyName: "Müller & Partner Versicherung",
    slide1: {
      headline: "Eure Kunden googeln nicht mehr — sie scrollen.",
      subline: "Versicherungen · München · Privatkunden",
      body_text:
        "Wer heute einen neuen Anbieter sucht, fragt erst Bekannte und schaut dann auf Social Media. Vergleichsportale kommen oft erst im zweiten Schritt. Wer auf Instagram nicht sichtbar ist, landet gar nicht erst auf der Auswahlliste — egal wie gut die Beratung ist.",
    },
    caseStudyKey: "soldatenwissen",
  },
  {
    leadType: "branding",
    label: "Branding",
    companyName: "Praxis Dr. Lara Pfahl",
    slide1: {
      headline: "Gute Arbeit reicht nicht. Sichtbar muss werden, wie ihr arbeitet.",
      subline: "Gesundheit · Hamburg · Praxis",
      body_text:
        "Empfehlungen sind das Beste, was es gibt — aber sie skalieren nicht. Wer wachsen will, braucht eine Marke, die Patienten finden, bevor sie nach einer Empfehlung fragen müssen. Social Media ist heute der wirksamste Hebel, um genau das aufzubauen.",
    },
    caseStudyKey: "dr-lara-pfahl",
  },
];

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
}

async function run() {
  const attachments: { name: string; content: Buffer }[] = [];

  for (let i = 0; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    const cs = CASE_STUDIES.find((c) => c.key === v.caseStudyKey);
    if (!cs) {
      console.error(`❌ Case Study "${v.caseStudyKey}" fehlt`);
      process.exit(1);
    }
    console.log(`📄 [${i + 1}/3] Rendere ${v.label} → ${v.companyName} (Case: ${cs.firmenname})`);

    const buffer = await renderSlidesPdf({
      content: v.slide1,
      caseStudy: cs,
      meta: { companyName: v.companyName },
      leadType: v.leadType,
    });

    attachments.push({
      name: `${i + 1}-${v.label}-${safeFilename(v.companyName)}.pdf`,
      content: buffer,
    });
  }

  console.log(`📧 Versende Mail mit ${attachments.length} Anhängen an ${RECIPIENT}...`);

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f1115;">
    <p>Anbei alle 3 PDF-Varianten, die je nach Lead-Typ als Mail-1-Anhang generiert werden.</p>
    <ol style="padding-left:18px;">
      <li><strong>Recruiting</strong> — Schreinerei Bergmann (Handwerk)</li>
      <li><strong>Leadgen</strong> — Müller &amp; Partner Versicherung</li>
      <li><strong>Branding</strong> — Praxis Dr. Lara Pfahl</li>
    </ol>
    <p>Pro Variante:</p>
    <ul style="padding-left:18px;">
      <li>Slide 1: Lead-typ-spezifische Themen-Headline + Reichweite-Chart</li>
      <li>Slide 2: 2 Pain-Cards + Isotype-Grafik (lead-typ-spezifisch)</li>
      <li>Slide 3: Passende Case Study aus dem CASE_STUDIES-Set</li>
    </ul>
    <p style="color:#5b6470;font-size:13px;">Stand: ${new Date().toLocaleString("de-DE")}</p>
  </div>`;

  const result = await sendTransactionalEmail({
    to: { email: RECIPIENT, name: "Niklas" },
    subject: `PDF-Varianten: Recruiting · Leadgen · Branding`,
    htmlContent: html,
    textContent: `Alle 3 PDF-Varianten anbei.\n\n1. Recruiting — Schreinerei Bergmann\n2. Leadgen — Müller & Partner Versicherung\n3. Branding — Praxis Dr. Lara Pfahl\n\nStand: ${new Date().toLocaleString("de-DE")}`,
    attachments,
  });

  console.log(`✅ Verschickt`);
  if (result.messageId) console.log(`   Brevo-Message-ID: ${result.messageId}`);
}

run().catch((e) => {
  console.error("💥 Fehler:", e);
  process.exit(1);
});
