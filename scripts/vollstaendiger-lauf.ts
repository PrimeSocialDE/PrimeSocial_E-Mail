/**
 * VOLLER DISCOVERY-LAUF über alle Ziel-Orte — lokal, ohne Vercel-Zeitgrenze.
 *
 * Sammelt einmal gründlich ein, damit der Versand über Wochen daraus schöpfen
 * kann. Der Warmup begrenzt ohnehin auf 5 Mails am Tag in Woche 1 — ein
 * grosser Vorrat ist also nützlicher als häufiges Nachscrapen.
 *
 * Ablauf:
 *   1. Arbeitsagentur je Ort × Gewerk  → Firmen + Stellensignale
 *   2. Website-Ermittlung               → Domain aus dem Firmennamen
 *   3. E-Mail-Findung                   → Impressum
 *   4. Trichter-Auswertung              → was ist anschreibbar
 *
 * KOSTET NICHTS: keine bezahlte API, nur HTTP. Es werden KEINE Entwürfe
 * erzeugt — das ist der einzige Schritt, der Geld kostet, und er passiert
 * separat und gedeckelt.
 *
 * Aufruf:
 *   npx tsx scripts/vollstaendiger-lauf.ts --dry   # nur zeigen, was käme
 *   npx tsx scripts/vollstaendiger-lauf.ts         # einsammeln
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.STELLENSIGNALE_ARBEITSAGENTUR = "true";
process.env.STELLENSIGNALE_MAX_QUERIES ??= "40";
process.env.STELLENSIGNALE_BA_SIZE ??= "50";

import zieleData from "../data/stellensignale-targets.json";
import { runDiscovery } from "../lib/stellensignale/discover";
import { runWebsiteEnrichment } from "../lib/stellensignale/website-enrichment";
import { runEmailEnrichment } from "../lib/stellensignale/email-finder";
import { getZielfirmen, getFirmenFuerEntwurf } from "../lib/stellensignale/db";
import type { DiscoveryZiel } from "../types/stellensignale";

const dryRun = process.argv.includes("--dry");
const ZIELE = (zieleData as { ziele?: DiscoveryZiel[] }).ziele ?? [];

async function run() {
  console.log(`\n🚀 Vollständiger Lauf${dryRun ? "  (DRY RUN)" : ""}\n${"═".repeat(66)}`);
  console.log(`   ${ZIELE.length} Orte · ${ZIELE.reduce((n, z) => n + z.gewerke.length, 0)} Kombinationen\n`);
  for (const z of ZIELE) console.log(`   · ${z.ort}: ${z.gewerke.join(", ")}`);

  if (dryRun) { console.log("\n   DRY RUN — nichts ausgeführt.\n"); return; }

  const vorher = (await getZielfirmen()).length;
  const t0 = Date.now();

  // ── 1. Discovery ──
  console.log(`\n${"─".repeat(66)}\n1️⃣  Arbeitsagentur\n`);
  const d = await runDiscovery({ ziele: ZIELE, heute: new Date().toISOString().slice(0, 10) });
  console.log(`   ${d.queriesAusgefuehrt} Abfragen · ${d.trefferGesamt} Anzeigen`);
  console.log(`   ${d.neueFirmen} neue Firmen · ${d.verworfen} Anzeigen verworfen`);
  if (d.fehler.length) for (const f of d.fehler.slice(0, 3)) console.log(`   ⚠️  ${f}`);

  // ── 2. Websites ──
  console.log(`\n${"─".repeat(66)}\n2️⃣  Website-Ermittlung\n`);
  const w = await runWebsiteEnrichment({ limit: 200, deadlineMs: 600_000 });
  console.log(`   ${w.geprueft} geprüft · ${w.gefunden} Websites gefunden`);
  console.log(`   ${w.gesperrt} als Personaldienstleister gesperrt · ${w.ohneTreffer} ohne Treffer`);

  // ── 3. E-Mails ──
  console.log(`\n${"─".repeat(66)}\n3️⃣  E-Mail-Findung (Impressum)\n`);
  const e = await runEmailEnrichment();
  console.log(`   ${JSON.stringify(e)}`);

  // ── 4. Ergebnis ──
  const nachher = await getZielfirmen();
  const aktiv = nachher.filter((f) => f.status === "aktiv");
  const kandidaten = await getFirmenFuerEntwurf(500);

  console.log(`\n${"═".repeat(66)}\n📊 Ergebnis nach ${Math.round((Date.now() - t0) / 1000)} Sekunden\n`);
  console.log(`   Firmen gesamt:            ${vorher} → ${nachher.length}`);
  console.log(`   davon aktiv:              ${aktiv.length}`);
  console.log(`   davon mit Website:        ${aktiv.filter((f) => f.website).length}`);
  console.log(`   davon mit E-Mail:         ${aktiv.filter((f) => f.email).length}`);
  console.log(`   ANSCHREIBBAR:             ${kandidaten.length}`);

  // Reichweite gegen den Warmup rechnen — das ist die Zahl, die zaehlt.
  const proWoche = [5, 10, 20, 30];
  let rest = kandidaten.length, woche = 0;
  while (rest > 0 && woche < proWoche.length) { rest -= proWoche[woche] * 5; woche++; }
  console.log(`\n   Bei Warmup (5/10/20/30 pro Tag) reicht das für ~${woche} Woche(n) Erstansprachen.`);
  console.log(`   Mit Nachfass-Mails entsprechend länger.\n`);

  console.log("   Die besten 15:");
  for (const k of kandidaten.slice(0, 15)) {
    console.log(`     · ${k.firma.padEnd(42).slice(0, 42)} ${k.email ?? ""}`);
  }
  console.log("\n   Noch KEINE Entwürfe erzeugt — das kostet Tokens und passiert separat.\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
