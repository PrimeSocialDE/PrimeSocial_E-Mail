/**
 * SAMMELN BIS ZIEL — läuft so lange, bis genug anschreibbare Betriebe da sind.
 *
 * Gedacht als der eine Befehl, den man vor einer Versandwoche ausführt:
 * "besorg mir Vorrat für die nächsten Tage". Arbeitet die Zentren der Region
 * der Reihe nach ab und hört auf, sobald das Ziel erreicht ist.
 *
 * Ablauf je Runde:
 *   1. OpenStreetMap für die nächsten Orte  → Betriebe der Region
 *   2. Arbeitsagentur für die Ziel-Orte     → wer sucht gerade (nur Runde 1)
 *   3. Karriereseiten bekannter Firmen      → unabhängiges Zweitsignal
 *   4. Website-Ermittlung                   → Domain aus dem Firmennamen
 *   5. E-Mail-Findung                       → Impressum
 *   6. Zählen: wie viele sind anschreibbar?
 *
 * KOSTET NICHTS. Ausschließlich kostenlose Quellen und HTTP-Abrufe. Es werden
 * KEINE Entwürfe erzeugt (das ist der einzige Schritt, der Geld kostet) und
 * nichts versendet.
 *
 * Aufruf:
 *   npx tsx scripts/sammeln-bis-ziel.ts            # Ziel: 40 anschreibbare
 *   npx tsx scripts/sammeln-bis-ziel.ts 80         # eigenes Ziel
 *   npx tsx scripts/sammeln-bis-ziel.ts 40 --dry   # nur zeigen, was käme
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Kostenlose Quellen fuer diesen Lauf aktivieren — unabhaengig davon, was in
// Vercel gesetzt ist. Kostenpflichtige Quellen bleiben aus.
process.env.STELLENSIGNALE_OSM = "true";
process.env.STELLENSIGNALE_ARBEITSAGENTUR = "true";
process.env.STELLENSIGNALE_MAX_QUERIES ??= "40";

import regionenData from "../data/stellensignale-regionen.json";
import zieleData from "../data/stellensignale-targets.json";
import { runOsmDiscovery } from "../lib/stellensignale/discover-osm";
import { runDiscovery } from "../lib/stellensignale/discover";
import { runKarriereCrawl } from "../lib/stellensignale/pipeline";
import { runWebsiteEnrichment } from "../lib/stellensignale/website-enrichment";
import { runEmailEnrichment } from "../lib/stellensignale/email-finder";
import { getZielfirmen, getFirmenFuerEntwurf } from "../lib/stellensignale/db";
import type { DiscoveryZiel } from "../types/stellensignale";

const ZIEL = parseInt(process.argv.find((a) => /^\d+$/.test(a)) ?? "40", 10);
const dryRun = process.argv.includes("--dry");

interface Zentrum { stadt: string; km_ab_oldenburg?: number }
const ZENTREN = (regionenData as { zentren?: Zentrum[] }).zentren ?? [];
const ZIELE = (zieleData as { ziele?: DiscoveryZiel[] }).ziele ?? [];

const ORTE_PRO_RUNDE = 4;
const MAX_RUNDEN = 10;

async function anschreibbar(): Promise<number> {
  return (await getFirmenFuerEntwurf(1000)).length;
}

async function run() {
  console.log(`\n🎯 Sammeln bis ${ZIEL} anschreibbare Betriebe${dryRun ? "  (DRY RUN)" : ""}\n${"═".repeat(66)}`);
  console.log(`   ${ZENTREN.length} Zentren verfügbar, ${ORTE_PRO_RUNDE} pro Runde, max. ${MAX_RUNDEN} Runden`);
  console.log("   Nur kostenlose Quellen. Keine Entwürfe, kein Versand.\n");

  if (dryRun) {
    console.log("   Reihenfolge der Orte (nach Nähe zu Oldenburg):");
    ZENTREN.slice(0, ORTE_PRO_RUNDE * MAX_RUNDEN).forEach((z, i) => {
      if (i % ORTE_PRO_RUNDE === 0) console.log(`\n   Runde ${i / ORTE_PRO_RUNDE + 1}:`);
      process.stdout.write(`  ${z.stadt}`);
    });
    console.log("\n\n   DRY RUN beendet.\n");
    return;
  }

  const start = await anschreibbar();
  console.log(`   Ausgangslage: ${start} anschreibbar\n`);
  if (start >= ZIEL) {
    console.log(`   ✅ Ziel bereits erreicht. Nichts zu tun.\n`);
    return;
  }

  const heute = new Date().toISOString().slice(0, 10);
  let runde = 0;
  let stand = start;

  while (stand < ZIEL && runde < MAX_RUNDEN && runde * ORTE_PRO_RUNDE < ZENTREN.length) {
    runde++;
    const orte = ZENTREN.slice((runde - 1) * ORTE_PRO_RUNDE, runde * ORTE_PRO_RUNDE).map((z) => z.stadt);
    console.log(`${"─".repeat(66)}\nRunde ${runde}: ${orte.join(", ")}\n`);

    // 1) Firmen der Region
    const osm = await runOsmDiscovery({ orte, maxOrte: orte.length });
    console.log(`   OSM:        ${osm.neueFirmen} neu · ${osm.websitesNachgetragen} Websites ergänzt · ${osm.verworfen} verworfen`);
    for (const f of osm.fehler.slice(0, 2)) console.log(`               ⚠️  ${f}`);

    // 2) Stellensignale — nur in Runde 1, die Ziel-Orte ändern sich nicht
    if (runde === 1) {
      const d = await runDiscovery({ ziele: ZIELE, heute });
      console.log(`   Stellen:    ${d.neueFirmen} neue Firmen · ${d.trefferGesamt} Anzeigen`);
      for (const f of d.fehler.slice(0, 2)) console.log(`               ⚠️  ${f}`);
    }

    // 3) Karriereseiten — unabhängig von fremden Diensten
    const k = await runKarriereCrawl({ heute, deadlineMs: 90_000 });
    console.log(`   Karriere:   ${k.firmenBearbeitet} Firmen · ${k.signaleUpserted} Signale`);

    // 4) Websites
    const w = await runWebsiteEnrichment({ limit: 120, deadlineMs: 180_000 });
    console.log(`   Websites:   ${w.gefunden} gefunden · ${w.gesperrt} als Dienstleister gesperrt · ${w.ohneTreffer} ohne`);

    // 5) E-Mails
    const e = await runEmailEnrichment() as { gefunden?: number; geprueft?: number };
    console.log(`   E-Mails:    ${e.gefunden ?? 0} von ${e.geprueft ?? 0} geprüften`);

    stand = await anschreibbar();
    console.log(`\n   → ${stand} anschreibbar (Ziel ${ZIEL})`);
  }

  // ── Bilanz ──
  const alle = await getZielfirmen();
  const aktiv = alle.filter((f) => f.status === "aktiv");
  console.log(`\n${"═".repeat(66)}\n📊 Bilanz\n`);
  console.log(`   Firmen gesamt:      ${alle.length}`);
  console.log(`   davon aktiv:        ${aktiv.length}`);
  console.log(`   mit Website:        ${aktiv.filter((f) => f.website).length}`);
  console.log(`   mit E-Mail:         ${aktiv.filter((f) => f.email).length}`);
  console.log(`   ANSCHREIBBAR:       ${stand}   (Start: ${start}, +${stand - start})`);

  // Reichweite gegen den Warmup — die Zahl, die im Alltag zaehlt.
  const proTag = [5, 10, 20, 30];
  let rest = stand, tage = 0, w2 = 0;
  while (rest > 0 && w2 < proTag.length) { const n = Math.min(rest, proTag[w2] * 5); rest -= n; tage += Math.ceil(n / proTag[w2]); w2++; }
  console.log(`\n   Reicht für etwa ${tage} Versandtage (Warmup 5/10/20/30 pro Tag).`);
  console.log(`   Mit Nachfass-Mails deutlich länger, weil nur ein Drittel Erstansprachen sind.`);

  if (stand < ZIEL) {
    console.log(`\n   ⚠️  Ziel nicht erreicht. Mögliche Gründe:`);
    console.log(`       • Arbeitsagentur-API gesperrt (siehe Warnungen oben)`);
    console.log(`       • Overpass überlastet — später erneut versuchen`);
    console.log(`       • Zentren aufgebraucht: erst ${runde * ORTE_PRO_RUNDE} von ${ZENTREN.length} durch`);
    console.log(`       Einfach nochmal starten, der Lauf setzt dort fort, wo Firmen fehlen.`);
  }
  console.log("\n   Nächster Schritt: Entwürfe erzeugen (kostet ~3 Cent je Betrieb).\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
