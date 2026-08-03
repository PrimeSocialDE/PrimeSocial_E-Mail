/**
 * ERSTER ECHTER VERSAND ÜBER AMAZON SES.
 *
 * Erzeugt einen echten Stellensignal-Entwurf und schickt ihn über SES an EINEN
 * Empfänger. Kein Datenbankzugriff, kein Eintrag in stellen_entwuerfe, keine
 * echte Firma wird angeschrieben.
 *
 * Zweck: beweisen, dass lib/ses.ts sauber baut und dass SPF, DKIM und DMARC im
 * echten Header auf "pass" stehen — BEVOR irgendein Betrieb etwas bekommt.
 *
 * Aufruf:
 *   npx tsx scripts/testmail-ses.ts --dry     # nur anzeigen, nichts senden
 *   npx tsx scripts/testmail-ses.ts           # echt über SES senden
 *
 * Benötigt in .env.local: ANTHROPIC_API_KEY, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, AWS_REGION, SES_FROM_EMAIL.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { erzeugeEntwurf } from "../lib/stellensignale/entwurf";
import { sendSesMail } from "../lib/ses";
import type { FirmaOutreach } from "../types/stellensignale";

const EMPFAENGER = "max@primesocial.de";
const dryRun = process.argv.includes("--dry");

// Testfirma — bewusst mit example-Domain, damit selbst bei einem Fehler
// niemand Echtes angeschrieben werden kann.
const TESTFIRMA: FirmaOutreach = {
  zielfirma_id: "ses-test",
  firma: "Nordmetall Stahlbau GmbH",
  gewerk: "metall",
  ort: "Wilhelmshaven",
  plz: "26382",
  website: "https://www.example-stahlbau.de",
  email: "bewerbung@example-stahlbau.de",
  email_quelle: "anzeige",
  email_confidence: 85,
  gf_name: null,
  firma_status: "aktiv",
  signal_id: "sig-test",
  stellentitel: "Schweißer / Metallbauer (m/w/d)",
  quelle: "arbeitsagentur",
  quelle_url: null,
  raw_text: null,
  erstfund: "2026-02-10",
  letzter_fund: "2026-07-28",
  ist_fachkraft: true,
  wochen_offen: 24,
  ist_heiss: true,
  anzahl_signale: 3,
};

/** Vorabprüfung mit präzisen Meldungen statt einem AWS-Stacktrace. */
function preflight(): string[] {
  const fehlt: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) fehlt.push("ANTHROPIC_API_KEY (für die Entwurfs-Generierung)");
  if (dryRun) return fehlt;
  if (!process.env.AWS_ACCESS_KEY_ID) fehlt.push("AWS_ACCESS_KEY_ID");
  if (!process.env.AWS_SECRET_ACCESS_KEY) fehlt.push("AWS_SECRET_ACCESS_KEY");
  if (!process.env.SES_FROM_EMAIL) fehlt.push("SES_FROM_EMAIL");
  return fehlt;
}

async function run() {
  console.log(`\n📤 SES-Testversand → ${EMPFAENGER}${dryRun ? "   (DRY RUN)" : ""}`);
  console.log(`   Region: ${process.env.AWS_REGION ?? "eu-central-1"}`);
  console.log(`   Absender: ${process.env.SES_FROM_NAME ?? "?"} <${process.env.SES_FROM_EMAIL ?? "?"}>`);
  console.log(`   Reply-To: ${process.env.SES_REPLY_TO ?? "(= Absender)"}`);
  const cs = process.env.SES_CONFIGURATION_SET;
  console.log(`   Configuration Set: ${cs ?? "— nicht gesetzt, keine Bounce-Meldungen"}\n`);

  const fehlt = preflight();
  if (fehlt.length > 0) {
    console.log("❌ Es fehlen Werte in .env.local:\n");
    for (const f of fehlt) console.log(`     • ${f}`);
    console.log("\n   Danach erneut ausführen. Mit --dry lässt sich der Text schon");
    console.log("   erzeugen, ohne dass AWS-Zugangsdaten nötig sind.\n");
    process.exit(1);
  }

  console.log("🤖 Erzeuge Entwurf (Claude)...");
  const entwurf = await erzeugeEntwurf(TESTFIRMA);
  if (!entwurf) {
    console.log("❌ Claude hat kein valides JSON geliefert. Nochmal versuchen.\n");
    process.exit(1);
  }

  // Getestet wird Schritt 1 der Sequenz — die Erstansprache.
  const mail = entwurf.mail_1;
  console.log(`\n   Betreff: ${mail.betreff}`);
  console.log(mail.text.split("\n").map((l: string) => `   │ ${l}`).join("\n"));

  if (dryRun) {
    console.log("\n✅ Dry Run beendet — nichts gesendet.\n");
    return;
  }

  console.log("\n📮 Sende über SES...");
  try {
    const { messageId } = await sendSesMail({
      to: EMPFAENGER,
      subject: `[SES-TEST] ${mail.betreff}`,
      bodyText: mail.text,
    });
    console.log(`✅ Angenommen. MessageId: ${messageId}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`❌ SES hat abgelehnt: ${msg}\n`);
    // Die drei Fehler, die in der Praxis zuerst auftreten — mit Klartext,
    // statt den Nutzer die AWS-Doku durchsuchen zu lassen.
    if (/not verified|MessageRejected/i.test(msg)) {
      console.log("   → Domain oder Absenderadresse in SES nicht verifiziert,");
      console.log("     oder das Konto ist noch in der Sandbox (dann nur an");
      console.log("     verifizierte Empfänger).");
    } else if (/AccessDenied|not authorized/i.test(msg)) {
      console.log("   → Der IAM-Nutzer darf nicht senden. Policy prüfen:");
      console.log("     ses:SendEmail auf der Identity UND auf dem Configuration Set.");
    } else if (/ConfigurationSetDoesNotExist/i.test(msg)) {
      console.log(`   → Configuration Set "${cs}" existiert in dieser Region nicht.`);
    } else if (/credentials|security token/i.test(msg)) {
      console.log("   → AWS-Zugangsdaten fehlen oder sind ungültig.");
    }
    process.exit(1);
  }

  console.log("🔎 Jetzt im Postfach prüfen — das ist der eigentliche Test:");
  console.log("   Gmail → Mail öffnen → ⋮ → \"Original anzeigen\"");
  console.log("   Dort müssen alle drei auf 'PASS' stehen:\n");
  console.log("     SPF:   PASS   mit primesocial-videos.de");
  console.log("     DKIM:  PASS   mit primesocial-videos.de");
  console.log("     DMARC: PASS\n");
  console.log("   Steht DKIM auf 'PASS' mit amazonses.com statt eurer Domain,");
  console.log("   ist Easy DKIM nicht aktiv — dann signiert SES mit eigener");
  console.log("   Domain und DMARC-Alignment schlägt fehl.\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
