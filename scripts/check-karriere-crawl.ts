/**
 * Prüft den Karriereseiten-Crawler gegen echte Websites — ohne Datenbank,
 * ohne Versand, ohne API-Key. Zeigt, welche Stellentitel erkannt werden.
 *
 * Aufruf:
 *   npx tsx scripts/check-karriere-crawl.ts https://www.beispiel-handwerk.de
 *   npx tsx scripts/check-karriere-crawl.ts url1 url2 url3
 *
 * Damit lässt sich der Parser an euren echten Zielbetrieben kalibrieren,
 * bevor irgendetwas in die Datenbank geschrieben wird.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { crawlKarriereseite } from "../lib/stellensignale/crawl-karriere";
import { pruefeAnzeige } from "../lib/stellensignale/filter";
import { istFachkraft } from "../lib/stellensignale/qualify";
import type { Zielfirma } from "../types/stellensignale";

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("\nBitte mindestens eine Website angeben:\n  npx tsx scripts/check-karriere-crawl.ts https://www.firma.de\n");
  process.exit(1);
}

function dummyFirma(website: string): Zielfirma {
  const now = new Date().toISOString();
  return {
    id: "test", firma: new URL(website).hostname.replace(/^www\./, ""),
    website, karriere_url: null, gewerk: null, ort: null, plz: null,
    mitarbeiter_geschaetzt: null, gf_name: null, email: null,
    email_quelle: null, email_confidence: null, status: "aktiv",
    cooldown_bis: null, quelle: "test", created_at: now, updated_at: now,
  };
}

async function run() {
  for (const raw of urls) {
    const website = raw.startsWith("http") ? raw : `https://${raw}`;
    console.log(`\n${"─".repeat(70)}\n🔎 ${website}`);

    const start = Date.now();
    let ergebnis;
    try {
      ergebnis = await crawlKarriereseite(dummyFirma(website));
    } catch (e) {
      console.log(`   ❌ Fehler: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const dauer = ((Date.now() - start) / 1000).toFixed(1);

    if (!ergebnis.ermittelteKarriereUrl) {
      console.log(`   ⚠️  Keine Karriereseite gefunden (${dauer}s)`);
      console.log("      Möglich: anderer Pfad, JavaScript-Seite oder kein Karrierebereich.");
      continue;
    }

    console.log(`   ✅ Karriereseite: ${ergebnis.ermittelteKarriereUrl}  (${dauer}s)`);
    console.log(`   ${ergebnis.anzeigen.length} Titel erkannt:\n`);

    for (const a of ergebnis.anzeigen) {
      const filter = pruefeAnzeige(a, { firmaWebsite: website, blacklist: [] });
      const fachkraft = istFachkraft(a);
      const marker = !filter.akzeptiert ? "⛔" : fachkraft ? "🎯" : "· ";
      const zusatz = !filter.akzeptiert
        ? `  (verworfen: ${filter.grund})`
        : fachkraft ? "  (Fachkraft)" : "  (keine Fachkraft)";
      console.log(`   ${marker} ${a.stellentitel}${zusatz}`);
    }

    const relevant = ergebnis.anzeigen.filter(
      (a) => pruefeAnzeige(a, { firmaWebsite: website, blacklist: [] }).akzeptiert && istFachkraft(a),
    );
    console.log(`\n   → ${relevant.length} verwertbare Fachkraft-Signale`);
  }
  console.log("");
}

run().catch((e) => { console.error(e); process.exit(1); });
