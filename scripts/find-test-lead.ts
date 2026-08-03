import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await sb
    .from("primesocial_leads")
    .select("id,company_name,segment,workflow_step,status,email,private_email,instagram_handle,pitch_page_url,created_at")
    .not("instagram_data", "is", null)
    .in("segment", ["INKONSISTENT", "KEINEVIDEO", "WENIGREICHWEITE", "INAKTIV", "VIRALAUSREISSER"])
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}
run();
