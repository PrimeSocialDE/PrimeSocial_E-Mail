/**
 * Einmal-Mail zur Verifikation der neuen Button-Brand-Farbe (#89DFED).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sendTemplateEmail } from "../lib/brevo";

async function run() {
  const bodyText = `Moin Niklas,

kurzer Farb-Test. Der Button unten sollte jetzt in PrimeSocial-Cyan (#89DFED) erscheinen, mit schwarzem Text drauf.

{{PITCH_BUTTON}}

Falls die Farbe nicht passt, sag Bescheid.

Viele Grüße aus Oldenburg
Niklas`;

  const result = await sendTemplateEmail({
    to: { email: "niklas@primesocial.de", name: "Niklas" },
    subject: "[Testrun] Button-Farbe #89DFED",
    bodyText,
    ctaButton: { label: "Beispiel-Button", url: "https://mail.primesocial.de/p/schreinerei-bergmann-gmbh-f0l3z2" },
  });
  console.log(`Gesendet. Brevo-ID: ${result.messageId ?? "?"}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
