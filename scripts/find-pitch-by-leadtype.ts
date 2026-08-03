import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await sb
    .from("pitch_pages")
    .select("slug, status, lead_type, focus_area, company_name_display")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); process.exit(1); }
  for (const p of data ?? []) {
    console.log(`${p.status === "published" ? "✓" : "✗"} [${p.lead_type ?? "—"}] [${p.focus_area ?? "—"}] ${p.company_name_display ?? "—"}  ·  ${p.slug}`);
  }
}
run();
