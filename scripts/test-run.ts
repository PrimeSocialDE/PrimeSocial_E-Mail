/**
 * Live-Test: Schickt alle 5 Workflow-Mails an kontakt@primesocial.de.
 *
 * Was passiert (auf der echten Supabase-DB):
 *  1. Lead-E-Mail wird temporär auf TEST_EMAIL umgebogen
 *  2. Bestehende emails_sent + drafts für diesen Lead werden gelöscht
 *  3. Lead workflow wird zurückgesetzt (step=0, status=active, started_at=now)
 *  4. generateAndSaveAllDrafts() erzeugt 5 Drafts (Claude + Templates)
 *  5. Loop über 5 Drafts: scheduled_for=now, sendDueDrafts({onlyLeadId, skipTimeWindow})
 *     → Brevo verschickt echte Mail, Tracking-Pixel inkl.
 *
 * Ausführen: npx tsx scripts/test-run.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  getLead,
  updateLead,
  getEmailsForLead,
  getDraftsForLead,
  deleteDraftsForLead,
  updateDraft,
} from "../lib/supabase";
import { generateAndSaveAllDrafts, sendDueDrafts } from "../lib/sequences";
import { createClient } from "@supabase/supabase-js";

const LEAD_ID = "a5a5c09e-ecfc-44d5-b8de-080f3afcd78d"; // Schreinerei Bergmann GmbH (WENIGREICHWEITE, hat Pitch-Page)
const TEST_EMAIL = "kontakt@primesocial.de";
const INTERVAL_MS = 90 * 1000; // 90 Sekunden Abstand zwischen Mails

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// emails_sent-Einträge dieses Leads direkt via Supabase-Client löschen
// (lib/supabase exportiert dafür keinen Helper)
async function deleteEmailsForLead(leadId: string): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!;
  const client = createClient(url, key);
  const { data, error } = await client
    .from("emails_sent")
    .delete()
    .eq("lead_id", leadId)
    .select("id");
  if (error) throw new Error(`emails_sent löschen fehlgeschlagen: ${error.message}`);
  return data?.length ?? 0;
}

async function run() {
  console.log("\n🚀 Live-Test 5-Step Sequenz");
  console.log(`   Lead-ID:  ${LEAD_ID}`);
  console.log(`   Empfänger: ${TEST_EMAIL}`);
  console.log(`   Abstand:  ${INTERVAL_MS / 1000}s zwischen Mails\n`);

  // ── 1. Lead laden ──────────────────────────────────────
  const lead = await getLead(LEAD_ID);
  console.log(`📋 Lead: ${lead.company_name}`);
  console.log(`   Segment: ${lead.segment}`);
  console.log(`   Original-Email: ${lead.email ?? "—"} | private: ${lead.private_email ?? "—"}`);
  console.log(`   Status: ${lead.status}, Step: ${lead.workflow_step}`);

  if (!lead.instagram_data) {
    console.error("❌ Lead hat keine Instagram-Daten — Abbruch (sonst kein Claude-Content)");
    process.exit(1);
  }
  if (lead.segment === "KEININSTAGRAM" || lead.segment === "KEINFIT" || lead.segment === "SOLIDE") {
    console.error(`❌ Segment ${lead.segment} wird in sendDueDrafts geskipped — Test sinnlos`);
    process.exit(1);
  }

  // ── 2. Pre-Setup: Lead zurücksetzen ────────────────────
  console.log("\n🧹 Pre-Setup:");

  const existingEmails = await getEmailsForLead(LEAD_ID);
  if (existingEmails.length > 0) {
    const deleted = await deleteEmailsForLead(LEAD_ID);
    console.log(`   ✓ ${deleted} bestehende emails_sent-Einträge gelöscht`);
  } else {
    console.log("   ✓ Keine bestehenden emails_sent");
  }

  const existingDrafts = await getDraftsForLead(LEAD_ID);
  if (existingDrafts.length > 0) {
    await deleteDraftsForLead(LEAD_ID);
    console.log(`   ✓ ${existingDrafts.length} bestehende drafts gelöscht`);
  } else {
    console.log("   ✓ Keine bestehenden drafts");
  }

  await updateLead(LEAD_ID, {
    private_email: TEST_EMAIL,
    email: TEST_EMAIL,
    workflow_step: 0,
    status: "active",
    workflow_started_at: new Date().toISOString(),
    next_touchpoint_at: null,
    pause_reason: null,
  });
  console.log(`   ✓ Lead-Mail auf ${TEST_EMAIL} umgebogen, workflow zurückgesetzt`);

  // ── 3. Drafts generieren ───────────────────────────────
  console.log("\n🤖 Generiere alle 5 Drafts (3× Claude, 2× Template)...");
  const refreshedLead = await getLead(LEAD_ID);
  const drafts = await generateAndSaveAllDrafts(refreshedLead);
  console.log(`   ✓ ${drafts.length} Drafts erstellt`);
  drafts.forEach((d) => {
    console.log(`     Step ${d.step_number}: "${d.subject}"`);
  });

  if (drafts.length !== 5) {
    console.error(`\n❌ Erwartet 5 Drafts, bekommen ${drafts.length} — Abbruch`);
    process.exit(1);
  }

  // ── 4. Versand-Loop ────────────────────────────────────
  console.log("\n📧 Starte Versand:\n");
  const sortedDrafts = [...drafts].sort((a, b) => a.step_number - b.step_number);

  for (let i = 0; i < sortedDrafts.length; i++) {
    const draft = sortedDrafts[i];
    console.log(`── Step ${draft.step_number}/5: ${draft.step_name} ─────────`);
    console.log(`   📝 ${draft.subject}`);

    // scheduled_for auf jetzt setzen, damit sendDueDrafts ihn aufgreift
    await updateDraft(draft.id, { scheduled_for: new Date().toISOString() });

    const result = await sendDueDrafts(1, {
      onlyLeadId: LEAD_ID,
      skipTimeWindow: true,
    });

    if (result.sent === 1) {
      console.log(`   ✅ Gesendet`);
    } else {
      console.log(`   ❌ Nicht gesendet. Fehler:`);
      result.errors.forEach((e) => console.log(`      - ${e}`));
    }

    if (i < sortedDrafts.length - 1) {
      console.log(`   ⏰ Warte ${INTERVAL_MS / 1000}s bis Step ${draft.step_number + 1}...\n`);
      await sleep(INTERVAL_MS);
    }
  }

  // ── 5. Abschluss-Status ────────────────────────────────
  const finalLead = await getLead(LEAD_ID);
  const finalEmails = await getEmailsForLead(LEAD_ID);
  console.log(`\n✅ Test-Run beendet`);
  console.log(`   Mails versendet: ${finalEmails.length}`);
  console.log(`   Lead-Status:     ${finalLead.status} (pause_reason: ${finalLead.pause_reason ?? "—"})`);
  console.log(`   Workflow-Step:   ${finalLead.workflow_step}`);
  console.log(`\n   Schau in die Inbox: ${TEST_EMAIL}`);
}

run().catch((err) => {
  console.error("\n💥 Fehler im Test-Run:", err);
  process.exit(1);
});
