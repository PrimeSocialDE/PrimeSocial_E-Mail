/**
 * Prüft die OSM-Firmensuche gegen die echte Overpass-API — ohne Datenbank,
 * ohne Versand, ohne Kosten. Zeigt, welche Betriebe im Umkreis gefunden werden
 * und wie viele davon eine Website mitbringen.
 *
 * Aufruf:
 *   npx tsx scripts/check-osm.ts Oldenburg
 *   npx tsx scripts/check-osm.ts Wilhelmshaven 25000     # Radius in Metern
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.STELLENSIGNALE_OSM = "true"; // nur für diesen Testlauf

import { discoverOsm } from "../lib/stellensignale/platforms/osm";
import { istAusgeschlossen } from "../lib/stellensignale/filter";

const ort = process.argv[2] ?? "Oldenburg";
const radius = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

async function run() {
  const radiusEffektiv = radius ?? parseInt(process.env.STELLENSIGNALE_OSM_RADIUS_M ?? "30000", 10);
  console.log(`\n🏭 OpenStreetMap · ${ort} · Radius ${radiusEffektiv / 1000} km\n`);

  const treffer = await discoverOsm(ort, radius);
  if (treffer.length === 0) {
    console.log("   Keine Treffer. Ort nicht geokodierbar oder Overpass gerade überlastet.\n");
    return;
  }

  const passend = treffer.filter((t) => !istAusgeschlossen(t.firma));
  const mitWebsite = passend.filter((t) => t.website);

  console.log(`   ${treffer.length} Betriebe gefunden`);
  console.log(`   ${treffer.length - passend.length} aussortiert (Konzern/Personaldienstleister)`);
  console.log(`   ${mitWebsite.length} mit Website → Impressum-Mailsuche möglich\n`);

  // Nach Kategorie gruppieren — zeigt, welche Art Betrieb die Region hergibt.
  const nachKategorie = new Map<string, number>();
  for (const t of passend) {
    const k = (t.kategorie ?? "ohne Angabe").split(":")[0];
    nachKategorie.set(k, (nachKategorie.get(k) ?? 0) + 1);
  }
  console.log("   Nach Art:");
  for (const [k, n] of [...nachKategorie].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(4)} × ${k}`);
  }

  console.log("\n   Betriebe mit Website (die interessanten):");
  for (const t of mitWebsite.slice(0, 25)) {
    const kat = t.kategorie ? ` [${t.kategorie}]` : "";
    console.log(`      · ${t.firma}${kat}`);
    console.log(`        ${t.website}`);
  }
  console.log("");
}

run().catch((e) => { console.error(e); process.exit(1); });
