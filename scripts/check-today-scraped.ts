/**
 * Listet alle Leads die seit heute 00:00 Uhr gescrapt oder segmentiert wurden.
 * Zeigt direkt nach welchem Pattern der Apify-Cron heute durch ist.
 *
 * Aufruf: npx tsx scripts/check-today-scraped.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  // Heute gescrapt: last_scrape_attempt_at >= heute (egal ob Erfolg oder Retry)
  // ODER last_scraped_at >= heute (Erfolgsfall, falls vor der 24h-Pause-Migration gescrapt)
  const { data, error } = await sb
    .from("primesocial_leads")
    .select("id, company_name, segment, status, scrape_attempts, summary_attempts, last_scrape_attempt_at, last_scraped_at, instagram_handle, instagram_problem, pause_reason, updated_at")
    .gte("updated_at", todayIso)
    .not("segment", "is", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("❌ DB-Fehler:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("⚠️  Heute (seit 00:00 Uhr) wurden keine Leads gescrapt/aktualisiert.");
    console.log("   Mögliche Ursachen:");
    console.log("   - Daily-Cron hat (noch) nicht gefeuert (läuft 07:00 UTC = 09:00 dt. Sommerzeit)");
    console.log("   - CRON_SECRET in Vercel falsch gesetzt");
    console.log("   - Keine Leads im 'new'-Status zu verarbeiten");
    return;
  }

  console.log(`✅ ${data.length} Lead${data.length === 1 ? "" : "s"} heute angefasst:\n`);

  const bySegment: Record<string, number> = {};
  for (const lead of data) {
    const seg = lead.segment ?? "—";
    bySegment[seg] = (bySegment[seg] ?? 0) + 1;
    const time = lead.last_scrape_attempt_at ?? lead.last_scraped_at ?? lead.updated_at;
    const timeStr = time ? new Date(time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—";
    const attempts = lead.scrape_attempts > 0 ? ` (Retry ${lead.scrape_attempts}/3)` : "";
    const problem = lead.instagram_problem ? `  ⚠ ${lead.instagram_problem.slice(0, 80)}` : "";
    console.log(`  ${timeStr}  ${(lead.segment ?? "?").padEnd(16)}  ${lead.company_name}${attempts}${problem}`);
  }

  console.log("\nSegment-Verteilung:");
  for (const [seg, count] of Object.entries(bySegment).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${seg.padEnd(16)} ${count}`);
  }
}

run().catch((e) => {
  console.error("💥", e);
  process.exit(1);
});
