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
    .select("id, slug, hero_meta, hero_headline, hero_subline_accent, hero_text")
    .eq("slug", "schreinerei-bergmann-gmbh-recruiting")
    .maybeSingle();
  if (error) { console.error(error); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}
run();
