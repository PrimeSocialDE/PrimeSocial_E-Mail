/**
 * Legt die vier recherchierten Betriebe als Zielfirmen an und erzeugt Entwürfe.
 *
 * SCHREIBT in zielfirmen und stellen_signale — aber nur INSERT. Bestehende
 * Firmen werden erkannt und übersprungen, nichts wird überschrieben.
 * VERSENDET NICHTS: Entwürfe entstehen mit status='entwurf' und warten auf
 * die Freigabe im Dashboard.
 *
 * Aufruf:
 *   npx tsx scripts/import-demo-betriebe.ts --dry   # nur zeigen, was passieren würde
 *   npx tsx scripts/import-demo-betriebe.ts         # anlegen + Entwürfe erzeugen
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getZielfirmen, createZielfirma, upsertSignal, getFirmenFuerEntwurf } from "../lib/stellensignale/db";
import { scrapeWebsiteForContact } from "../lib/website-scraper";
import { runEntwuerfe } from "../lib/stellensignale/entwurf";
import { domainOf } from "../lib/stellensignale/filter";
import type { ZielfirmaStatus } from "../types/stellensignale";

const dryRun = process.argv.includes("--dry");

const BETRIEBE = [
  { firma: "ABGtherm GmbH & Co. KG",           website: "https://www.abgtherm.de",       ort: "Westerstede",    plz: "26655", gewerk: "shk",       stelle: "Anlagenmechaniker SHK (m/w/d)" },
  { firma: "De Strippentrecker",               website: "https://www.strippentrecker.de", ort: "Westerstede",   plz: "26655", gewerk: "elektro",   stelle: "Elektroniker für Energie- und Gebäudetechnik (m/w/d)" },
  { firma: "MOIN SOLAR GmbH",                  website: "https://www.moinsolar.de",       ort: "Westerstede",   plz: "26655", gewerk: "elektro",   stelle: "Elektroniker Energie- und Gebäudetechnik (m/w/d)" },
  { firma: "INTERMEDT Medizin & Technik GmbH", website: "https://www.intermedt.de",       ort: "Ostrhauderfehn", plz: "26842", gewerk: "industrie", stelle: "Elektroniker (w/m/d)" },
];

async function run() {
  console.log(`\n📥 Betriebe anlegen${dryRun ? "  (DRY RUN — nichts wird geschrieben)" : ""}\n`);

  const bestand = await getZielfirmen();
  const bekannt = new Set(bestand.map((f) => domainOf(f.website) ?? f.firma.toLowerCase()));
  const heute = new Date().toISOString().slice(0, 10);

  let neu = 0, uebersprungen = 0;

  for (const b of BETRIEBE) {
    const key = domainOf(b.website) ?? b.firma.toLowerCase();
    if (bekannt.has(key)) {
      console.log(`   ⏭  ${b.firma} — steht schon in der Datenbank`);
      uebersprungen++;
      continue;
    }

    // E-Mail und Geschäftsführung frisch aus dem Impressum.
    const kontakt = await scrapeWebsiteForContact(b.website);
    console.log(`   ${kontakt.bestEmail ? "✅" : "⚠️ "} ${b.firma}`);
    console.log(`      ${kontakt.bestEmail ?? "keine E-Mail gefunden"}${kontakt.gfName ? ` · ${kontakt.gfName}` : ""}`);

    if (dryRun) { neu++; continue; }

    const firma = await createZielfirma({
      firma: b.firma, website: b.website, karriere_url: null, gewerk: b.gewerk,
      ort: b.ort, plz: b.plz, mitarbeiter_geschaetzt: null,
      gf_name: kontakt.gfName, email: kontakt.bestEmail,
      email_quelle: kontakt.bestEmail ? "impressum" : null,
      email_confidence: kontakt.bestEmail ? 90 : null,
      status: "aktiv" as ZielfirmaStatus, cooldown_bis: null,
      quelle: "recherche-demo",
    });

    await upsertSignal({
      zielfirma_id: firma.id, stellentitel: b.stelle, quelle: "arbeitsagentur",
      quelle_url: null, ist_fachkraft: true, raw_text: null, heute,
    });
    neu++;
  }

  console.log(`\n   ${neu} angelegt, ${uebersprungen} übersprungen`);
  if (dryRun) { console.log("\n   DRY RUN beendet.\n"); return; }

  // ── Entwürfe ──
  // getFirmenFuerEntwurf filtert selbst nach Erreichbarkeit — Betriebe unter
  // der Schwelle bekommen bewusst keinen Entwurf und kosten keine Tokens.
  const kandidaten = await getFirmenFuerEntwurf(10);
  console.log(`\n✍️  ${kandidaten.length} Betrieb(e) über der Erreichbarkeits-Schwelle:`);
  for (const k of kandidaten) console.log(`      · ${k.firma} (${k.email})`);

  if (kandidaten.length === 0) { console.log("\n   Keine Entwürfe zu erzeugen.\n"); return; }

  console.log("\n   Erzeuge Sequenzen (je 3 Mails, ein Claude-Aufruf pro Betrieb)...");
  const r = await runEntwuerfe({ limit: kandidaten.length });
  console.log(`   ${r.erzeugt} Sequenz(en) erzeugt, ${r.geprueft} geprüft`);
  for (const f of r.fehler) console.log(`   ⚠️  ${f}`);

  console.log("\n✅ Fertig. Die Entwürfe stehen auf 'entwurf' und warten auf deine Freigabe:");
  console.log("   https://mail.primesocial.de/stellensignale/entwuerfe");
  console.log("   Es wurde NICHTS versendet.\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
