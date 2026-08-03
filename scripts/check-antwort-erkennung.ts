/**
 * Prüft die Antwort- und Abmelde-Erkennung an echten Formulierungen.
 * Reine Textauswertung, kein Postfach, keine Datenbank.
 *
 * Aufruf: npx tsx scripts/check-antwort-erkennung.ts
 *
 * Wichtig ist vor allem die Trennschärfe: Eine fälschlich erkannte Abmeldung
 * sperrt einen Betrieb dauerhaft, und eine Sperre nimmt niemand zurück.
 */
import { bestimmeArt } from "../lib/stellensignale/antworten";

const faelle: { betreff: string; text: string; erwartet: string }[] = [
  // ── Abmeldungen ──
  { betreff: "AW: Ihr Elektroniker in Westerstede", text: "Bitte melden Sie uns ab, wir haben kein Interesse.", erwartet: "abmeldung" },
  { betreff: "unsubscribe", text: "", erwartet: "abmeldung" },
  { betreff: "AW: Schweißer finden", text: "Bitte schreiben Sie uns nicht mehr an. Danke.", erwartet: "abmeldung" },
  { betreff: "Werbung", text: "Wir möchten keine weiteren E-Mails von Ihnen erhalten.", erwartet: "abmeldung" },
  { betreff: "AW:", text: "Bitte nehmen Sie uns aus dem Verteiler.", erwartet: "abmeldung" },

  // ── Abwesenheit (darf NICHT als Abmeldung zählen) ──
  { betreff: "Automatische Antwort: Ihr Elektroniker", text: "Ich bin bis zum 15.08. im Urlaub und nicht im Hause. Vertretung: Frau Meier.", erwartet: "abwesenheit" },
  { betreff: "Out of Office", text: "Ich bin außer Haus und lese keine E-Mails.", erwartet: "abwesenheit" },

  // ── Unzustellbar ──
  { betreff: "Undeliverable: Ihr SHK-Mechaniker", text: "550 5.1.1 recipient address rejected: user unknown", erwartet: "unzustellbar" },
  { betreff: "Mail delivery failed", text: "Delivery Status Notification (Failure)", erwartet: "unzustellbar" },

  // ── Echte Antworten (dürfen NICHT gesperrt werden) ──
  { betreff: "AW: Ihr Elektroniker in Westerstede", text: "Klingt spannend, schicken Sie gern mal was rüber.", erwartet: "antwort" },
  { betreff: "AW: Schweißer finden in Wilhelmshaven", text: "Aktuell haben wir kein Interesse, melden uns aber ggf. später.", erwartet: "antwort" },
  { betreff: "Rückfrage", text: "Was kostet so ein Video denn ungefähr?", erwartet: "antwort" },
];

let fehler = 0;
console.log("\n📨 Antwort-Erkennung\n");

for (const f of faelle) {
  const art = bestimmeArt(f.betreff, f.text);
  const ok = art === f.erwartet;
  if (!ok) fehler++;
  const folge = {
    abmeldung: "→ dauerhaft gesperrt",
    unzustellbar: "→ Adresse gesperrt",
    antwort: "→ cooldown, Mensch schaut drauf",
    abwesenheit: "→ ignoriert",
  }[art];
  console.log(`${ok ? "✅" : "❌"} ${art.padEnd(13)} ${folge.padEnd(30)} "${f.betreff || f.text.slice(0, 40)}"`);
  if (!ok) console.log(`   erwartet: ${f.erwartet}`);
}

console.log(`\n${faelle.length - fehler}/${faelle.length} korrekt${fehler ? ` — ${fehler} FEHLER` : ""}\n`);
if (fehler > 0) process.exit(1);
