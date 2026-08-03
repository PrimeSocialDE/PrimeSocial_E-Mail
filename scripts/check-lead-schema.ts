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
    .select("*")
    .limit(1);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log("Lead-Spalten in Live-DB:");
  console.log(Object.keys(data?.[0] ?? {}).sort().join("\n"));
}
run();
