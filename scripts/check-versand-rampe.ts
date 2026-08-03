/**
 * Zeigt, was die Warmup-Rampe und das Sendefenster konkret tun — ohne
 * irgendetwas zu versenden. Nützlich vor dem Scharfschalten, um zu sehen,
 * wann welches Tagesbudget greift.
 *
 * Aufruf: npx tsx scripts/check-versand-rampe.ts [YYYY-MM-DD]
 *         (Startdatum optional, sonst SES_WARMUP_START aus .env.local)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const startArg = process.argv[2];
if (startArg) process.env.SES_WARMUP_START = startArg;
if (!process.env.STELLENSIGNALE_MAX_MAILS_PRO_TAG) {
  process.env.STELLENSIGNALE_MAX_MAILS_PRO_TAG = "30";
}

import { tagesbudget, imSendefenster, sendeFreigegebene } from "../lib/stellensignale/versand";

const start = process.env.SES_WARMUP_START;
const max = process.env.STELLENSIGNALE_MAX_MAILS_PRO_TAG;

console.log(`\n📈 Warmup-Rampe — Start: ${start ?? "(nicht gesetzt)"}, Deckel: ${max}/Tag\n`);

if (start) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  let summe = 0;
  for (const tag of [0, 3, 7, 10, 14, 21, 28, 35, 42]) {
    const d = new Date(startMs + tag * 86_400_000);
    const { budget, stufe } = tagesbudget(d);
    console.log(`   Tag ${String(tag).padStart(2)} · ${d.toISOString().slice(0, 10)} → ${String(budget).padStart(3)}/Tag   ${stufe}`);
  }
  // Grobe Summe über die ersten vier Wochen (je Woche 5 Werktage).
  for (const woche of [0, 1, 2, 3]) {
    const d = new Date(startMs + woche * 7 * 86_400_000);
    summe += tagesbudget(d).budget * 5;
  }
  console.log(`\n   Erreichbare Mails in den ersten 4 Wochen (5 Werktage/Woche): ca. ${summe}`);
} else {
  const { budget, stufe } = tagesbudget();
  console.log(`   Kein Warmup gesetzt → sofort ${budget}/Tag (${stufe})`);
  console.log("   ⚠️  Von einer frischen Domain aus ist das ein sicherer Weg in den Spam-Ordner.");
}

console.log("\n🕒 Sendefenster (Europe/Berlin, Mo-Fr 8-17 Uhr)\n");
const faelle: [string, string][] = [
  ["Montag 07:30",   "2026-07-27T05:30:00Z"],
  ["Montag 08:15",   "2026-07-27T06:15:00Z"],
  ["Montag 12:00",   "2026-07-27T10:00:00Z"],
  ["Montag 16:45",   "2026-07-27T14:45:00Z"],
  ["Montag 17:10",   "2026-07-27T15:10:00Z"],
  ["Samstag 12:00",  "2026-08-01T10:00:00Z"],
  ["Sonntag 12:00",  "2026-08-02T10:00:00Z"],
];
for (const [label, iso] of faelle) {
  const r = imSendefenster(new Date(iso));
  console.log(`   ${label.padEnd(16)} ${r.ok ? "✅ senden" : `⛔ ${r.grund}`}`);
}

const jetzt = imSendefenster();
console.log(`\n   Jetzt gerade: ${jetzt.ok ? "✅ Fenster offen" : `⛔ ${jetzt.grund}`}`);

// ── Riegel prüfen ────────────────────────────────────────────────
// sendeFreigegebene() bricht bei fehlender Konfiguration ab, BEVOR es die
// Datenbank oder SES anfasst. Deshalb ist das hier gefahrlos aufrufbar.
async function riegel() {
  console.log("\n🔒 Sicherheitsriegel\n");
  const sichern = { ...process.env };
  const pruefe = async (label: string, aenderung: () => void) => {
    Object.assign(process.env, sichern);
    aenderung();
    const r = await sendeFreigegebene({ ignoriereFenster: true });
    const blockiert = r.gesendet === 0 && !!r.hinweis;
    console.log(`   ${blockiert ? "✅" : "❌"} ${label}`);
    console.log(`      → ${r.hinweis ?? "NICHT blockiert — das wäre ein Fehler"}`);
  };

  await pruefe("Kill-Switch aus", () => { delete process.env.STELLENSIGNALE_VERSAND_ENABLED; });
  await pruefe("Configuration Set fehlt", () => {
    process.env.STELLENSIGNALE_VERSAND_ENABLED = "true";
    delete process.env.SES_CONFIGURATION_SET;
  });
  await pruefe("AWS-Zugang fehlt", () => {
    process.env.STELLENSIGNALE_VERSAND_ENABLED = "true";
    delete process.env.AWS_ACCESS_KEY_ID;
  });
  Object.assign(process.env, sichern);
  console.log("");
}
riegel();
