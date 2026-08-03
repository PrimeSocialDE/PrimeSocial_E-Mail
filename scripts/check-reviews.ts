import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await sb
    .from("google_reviews")
    .select("reviewer_name, reviewer_image_url, rating, is_active, display_order")
    .order("display_order", { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  for (const r of data ?? []) {
    console.log(`${r.is_active ? "✓" : "✗"} [${r.display_order}] ${r.reviewer_name}`);
    console.log(`    image: ${r.reviewer_image_url ?? "(NULL)"}`);
  }
}
run();
