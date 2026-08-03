/**
 * Health-Check für Brevo-Webhook-Verarbeitung:
 *  - Gibt es kürzlich verarbeitete Events (opened_at / clicked_at / bounced)?
 *  - Wie alt sind die letzten 5 Events?
 *  - Gibt es Hinweise auf eine Loop (z.B. ungewöhnlich viele Updates kurz hintereinander)?
 *
 * Aufruf: npx tsx scripts/check-brevo-webhook-health.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Letzte 10 emails_sent die einen Tracking-Event bekommen haben
  const { data: tracked, error: trackedErr } = await sb
    .from("emails_sent")
    .select("id, lead_id, sent_to_email, sent_at, opened_at, clicked_at, bounced, brevo_message_id")
    .or("opened_at.not.is.null,clicked_at.not.is.null,bounced.eq.true")
    .order("sent_at", { ascending: false })
    .limit(10);
  if (trackedErr) { console.error(trackedErr); process.exit(1); }

  console.log(`\n📊 Brevo-Webhook-Health-Check`);
  console.log(`────────────────────────────────────────`);
  console.log(`Letzte ${tracked?.length ?? 0} emails_sent mit Tracking-Events:\n`);

  if (!tracked || tracked.length === 0) {
    console.log("  Keine verarbeiteten Tracking-Events.");
    console.log("  → Entweder: noch keine Mails verschickt, oder Webhook empfaengt nichts.");
  } else {
    for (const t of tracked) {
      const flags: string[] = [];
      if (t.opened_at) flags.push(`opened @ ${new Date(t.opened_at).toLocaleString("de-DE")}`);
      if (t.clicked_at) flags.push(`clicked @ ${new Date(t.clicked_at).toLocaleString("de-DE")}`);
      if (t.bounced) flags.push("BOUNCED");
      console.log(`  ${t.sent_to_email ?? "?"}  (sent ${new Date(t.sent_at).toLocaleString("de-DE")})`);
      console.log(`    ${flags.join(" · ")}`);
    }
  }

  // Gesamt-Counts
  const { count: openedCount } = await sb
    .from("emails_sent")
    .select("id", { count: "exact", head: true })
    .not("opened_at", "is", null);
  const { count: clickedCount } = await sb
    .from("emails_sent")
    .select("id", { count: "exact", head: true })
    .not("clicked_at", "is", null);
  const { count: bouncedCount } = await sb
    .from("emails_sent")
    .select("id", { count: "exact", head: true })
    .eq("bounced", true);
  const { count: sentTotal } = await sb
    .from("emails_sent")
    .select("id", { count: "exact", head: true });

  console.log(`\n📈 Gesamtzahlen:`);
  console.log(`   emails_sent gesamt:  ${sentTotal ?? 0}`);
  console.log(`   davon opened:        ${openedCount ?? 0}`);
  console.log(`   davon clicked:       ${clickedCount ?? 0}`);
  console.log(`   davon bounced:       ${bouncedCount ?? 0}`);

  // Loop-Check: Wenn eine emails_sent in den letzten 24h MEHRMALS opened_at-update bekommen haette,
  // wuerde das auf eine Loop hindeuten. Wir haben nur 1 opened_at Spalte (kein updated_at-Counter),
  // aber wir koennen 24h-Frische pruefen: wie viele Updates kamen heute?
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: openedToday } = await sb
    .from("emails_sent")
    .select("id", { count: "exact", head: true })
    .gte("opened_at", dayAgo);
  const { count: clickedToday } = await sb
    .from("emails_sent")
    .select("id", { count: "exact", head: true })
    .gte("clicked_at", dayAgo);

  console.log(`\n⏱️  Letzte 24h:`);
  console.log(`   opened-Events:   ${openedToday ?? 0}`);
  console.log(`   clicked-Events:  ${clickedToday ?? 0}`);

  if ((openedToday ?? 0) > 1000 || (clickedToday ?? 0) > 1000) {
    console.log(`\n🚨 WARNUNG: Ungewoehnlich hohe Event-Anzahl in 24h. Loop-Verdacht!`);
  } else if ((openedToday ?? 0) === 0 && (sentTotal ?? 0) > 0) {
    console.log(`\nℹ️  Keine Events in den letzten 24h — entweder keine Aktivitaet oder Webhook nicht aktiv.`);
  } else {
    console.log(`\n✅ Aktivitaet im normalen Rahmen.`);
  }
}

run().catch((e) => {
  console.error("Fehler:", e);
  process.exit(1);
});
