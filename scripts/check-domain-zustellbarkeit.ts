/**
 * Prüft, ob eine Absender-Domain technisch zustellbar aufgesetzt ist.
 * Reine DNS-Abfragen — verschickt nichts, ändert nichts.
 *
 * Aufruf:
 *   npx tsx scripts/check-domain-zustellbarkeit.ts primesocial.de
 *   npx tsx scripts/check-domain-zustellbarkeit.ts domain1.de domain2.de
 *
 * Ohne SPF, DKIM und DMARC landet Kaltakquise bei Google und Microsoft
 * zuverlässig im Spam — unabhängig davon, wie gut der Text ist.
 */
import { Resolver } from "dns/promises";

// BEWUSST öffentliche Resolver statt des System-Resolvers: der cacht negative
// Antworten. Wer einen DNS-Eintrag gerade erst gesetzt hat und danach prüft,
// bekommt sonst minutenlang "fehlt" gemeldet, obwohl der Eintrag längst live
// ist — und sucht den Fehler an der falschen Stelle. Genau das ist beim
// Aufsetzen von primesocial-videos.de passiert.
const dns = new Resolver();
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const domains = process.argv.slice(2);
if (domains.length === 0) {
  console.error("\nBitte mindestens eine Domain angeben:\n  npx tsx scripts/check-domain-zustellbarkeit.ts primesocial.de\n");
  process.exit(1);
}

async function txt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((r) => r.join(""));
  } catch {
    return [];
  }
}

async function pruefe(domain: string) {
  console.log(`\n${"═".repeat(64)}\n🌐 ${domain}\n`);

  // ── MX: kann die Domain überhaupt Antworten empfangen? ──
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) {
      console.log(`✅ MX        ${mx.sort((a, b) => a.priority - b.priority)[0].exchange}`);
    } else {
      console.log("❌ MX        keine Einträge — Antworten kommen nirgends an");
    }
  } catch {
    console.log("❌ MX        keine Einträge — Antworten kommen nirgends an");
  }

  // ── SPF: wer darf im Namen dieser Domain senden? ──
  const spf = (await txt(domain)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
  if (spf.length === 0) {
    console.log("❌ SPF       fehlt — Empfänger können den Absender nicht prüfen");
  } else if (spf.length > 1) {
    console.log(`❌ SPF       ${spf.length} Einträge — mehr als einer ist ungültig, beide werden ignoriert`);
  } else {
    const eintrag = spf[0];
    const ses = /amazonses\.com/i.test(eintrag);
    const brevo = /(sendinblue|brevo)/i.test(eintrag);
    const hart = /-all\s*$/.test(eintrag);
    console.log(`✅ SPF       ${eintrag}`);
    console.log(`             Amazon SES: ${ses ? "ja" : "NEIN"} · Brevo: ${brevo ? "ja" : "nein"} · Policy: ${hart ? "-all (streng)" : "~all (weich)"}`);
    if (!ses && !brevo) console.log("             ⚠️  Kein bekannter Versanddienst freigegeben");
  }

  // ── DMARC: was soll passieren, wenn die Prüfung fehlschlägt? ──
  const dmarc = (await txt(`_dmarc.${domain}`)).filter((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (dmarc.length === 0) {
    console.log("❌ DMARC     fehlt — seit 2024 verlangen Google und Microsoft das für Massenversand");
  } else {
    const p = dmarc[0].match(/p=(none|quarantine|reject)/i)?.[1] ?? "?";
    console.log(`✅ DMARC     ${dmarc[0]}`);
    console.log(`             Policy: p=${p}${p === "none" ? " (Beobachtung — richtig für den Start)" : ""}`);
  }

  // ── DKIM: signiert der Versanddienst die Mails? ──
  // SES nutzt drei Selektoren <token>._domainkey; die Tokens kennen wir nicht,
  // deshalb prüfen wir die gängigen Selektoren anderer Dienste mit.
  const selektoren = ["brevo", "mail", "default", "google", "selector1", "selector2", "k1", "s1", "s2"];
  const gefunden: string[] = [];
  for (const s of selektoren) {
    const rec = await txt(`${s}._domainkey.${domain}`);
    if (rec.some((r) => /v=DKIM1/i.test(r))) gefunden.push(s);
  }
  if (gefunden.length > 0) {
    console.log(`✅ DKIM      Selektoren gefunden: ${gefunden.join(", ")}`);
  } else {
    console.log("⚠️  DKIM      über gängige Selektoren nicht gefunden");
    console.log("             Bei SES sind es CNAMEs auf <token>._domainkey — die lassen sich");
    console.log("             ohne die Tokens nicht erraten. In der SES-Konsole prüfen:");
    console.log("             Verified identities → Domain → DKIM: 'Successful'");
  }
}

async function run() {
  for (const d of domains) await pruefe(d.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  console.log(`\n${"═".repeat(64)}`);
  console.log("Hinweis: DNS sagt nur, ob die Technik stimmt. Ob eine Mail im");
  console.log("Posteingang landet, hängt zusätzlich an Domain-Reputation,");
  console.log("Versandmenge und Beschwerderate — und die entstehen erst im Betrieb.\n");
}

run().catch((e) => { console.error(e); process.exit(1); });
