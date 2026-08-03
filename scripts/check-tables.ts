import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  // Probiere verschiedene Draft-Tabellen-Namen
  for (const t of ["email_drafts", "primesocial_email_drafts", "drafts", "email_draft"]) {
    const { error } = await sb.from(t).select("id").limit(1);
    console.log(`${t}: ${error ? "❌ " + error.message : "✅ vorhanden"}`);
  }
  // Test getPendingDrafts-Aufruf
  console.log("\nemails_sent prüfen:");
  const { data, error } = await sb.from("emails_sent").select("id").limit(1);
  console.log(error ? "❌ " + error.message : `✅ vorhanden (${data?.length} sample)`);
}
run();
