import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await sb
    .from("emails_sent")
    .select("step_number,step_name,subject,body_text,pdf_url")
    .eq("lead_id", "a5a5c09e-ecfc-44d5-b8de-080f3afcd78d")
    .order("step_number", { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  for (const m of data ?? []) {
    console.log(`\n══════════════════════════════════════════════════════════════`);
    console.log(`STEP ${m.step_number} — ${m.step_name}`);
    console.log(`Subject: ${m.subject}`);
    if (m.pdf_url) console.log(`PDF: ${m.pdf_url}`);
    console.log(`──────────────────────────────────────────────────────────────`);
    console.log(m.body_text);
  }
}
run();
