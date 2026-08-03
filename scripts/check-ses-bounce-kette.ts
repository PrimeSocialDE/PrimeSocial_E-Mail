/**
 * END-TO-END-TEST der Bounce-/Complaint-Kette.
 *
 * Schickt je eine Mail an die SES-Simulator-Adressen und prüft danach, ob der
 * Webhook die Adressen in stellen_suppression eingetragen hat.
 *
 *   bounce@simulator.amazonses.com     → erzeugt einen PERMANENTEN Bounce
 *   complaint@simulator.amazonses.com  → erzeugt eine Beschwerde
 *
 * Die Simulator-Adressen sind von AWS genau dafür vorgesehen. Sie zählen NICHT
 * auf eure Bounce-Quote ein und erreichen keinen echten Empfänger.
 *
 * WAS DIESER TEST SCHREIBT: Der Webhook legt zwei Zeilen in
 * stellen_suppression an. Sonst nichts — es existiert kein Entwurf mit diesen
 * MessageIds, also wird auch keine Firma gesperrt. Die zwei Zeilen lassen sich
 * danach mit dem unten ausgegebenen SQL wieder entfernen.
 *
 * Aufruf:
 *   npx tsx scripts/check-ses-bounce-kette.ts --dry    # nur anzeigen
 *   npx tsx scripts/check-ses-bounce-kette.ts          # wirklich senden
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { sendSesMail } from "../lib/ses";

const ZIELE = [
  { adresse: "bounce@simulator.amazonses.com",    erwartet: "hard_bounce" },
  { adresse: "complaint@simulator.amazonses.com", erwartet: "complaint" },
];

const dryRun = process.argv.includes("--dry");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function suppression(): Promise<Map<string, string>> {
  const { data, error } = await db.from("stellen_suppression").select("email, grund, quelle");
  if (error) throw error;
  return new Map(((data ?? []) as { email: string; grund: string; quelle: string | null }[])
    .map((r) => [r.email, `${r.grund}${r.quelle ? ` (${r.quelle})` : ""}`]));
}

async function run() {
  console.log("\n🔁 End-to-End-Test der Bounce-Kette\n");

  const cs = process.env.SES_CONFIGURATION_SET;
  if (!cs) {
    console.log("❌ SES_CONFIGURATION_SET ist lokal nicht gesetzt.");
    console.log("   Ohne Configuration Set meldet SES keine Events — der Test würde");
    console.log("   nichts beweisen. Bitte in .env.local eintragen (wie in Vercel).\n");
    process.exit(1);
  }
  console.log(`   Configuration Set: ${cs}`);
  console.log(`   Absender: ${process.env.SES_FROM_EMAIL}\n`);

  const vorher = await suppression();
  console.log(`   Suppression-Liste vorher: ${vorher.size} Einträge`);
  for (const { adresse } of ZIELE) {
    if (vorher.has(adresse)) {
      console.log(`   ⚠️  ${adresse} steht schon drin — der Test wäre nicht aussagekräftig.`);
      console.log("      Zeile vorher entfernen, sonst weiß man nicht, ob sie neu ist.");
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log("\n   DRY RUN — es wird nichts gesendet.\n");
    return;
  }

  for (const { adresse, erwartet } of ZIELE) {
    const { messageId } = await sendSesMail({
      to: adresse,
      subject: "[KETTEN-TEST] bitte ignorieren",
      bodyText: "Automatischer Test der Bounce-Verarbeitung. Keine Aktion nötig.",
    });
    console.log(`   ✉️  ${adresse} → erwartet '${erwartet}', MessageId ${messageId.slice(0, 24)}…`);
  }

  // SES → SNS → Webhook → Supabase dauert typischerweise wenige Sekunden.
  console.log("\n   Warte auf die Events (bis zu 90 Sekunden)...");
  const bis = Date.now() + 90_000;
  const gefunden = new Set<string>();

  while (Date.now() < bis && gefunden.size < ZIELE.length) {
    await new Promise((r) => setTimeout(r, 5000));
    const jetzt = await suppression();
    for (const { adresse, erwartet } of ZIELE) {
      if (gefunden.has(adresse)) continue;
      const eintrag = jetzt.get(adresse);
      if (!eintrag) continue;
      gefunden.add(adresse);
      const passt = eintrag.startsWith(erwartet);
      console.log(`   ${passt ? "✅" : "⚠️ "} ${adresse} → ${eintrag}${passt ? "" : `  (erwartet: ${erwartet})`}`);
    }
    if (gefunden.size < ZIELE.length) process.stdout.write("   .");
  }
  console.log("");

  if (gefunden.size === ZIELE.length) {
    console.log("\n✅ Kette funktioniert: SES → SNS → Webhook → Suppression-Liste.\n");
  } else {
    const fehlend = ZIELE.filter((z) => !gefunden.has(z.adresse)).map((z) => z.adresse);
    console.log(`\n⚠️  Kein Eintrag für: ${fehlend.join(", ")}`);
    console.log("   Mögliche Ursachen:");
    console.log("     • Event Destination im Configuration Set deckt den Typ nicht ab");
    console.log("     • SNS-Subscription nicht 'Confirmed'");
    console.log("     • Webhook lehnt ab → Vercel-Logs zu /api/webhooks/ses prüfen");
    console.log("     • Events brauchen manchmal länger als 90 Sekunden\n");
  }

  console.log("   Aufräumen, wenn der Test durch ist:");
  console.log("     DELETE FROM stellen_suppression");
  console.log("      WHERE email LIKE '%@simulator.amazonses.com';\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
