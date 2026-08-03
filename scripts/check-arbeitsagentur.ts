/**
 * Prüft die Arbeitsagentur-Discovery gegen die echte API — ohne Datenbank,
 * ohne Versand, ohne Kosten. Zeigt, wie viele verwertbare Betriebe je
 * Ort/Gewerk-Kombination herauskommen und was der Blacklist-Filter wegwirft.
 *
 * Aufruf:
 *   npx tsx scripts/check-arbeitsagentur.ts Oldenburg elektro
 *   npx tsx scripts/check-arbeitsagentur.ts Oldenburg          # alle Gewerke
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.STELLENSIGNALE_ARBEITSAGENTUR = "true"; // nur für diesen Testlauf

import { discoverArbeitsagentur, zaehleArbeitsagentur } from "../lib/stellensignale/platforms/arbeitsagentur";
import { istAusgeschlossen } from "../lib/stellensignale/filter";
import { istFachkraft } from "../lib/stellensignale/qualify";
import { GEWERKE } from "../types/stellensignale";

const ort = process.argv[2] ?? "Oldenburg";
const gewerke = process.argv[3] ? [process.argv[3]] : GEWERKE;

async function run() {
  console.log(`\n🔎 Arbeitsagentur-Jobbörse · ${ort} · Umkreis ${process.env.STELLENSIGNALE_BA_UMKREIS ?? "35"} km\n`);

  let gesamtBetriebe = 0;
  const alleFirmen = new Set<string>();

  for (const gewerk of gewerke) {
    const total = await zaehleArbeitsagentur(ort, gewerk);
    const treffer = await discoverArbeitsagentur(ort, gewerk);

    const gefiltert = treffer.filter((t) => !istAusgeschlossen(t.firma));
    const verworfen = treffer.length - gefiltert.length;
    const fachkraft = gefiltert.filter((t) => istFachkraft({ stellentitel: t.stellentitel, raw_text: t.raw_text }));

    const firmen = new Set(fachkraft.map((t) => t.firma));
    firmen.forEach((f) => alleFirmen.add(f));
    gesamtBetriebe += firmen.size;

    console.log(`── ${gewerk.padEnd(10)} ${String(total ?? "?").padStart(5)} Anzeigen gesamt`);
    console.log(`   ${String(treffer.length).padStart(3)} geladen · ${String(verworfen).padStart(3)} Personaldienstleister raus · ${String(fachkraft.length).padStart(3)} Fachkraft · ${firmen.size} verschiedene Betriebe`);

    for (const t of fachkraft.slice(0, 5)) {
      console.log(`      · ${t.firma} — ${t.stellentitel} (${t.ort})`);
    }
    // Kurze Pause: die API ist ein fremder Dienst, kein Selbstbedienungsladen.
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n📊 ${alleFirmen.size} verschiedene Betriebe mit Fachkraft-Bedarf in ${ort}`);
  console.log(`   (Summe über Gewerke: ${gesamtBetriebe} — Differenz = Betriebe, die mehrere Gewerke suchen)\n`);
}

run().catch((e) => { console.error(e); process.exit(1); });
