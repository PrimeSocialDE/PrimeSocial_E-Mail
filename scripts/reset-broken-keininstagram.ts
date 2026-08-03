/**
 * Setzt Leads zurück, die heute fälschlich als KEININSTAGRAM markiert
 * wurden — Ursache war der proxy-agent-Bundling-Bug, nicht ein echtes
 * Instagram-Problem. Erkennungsmerkmal: instagram_problem enthält
 * "Cannot find module 'proxy-agent'".
 *
 * Aufruf: npx tsx scripts/reset-broken-keininstagram.ts
 *
 * Optional: `--dry` zum Anzeigen ohne zu schreiben.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await sb
    .from("primesocial_leads")
    .select("id, company_name, segment, status, scrape_attempts, instagram_problem")
    .ilike("instagram_problem", "%proxy-agent%");

  if (error) {
    console.error("❌ DB-Fehler:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log("✅ Keine vom proxy-agent-Bug betroffenen Leads gefunden.");
    return;
  }

  console.log(`Gefunden: ${data.length} Lead${data.length === 1 ? "" : "s"} mit proxy-agent-Fehler\n`);
  for (const lead of data) {
    console.log(`  ${(lead.segment ?? "?").padEnd(16)}  ${lead.company_name}  (scrape_attempts=${lead.scrape_attempts})`);
  }

  if (DRY) {
    console.log("\n🟡 Dry-Run — nichts geändert. Ohne --dry ausführen zum Zurücksetzen.");
    return;
  }

  const ids = data.map((l) => l.id);
  const { error: updateErr } = await sb
    .from("primesocial_leads")
    .update({
      segment: null,
      status: "new",
      scrape_attempts: 0,
      last_scrape_attempt_at: null,
      pause_reason: null,
      instagram_problem: null,
    })
    .in("id", ids);

  if (updateErr) {
    console.error("❌ Update fehlgeschlagen:", updateErr.message);
    process.exit(1);
  }
  console.log(`\n✅ ${ids.length} Lead${ids.length === 1 ? "" : "s"} zurückgesetzt. Beim nächsten Cron-Lauf (morgen 09:00 dt. Zeit) werden sie neu probiert.`);
}

run().catch((e) => {
  console.error("💥", e);
  process.exit(1);
});
