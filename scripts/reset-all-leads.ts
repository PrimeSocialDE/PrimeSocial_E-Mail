/**
 * HARD-Reset: setzt alle Leads im Tool in den frischen Eingangs-Zustand
 * zurück, als wären sie gerade neu hochgeladen worden.
 *
 * Was passiert:
 *   - Alle Workflow-/Tracking-Felder auf primesocial_leads werden geleert
 *     (segment, status, instagram_data, alle attempts/Timestamps, Signals)
 *   - Lead-Basisdaten bleiben (company_name, email, instagram_handle, website_url)
 *   - email_drafts, dashboard_todos, pitch_pages, pitch_page_events, emails_sent
 *     werden komplett geleert
 *
 * Sicherheits-Modus:
 *   - Standard: Dry-Run (zeigt nur was passieren würde)
 *   - Mit Flag --confirm: führt den Reset wirklich aus
 *
 * Aufruf:
 *   npx tsx scripts/reset-all-leads.ts            # Dry-Run
 *   npx tsx scripts/reset-all-leads.ts --confirm  # Real
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const CONFIRM = process.argv.includes("--confirm");

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Vor-Stand zeigen
  const { count: leadCount }   = await sb.from("primesocial_leads").select("*", { count: "exact", head: true });
  const { count: draftCount }  = await sb.from("email_drafts").select("*",   { count: "exact", head: true });
  const { count: sentCount }   = await sb.from("emails_sent").select("*",    { count: "exact", head: true });
  const { count: pitchCount }  = await sb.from("pitch_pages").select("*",    { count: "exact", head: true });
  const { count: todoCount }   = await sb.from("dashboard_todos").select("*",{ count: "exact", head: true }).then(r => r).catch(() => ({ count: 0 }));

  console.log("\nVor-Stand:");
  console.log(`  primesocial_leads: ${leadCount}`);
  console.log(`  email_drafts:     ${draftCount}`);
  console.log(`  emails_sent:      ${sentCount}`);
  console.log(`  pitch_pages:      ${pitchCount}`);
  console.log(`  dashboard_todos:  ${todoCount}`);

  if (!CONFIRM) {
    console.log("\n🟡 Dry-Run — nichts geändert.");
    console.log("   Mit `--confirm` ausführen, um wirklich zu resetten.\n");
    return;
  }

  console.log("\n🔴 RESET LÄUFT...\n");

  // 1) Child-Tabellen leeren (FK-Reihenfolge)
  console.log("  → Lösche dashboard_todos...");
  await sb.from("dashboard_todos").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("  → Lösche pitch_page_events...");
  // pitch_page_events hat FK auf pitch_pages, also vor pitch_pages
  await sb.from("pitch_page_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("  → Lösche email_drafts...");
  await sb.from("email_drafts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("  → Lösche emails_sent...");
  await sb.from("emails_sent").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("  → Lösche pitch_pages...");
  await sb.from("pitch_pages").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 2) Lead-Workflow-Felder zurücksetzen (Basisdaten bleiben)
  console.log("  → Setze Lead-Workflow-Felder zurück...");
  const { error: leadErr } = await sb
    .from("primesocial_leads")
    .update({
      segment:                  null,
      segment_reasoning:        null,
      status:                   "new",
      workflow_step:            0,
      workflow_started_at:      null,
      next_touchpoint_at:       null,
      pause_reason:             null,
      scrape_attempts:          0,
      summary_attempts:         0,
      last_scrape_attempt_at:   null,
      last_summary_attempt_at:  null,
      last_scraped_at:          null,
      instagram_data:           null,
      instagram_problem:        null,
      pitch_page_id:            null,
      pitch_page_url:           null,
      pitch_lead_type:          null,
      pitch_visited_at:         null,
      pitch_cta_clicked_at:     null,
      calendly_booked_at:       null,
      newsletter_subscribed_at: null,
    })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (leadErr) {
    console.error("❌ Lead-Reset fehlgeschlagen:", leadErr.message);
    process.exit(1);
  }

  console.log("\n✅ Reset abgeschlossen. Alle Leads sind wieder im Zustand 'neu hochgeladen'.");
  console.log("   Beim nächsten Cron-Lauf (oder manuellem Trigger) werden bis zu 10 verarbeitet.\n");
}

run().catch((e) => {
  console.error("💥", e);
  process.exit(1);
});
