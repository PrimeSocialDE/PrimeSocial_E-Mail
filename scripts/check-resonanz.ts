/**
 * Prueft, ob das Resonanz-Protokoll bereit ist, und zeigt den Stand.
 *
 * LIEST NUR. Schreibt nichts, versendet nichts.
 *
 * Nach dem Einspielen von 20260804_stellensignale_resonanz.sql einmal
 * ausfuehren — dann steht fest, ob Tabelle, Rechte und Auswertung stimmen,
 * bevor die erste echte Mail rausgeht.
 *
 *   npx tsx scripts/check-resonanz.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getClient } from "../lib/supabase";
import { nischenStatistik, letzteAntworten, gesamtbild, MINDESTMENGE_NISCHE } from "../lib/stellensignale/resonanz";

const GEWERK_LABEL: Record<string, string> = {
  elektro: "Elektro", shk: "Heizung / Sanitaer", metall: "Metallbau",
  bau: "Bau / Dach / Zimmerei", galabau: "Garten- & Landschaftsbau",
  industrie: "Industrie & Produktion",
};

function quote(n: number | null): string {
  return n === null ? "  —  " : `${n.toFixed(1).padStart(5)} %`;
}

async function run() {
  console.log(`\n📊 Resonanz-Protokoll\n${"═".repeat(70)}\n`);

  // ── 1. Existiert die Tabelle? ──
  const probe = await getClient().from("stellen_ereignisse").select("id").limit(1);
  if (probe.error) {
    console.log(`   ❌ Tabelle nicht erreichbar: ${probe.error.message}\n`);
    if (/does not exist|schema cache/i.test(probe.error.message)) {
      console.log(`   → Migration noch nicht eingespielt:`);
      console.log(`     supabase/migrations/20260804_stellensignale_resonanz.sql\n`);
    }
    process.exit(1);
  }
  console.log(`   ✅ Tabelle stellen_ereignisse erreichbar\n`);

  // ── 2. Gesamtbild ──
  const g = await gesamtbild();
  console.log(`   versendet      ${String(g.versendet).padStart(5)}`);
  console.log(`   zugestellt     ${String(g.zugestellt).padStart(5)}`);
  console.log(`   Antworten      ${String(g.antworten).padStart(5)}   ${quote(g.antwortquote)}`);
  console.log(`   Abmeldungen    ${String(g.abmeldungen).padStart(5)}   ${quote(g.aergerquote)}`);
  console.log(`   unzustellbar   ${String(g.unzustellbar).padStart(5)}`);
  if (g.warnung) console.log(`\n   ⚠️  ${g.warnung}`);

  if (g.versendet === 0) {
    console.log(`\n   Noch nichts versendet — die Auswertung fuellt sich ab der ersten Mail.`);
    console.log(`   Der Aufbau stimmt, es fehlen nur Daten.\n`);
    return;
  }

  // ── 3. Nischen ──
  const nischen = await nischenStatistik();
  console.log(`\n${"─".repeat(70)}\n   Nach Nische   (Quote erst ab ${MINDESTMENGE_NISCHE} versendeten Mails)\n`);
  console.log(`   ${"Nische".padEnd(26)} ${"vers.".padStart(6)} ${"zug.".padStart(6)} ${"Antw.".padStart(6)}  Quote`);
  for (const n of nischen) {
    const label = (GEWERK_LABEL[n.gewerk] ?? n.gewerk).padEnd(26).slice(0, 26);
    const q = n.aussagekraeftig ? quote(n.antwortquote) : "  (zu wenig)";
    console.log(`   ${label} ${String(n.versendet).padStart(6)} ${String(n.zugestellt).padStart(6)} ${String(n.antworten).padStart(6)}  ${q}`);
  }

  const beste = nischen.find((n) => n.aussagekraeftig);
  if (beste) {
    console.log(`\n   → Staerkste Nische: ${GEWERK_LABEL[beste.gewerk] ?? beste.gewerk} (${quote(beste.antwortquote).trim()})`);
  } else {
    console.log(`\n   → Noch keine Nische mit genug Daten fuer eine belastbare Quote.`);
  }

  // ── 4. Antworten ──
  const antworten = await letzteAntworten(10);
  if (antworten.length > 0) {
    console.log(`\n${"─".repeat(70)}\n   Letzte Antworten\n`);
    for (const a of antworten) {
      const wann = new Date(a.zeitpunkt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
      console.log(`   ${wann}  ${a.firma}${a.schritt ? ` (auf Mail ${a.schritt})` : ""}`);
      if (a.betreff) console.log(`              ${a.betreff.slice(0, 70)}`);
    }
  }

  console.log(`\n   Dashboard: /stellensignale/resonanz\n`);
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
